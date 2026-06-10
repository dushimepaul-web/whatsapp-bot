const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  delay,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const QRCode = require("qrcode");
const Group = require("../models/Group");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const Log = require("../models/Log");
const logger = require("../utils/logger");
const moderation = require("../whatsapp/moderation");
const broadcastManager = require("../whatsapp/broadcastManager");

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.qrCallback = null;
    this.statusCallback = null;
    this.pairingCodeCallback = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isPairing = false;
    this.authDir = path.join(__dirname, "..", "auth_info");
  }

  async connect(userId, fresh = false, pairingPhone = null) {
    if (this.isConnecting) {
      logger.warn("Connexion déjà en cours, ignoré");
      return;
    }
    this.isConnecting = true;
    this.isConnected = false;

    if (this.sock) {
      try { this.sock.end(undefined); } catch (e) { logger.warn("Erreur fermeture ancien socket:", e); }
      this.sock = null;
    }
    if (fresh && fs.existsSync(this.authDir)) {
      fs.rmSync(this.authDir, { recursive: true, force: true });
    }

    let state, saveCreds, version;
    try {
      const auth = await useMultiFileAuthState(this.authDir);
      state = auth.state;
      saveCreds = auth.saveCreds;
      version = (await fetchLatestBaileysVersion()).version;
    } catch (err) {
      logger.error("Erreur init auth WhatsApp:", err);
      this.isConnecting = false;
      if (this.statusCallback) this.statusCallback("disconnected");
      this.sock = null;
      return;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: pairingPhone
        ? ["Chrome", "120.0.0", "Windows"]
        : ["Chrome", "120.0.0", "Windows"],
      markOnlineOnConnect: true,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      ...(pairingPhone ? {
        getMessage: async () => undefined,
      } : {}),
    });

    this.sock = sock;
    this.userId = userId;
    this.isPairing = !!pairingPhone;
    let pairingRequested = false;

    sock.ev.on("messages.update", async (updates) => {
      if (!updates || !Array.isArray(updates)) return;
      for (const m of updates) {
        if (m.key?.fromMe && m.key?.remoteJid?.endsWith("@g.us")) {
          logger.info(`messages.update: message mis à jour dans groupe ${m.key.remoteJid}`);
        }
      }
    });
    sock.ev.on("chats.upsert", async (chats) => {
      if (!chats || !Array.isArray(chats)) return;
      for (const c of chats) {
        if (c.id?.endsWith("@g.us")) {
          logger.info(`chats.upsert: chat groupe mis à jour: ${c.id} conversationTimestamp: ${c.conversationTimestamp}`);
        }
      }
    });

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        if (pairingPhone && qr && !pairingRequested) {
          pairingRequested = true;
          this.isPairing = true;
          try {
            const code = await sock.requestPairingCode(pairingPhone);
            const displayCode = code.match(/.{1,4}/g)?.join("-") || code;
            logger.info(`Code d'appariement pour ${pairingPhone}: ${displayCode}`);
            if (this.pairingCodeCallback) this.pairingCodeCallback(displayCode);
            const session = await this.getSession();
            if (session) {
              session.pairingCode = displayCode;
              session.status = "connecting";
              await session.save();
            }
            logger.info(`Code d'appariement: ${displayCode}`);
          } catch (err) {
            logger.error(`Erreur pairing code: ${err.message || err}`);
            if (this.pairingCodeCallback) this.pairingCodeCallback(null);
          }
        }

        if (qr && !this.isPairing) {
          const qrString = await QRCode.toDataURL(qr);
          logger.info("QR code disponible pour scan");
          if (this.qrCallback) this.qrCallback(qrString);
          const session = await this.getSession();
          if (session) {
            session.qrCode = qrString;
            session.status = "connecting";
            await session.save();
          }
          logger.info("QR code affiché dans le terminal");
        }

        if (connection === "open") {
          this.isConnected = true;
          this.isConnecting = false;
          this.isPairing = false;
          const phone = sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : null;
          if (this.statusCallback) this.statusCallback("connected");
          broadcastManager.startMasterPolling(sock, this.userId);

          const session = await this.getSession();
          if (session) {
            session.status = "connected";
            session.qrCode = null;
            session.phone = phone;
            session.pairingCode = null;
            await session.save();
          }

          logger.info(`✅ WhatsApp connecté: ${phone}`);
          await logger.db({
            userId: this.userId,
            type: "system",
            action: "whatsapp_connected",
            details: { phone },
          });

          await this.syncGroups();
        }

        if (connection === "close") {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.isConnecting = false;
          this.isPairing = false;
          broadcastManager.stopMasterPolling();
          if (this.statusCallback) this.statusCallback("disconnected");

          let reasonCode = undefined;
          let reasonText = "inconnu";
          if (lastDisconnect?.error) {
            const boom = new Boom(lastDisconnect.error);
            reasonCode = boom?.output?.statusCode;
            reasonText = lastDisconnect.error?.message || lastDisconnect.error?.toString() || "inconnu";
          }

          logger.error(`WhatsApp déconnecté. Code: ${reasonCode}, Raison: ${reasonText}`);

          const session = await this.getSession();
          if (session) {
            session.status = "disconnected";
            await session.save();
          }

          if (reasonCode === DisconnectReason.restartRequired) {
            logger.info("Restart requis. Reconnexion automatique...");
            await delay(3000);
            this.isConnecting = false;
            this.connect(userId, false).catch((e) => logger.error("Échec reconnexion:", e));
          } else if (wasConnected && reasonCode && reasonCode !== DisconnectReason.loggedOut) {
            logger.info("Reconnexion dans 3s...");
            await delay(3000);
            this.isConnecting = false;
            this.connect(userId, false).catch((e) => logger.error("Échec reconnexion:", e));
          } else if (reasonCode === DisconnectReason.loggedOut) {
            logger.error("Session expirée. Nettoie auth_info et scanne un nouveau QR.");
            if (fs.existsSync(this.authDir)) {
              fs.rmSync(this.authDir, { recursive: true, force: true });
            }
            if (session) {
              session.qrCode = null;
              session.phone = null;
              await session.save();
            }
          } else {
            logger.warn(`Déconnecté (${reasonText}). Rafraîchis la page et clique Connecter.`);
          }
        }
      } catch (err) {
        logger.error("Erreur connection.update:", err);
      }
    });

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        logger.info("Credentials WhatsApp sauvegardés");
      } catch (err) {
        logger.error("Erreur creds.update:", err);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      try {
        if (!messages || !Array.isArray(messages)) return;
        const settings = await Setting.findOne({ userId: this.userId });
        for (const msg of messages) {
          if (!msg || !msg.message) continue;
          const from = msg.key.remoteJid;
          if (!from) continue;
          if (!from.endsWith("@g.us")) continue;
          await logger.db({
            userId: this.userId,
            type: "system",
            action: "message_received",
            details: { fromMe: msg.key.fromMe, from, type, participant: msg.key.participant, msgType: Object.keys(msg.message) },
          });
          if (!msg.key.fromMe && settings?.moderationEnabled) {
            await moderation.handleMessage(this.sock, msg, from, this.userId);
          }
          broadcastManager.handleIncoming(this.sock, msg, from, this.userId);
        }
      } catch (e) {
        logger.error("Erreur messages.upsert:", e);
      }
    });

    sock.ev.on("group-participants.update", async (ev) => {
      try {
        const { id, participants, action } = ev || {};
        if (!id || !participants) return;
        if (action === "add") {
          const settings = await Setting.findOne({ userId: this.userId });
          if (settings?.welcomeMessage) {
            for (const p of participants) {
              const jid = typeof p === "string" ? p : p.jid;
              if (!jid) continue;
              await sock.sendMessage(id, {
                text: settings.welcomeMessage.replace("{user}", `@${jid.split("@")[0]}`),
                mentions: [jid],
              });
            }
          }
        }
      } catch (err) {
        logger.error("Erreur group-participants.update:", err);
      }
    });

    sock.ev.on("call", async (calls) => {
      if (!calls || !Array.isArray(calls)) return;
      const settings = await Setting.findOne({ userId: this.userId });
      if (settings?.autoRejectCalls) {
        for (const call of calls) {
          try {
            await sock.rejectCall(call.id, call.from);
            logger.info(`Appel rejeté de ${call.from}`);
          } catch (err) {
            logger.error(`Erreur rejet appel: ${err}`);
          }
        }
      }
    });

    this.isConnecting = false;
    return sock;
  }

  async disconnect() {
    this.isConnecting = false;
    this.isConnected = false;
    if (this.sock) {
      try { this.sock.end(undefined); } catch (e) { logger.warn("Erreur fermeture socket disconnect:", e); }
      this.sock = null;
    }
    const session = await this.getSession();
    if (session) {
      session.status = "disconnected";
      await session.save();
    }
  }

  async getSession() {
    if (!this.userId) return null;
    const WhatsappSession = require("../models/WhatsappSession");
    try {
      return await WhatsappSession.findOne({ userId: this.userId });
    } catch (e) {
      logger.warn("Erreur getSession:", e);
      return null;
    }
  }

  async getStatus() {
    return {
      connected: this.isConnected,
      phone: this.sock?.user?.id ? this.sock.user.id.split("@")[0].split(":")[0] : null,
      user: this.sock?.user,
    };
  }

  async syncGroups() {
    if (!this.sock) return;
    try {
      const botPhone = this.sock.user?.id ? this.sock.user.id.split("@")[0].split(":")[0] : null;
      const groups = await this.sock.groupFetchAllParticipating();
      const processedGroupIds = [];
      for (const [id, g] of Object.entries(groups)) {
        processedGroupIds.push(id);
        const metadata = g;
        const admins = (metadata.participants || []).filter((p) => p.admin).map((p) => p.id);
        const botIsAdmin = botPhone ? admins.some((a) => a.includes(botPhone)) : false;
        await Group.findOneAndUpdate(
          { groupId: id },
          {
            name: metadata.subject,
            description: metadata.desc || "",
            owner: metadata.owner,
            memberCount: metadata.participants?.length || 0,
            adminCount: admins.length,
            botIsAdmin,
            lastSync: new Date(),
          },
          { upsert: true, new: true }
        );
        const participantIds = (metadata.participants || []).map(p => p.id);
        await Member.deleteMany({ groupId: id, jid: { $nin: participantIds } });
        for (const p of metadata.participants || []) {
          await Member.findOneAndUpdate(
            { jid: p.id, groupId: id },
            {
              name: p.name || "",
              pushName: p.pushName || "",
              isAdmin: p.admin === "admin" || p.admin === "superadmin",
              isSuperAdmin: p.admin === "superadmin",
              lastSeen: new Date(),
            },
            { upsert: true, new: true }
          );
        }
      }
      await Member.deleteMany({ groupId: { $nin: processedGroupIds } });
      logger.info(`Synchronisation: ${Object.keys(groups).length} groupes`);
      await logger.db({
        userId: this.userId,
        type: "system",
        action: "groups_synced",
        details: { count: Object.keys(groups).length },
      });
    } catch (err) {
      logger.error("Erreur sync groupes:", err);
    }
  }

  async syncGroupMetadataOnDemand(groupId) {
    if (!this.sock) return null;
    try {
      const botPhone = this.sock.user?.id ? this.sock.user.id.split("@")[0].split(":")[0] : null;
      const metadata = await this.sock.groupMetadata(groupId);
      const admins = (metadata.participants || []).filter((p) => p.admin).map((p) => p.id);
      const botIsAdmin = botPhone ? admins.some((a) => a.includes(botPhone)) : false;
      
      const group = await Group.findOneAndUpdate(
        { groupId },
        {
          name: metadata.subject,
          description: metadata.desc || "",
          owner: metadata.owner,
          memberCount: metadata.participants?.length || 0,
          adminCount: admins.length,
          botIsAdmin,
          lastSync: new Date(),
        },
        { upsert: true, new: true }
      );

      // Supprimer les membres locaux qui ne sont plus dans le groupe
      const currentParticipantJids = (metadata.participants || []).map(p => p.id);
      await Member.deleteMany({ groupId, jid: { $nin: currentParticipantJids } });

      for (const p of metadata.participants || []) {
        await Member.findOneAndUpdate(
          { jid: p.id, groupId },
          {
            name: p.name || "",
            pushName: p.pushName || "",
            isAdmin: p.admin === "admin" || p.admin === "superadmin",
            isSuperAdmin: p.admin === "superadmin",
            lastSeen: new Date(),
          },
          { upsert: true, new: true }
        );
      }
      return group;
    } catch (err) {
      logger.error(`Erreur syncGroupMetadataOnDemand pour ${groupId}: ${err.message}`);
      return null;
    }
  }

  setQrCallback(fn) {
    this.qrCallback = fn;
  }

  setStatusCallback(fn) {
    this.statusCallback = fn;
  }

  setPairingCodeCallback(fn) {
    this.pairingCodeCallback = fn;
  }

  getSocket() {
    return this.sock;
  }
}

module.exports = new WhatsAppService();
