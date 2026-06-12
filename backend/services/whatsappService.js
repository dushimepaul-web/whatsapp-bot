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
const WhatsappSession = require("../models/WhatsappSession");
const logger = require("../utils/logger");
const moderation = require("../whatsapp/moderation");
const commands = require("../whatsapp/commands");
const notifier = require("../utils/notifier");
const broadcastManager = require("../whatsapp/broadcastManager");

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.baseAuthDir = path.join(__dirname, "..", "auth_info");
  }

  _getSession(userId) {
    const key = userId.toString();
    if (!this.sessions.has(key)) {
      this.sessions.set(key, {
        sock: null,
        userId: userId,
        isConnected: false,
        isConnecting: false,
        isPairing: false,
        qrCallback: null,
        statusCallback: null,
        pairingCodeCallback: null,
        authDir: path.join(this.baseAuthDir, key),
      });
    }
    return this.sessions.get(key);
  }

  _removeSession(userId) {
    const key = userId.toString();
    this.sessions.delete(key);
  }

  clearAuthDir(userId) {
    const session = this._getSession(userId);
    const dir = session.authDir;
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      fs.rmSync(full, { recursive: true, force: true });
    }
  }

  async connect(userId, fresh = false, pairingPhone = null) {
    const session = this._getSession(userId);
    if (session.isConnecting) {
      logger.warn(`Connexion déjà en cours pour user=${userId}, ignoré`);
      return;
    }
    session.isConnecting = true;
    session.isConnected = false;

    if (session.sock) {
      try { session.sock.end(undefined); } catch (e) { logger.warn(`Erreur fermeture ancien socket user=${userId}:`, e); }
      session.sock = null;
    }
    if (fresh) {
      this.clearAuthDir(userId);
    }

    let state, saveCreds, version;
    try {
      const auth = await useMultiFileAuthState(session.authDir);
      state = auth.state;
      saveCreds = auth.saveCreds;
      version = (await fetchLatestBaileysVersion()).version;
    } catch (err) {
      logger.error(`Erreur init auth WhatsApp user=${userId}:`, err);
      session.isConnecting = false;
      if (session.statusCallback) session.statusCallback("disconnected");
      session.sock = null;
      return;
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: ["Chrome", "120.0.0", "Windows"],
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      generateHighQualityLinkPreview: true,
      connectTimeoutMs: 60000,
      ...(pairingPhone ? { getMessage: async () => undefined } : {}),
    });

    session.sock = sock;
    session.isPairing = !!pairingPhone;
    let pairingRequested = false;

    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      try {
        if (pairingPhone && qr && !pairingRequested) {
          pairingRequested = true;
          session.isPairing = true;
          try {
            const code = await sock.requestPairingCode(pairingPhone);
            const displayCode = code.match(/.{1,4}/g)?.join("-") || code;
            logger.info(`Code d'appariement pour ${pairingPhone} (user=${userId}): ${displayCode}`);
            if (session.pairingCodeCallback) session.pairingCodeCallback(displayCode);
            const s = await this._getSessionDoc(userId);
            if (s) {
              s.pairingCode = displayCode;
              s.status = "connecting";
              await s.save();
            }
          } catch (err) {
            logger.error(`Erreur pairing code pour ${pairingPhone} (user=${userId}): ${err.message || err}`);
            if (session.pairingCodeCallback) session.pairingCodeCallback(null);
          }
        }

        if (qr && !session.isPairing) {
          const qrString = await QRCode.toDataURL(qr);
          logger.info(`QR code disponible pour user=${userId}`);
          if (session.qrCallback) session.qrCallback(qrString);
          const s = await this._getSessionDoc(userId);
          if (s) {
            s.qrCode = qrString;
            s.status = "connecting";
            await s.save();
          }
        }

        if (connection === "open") {
          session.isConnected = true;
          session.isConnecting = false;
          session.isPairing = false;
          const phone = sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : null;
          if (session.statusCallback) session.statusCallback("connected");
          broadcastManager.startMasterPolling(sock, userId);

          const s = await this._getSessionDoc(userId);
          if (s) {
            s.status = "connected";
            s.qrCode = null;
            s.phone = phone;
            s.pairingCode = null;
            await s.save();
          }

          logger.info(`WhatsApp connecté pour user=${userId}: ${phone}`);
          await logger.db({
            userId,
            type: "system",
            action: "whatsapp_connected",
            details: { phone },
          });

          notifier.notifyConnect(userId, phone).catch(() => {});

          await this.syncGroups(userId);
        }

        if (connection === "close") {
          const wasConnected = session.isConnected;
          session.isConnected = false;
          session.isConnecting = false;
          session.isPairing = false;
          broadcastManager.stopMasterPolling(userId);
          if (session.statusCallback) session.statusCallback("disconnected");

          let reasonCode = undefined;
          let reasonText = "inconnu";
          if (lastDisconnect?.error) {
            const boom = new Boom(lastDisconnect.error);
            reasonCode = boom?.output?.statusCode;
            reasonText = lastDisconnect.error?.message || lastDisconnect.error?.toString() || "inconnu";
          }

          logger.error(`WhatsApp déconnecté user=${userId}. Code: ${reasonCode}, Raison: ${reasonText}`);

          const s = await this._getSessionDoc(userId);
          const phone = s?.phone || null;
          if (s) {
            s.status = "disconnected";
            await s.save();
          }

          if (wasConnected) {
            notifier.notifyDisconnect(userId, phone, reasonText).catch(() => {});
          }

          if (reasonCode === DisconnectReason.restartRequired) {
            logger.info(`Restart requis pour user=${userId}. Reconnexion automatique...`);
            await delay(3000);
            session.isConnecting = false;
            this.connect(userId, false).catch((e) => logger.error(`Échec reconnexion user=${userId}:`, e));
          } else if (wasConnected && reasonCode && reasonCode !== DisconnectReason.loggedOut) {
            logger.info(`Reconnexion dans 3s pour user=${userId}...`);
            await delay(3000);
            session.isConnecting = false;
            this.connect(userId, false).catch((e) => logger.error(`Échec reconnexion user=${userId}:`, e));
          } else if (reasonCode === DisconnectReason.loggedOut) {
            logger.error(`Session expirée user=${userId}. Nettoie auth_info.`);
            this.clearAuthDir(userId);
            if (s) {
              s.qrCode = null;
              s.phone = null;
              await s.save();
            }
          } else {
            logger.warn(`Déconnecté user=${userId} (${reasonText}).`);
          }
        }
      } catch (err) {
        logger.error(`Erreur connection.update user=${userId}:`, err);
      }
    });

    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
        logger.info(`Credentials WhatsApp sauvegardés pour user=${userId}`);
      } catch (err) {
        logger.error(`Erreur creds.update user=${userId}:`, err);
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      try {
        if (!messages || !Array.isArray(messages)) return;
        const settings = await Setting.findOne({ userId });
        for (const msg of messages) {
          if (!msg || !msg.message) continue;
          const from = msg.key.remoteJid;
          if (!from) continue;
          if (!from.endsWith("@g.us")) continue;

          if (!msg.key.fromMe) {
            await commands.handle(sock, msg, from, userId);
          }

          if (!msg.key.fromMe && settings?.moderationEnabled) {
            await moderation.handleMessage(sock, msg, from, userId);
          }

          if (!msg.key.fromMe && settings?.autoReplies?.length) {
            await this.handleAutoReplies(sock, msg, from, userId, settings);
          }

          broadcastManager.handleIncoming(sock, msg, from, userId);
        }
      } catch (e) {
        logger.error(`Erreur messages.upsert user=${userId}:`, e);
      }
    });

    sock.ev.on("group-participants.update", async (ev) => {
      try {
        const { id, participants, action } = ev || {};
        if (!id || !participants) return;
        if (action === "add") {
          const settings = await Setting.findOne({ userId });
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
        logger.error(`Erreur group-participants.update user=${userId}:`, err);
      }
    });

    sock.ev.on("call", async (calls) => {
      if (!calls || !Array.isArray(calls)) return;
      const settings = await Setting.findOne({ userId });
      if (settings?.autoRejectCalls) {
        for (const call of calls) {
          try {
            await sock.rejectCall(call.id, call.from);
            logger.info(`Appel rejeté de ${call.from} (user=${userId})`);
          } catch (err) {
            logger.error(`Erreur rejet appel user=${userId}: ${err}`);
          }
        }
      }
    });

    session.isConnecting = false;
    return sock;
  }

  async disconnect(userId) {
    const session = this._getSession(userId);
    session.isConnecting = false;
    session.isConnected = false;
    if (session.sock) {
      try { session.sock.end(undefined); } catch (e) { logger.warn(`Erreur fermeture socket disconnect user=${userId}:`, e); }
      session.sock = null;
    }
    const s = await this._getSessionDoc(userId);
    if (s) {
      s.status = "disconnected";
      await s.save();
    }
  }

  async _getSessionDoc(userId) {
    try {
      return await WhatsappSession.findOne({ userId });
    } catch (e) {
      logger.warn(`Erreur getSession user=${userId}:`, e);
      return null;
    }
  }

  async getStatus(userId) {
    const session = this._getSession(userId);
    return {
      connected: session.isConnected,
      phone: session.sock?.user?.id ? session.sock.user.id.split("@")[0].split(":")[0] : null,
      user: session.sock?.user,
    };
  }

  async syncGroups(userId) {
    const session = this._getSession(userId);
    if (!session.sock) return;
    try {
      const botPhone = session.sock.user?.id ? session.sock.user.id.split("@")[0].split(":")[0] : null;
      const groups = await session.sock.groupFetchAllParticipating();
      const entries = Object.entries(groups);
      const processedGroupIds = [];
      const BATCH_SIZE = 50;
      const BATCH_DELAY = 2000;

      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        logger.info(`Sync: traitement lot ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entries.length / BATCH_SIZE)} (${batch.length} groupes)`);

        for (const [id, g] of batch) {
          processedGroupIds.push(id);
          const metadata = g;
          const admins = (metadata.participants || []).filter((p) => p.admin).map((p) => p.id);
          const botIsAdmin = botPhone ? admins.some((a) => a.includes(botPhone)) : false;
          const updateData = {
            userId,
            name: metadata.subject,
            description: metadata.desc || "",
            owner: metadata.owner,
            memberCount: metadata.participants?.length || 0,
            adminCount: admins.length,
            botIsAdmin,
            lastSync: new Date(),
          };
          if (/nufotec/i.test(metadata.subject)) {
            updateData.isRestricted = true;
          }
          await Group.findOneAndUpdate(
            { groupId: id, userId },
            updateData,
            { upsert: true, new: true }
          );

          const participants = metadata.participants || [];
          for (let j = 0; j < participants.length; j += 100) {
            const memberBatch = participants.slice(j, j + 100);
            const memberJids = memberBatch.map(p => p.id);
            if (j === 0) {
              await Member.deleteMany({ groupId: id, userId, jid: { $nin: participants.map(p => p.id) } });
            }
            const ops = memberBatch.map(p => ({
              updateOne: {
                filter: { jid: p.id, groupId: id, userId },
                update: {
                  $set: {
                    userId,
                    name: p.name || "",
                    pushName: p.pushName || "",
                    isAdmin: p.admin === "admin" || p.admin === "superadmin",
                    isSuperAdmin: p.admin === "superadmin",
                    lastSeen: new Date(),
                  },
                },
                upsert: true,
              },
            }));
            await Member.bulkWrite(ops);
          }
        }

        if (i + BATCH_SIZE < entries.length) {
          logger.info(`Sync: pause de ${BATCH_DELAY}ms entre les lots...`);
          await new Promise((r) => setTimeout(r, BATCH_DELAY));
        }
      }

      await Member.deleteMany({ groupId: { $nin: processedGroupIds }, userId });
      logger.info(`Synchronisation user=${userId}: ${entries.length} groupes`);
      await logger.db({
        userId,
        type: "system",
        action: "groups_synced",
        details: { count: entries.length },
      });
    } catch (err) {
      logger.error(`Erreur sync groupes user=${userId}:`, err);
    }
  }

  async syncGroupMetadataOnDemand(userId, groupId) {
    const session = this._getSession(userId);
    if (!session.sock) return null;
    try {
      const botPhone = session.sock.user?.id ? session.sock.user.id.split("@")[0].split(":")[0] : null;
      const metadata = await session.sock.groupMetadata(groupId);
      const admins = (metadata.participants || []).filter((p) => p.admin).map((p) => p.id);
      const botIsAdmin = botPhone ? admins.some((a) => a.includes(botPhone)) : false;

      const updateData = {
        userId,
        name: metadata.subject,
        description: metadata.desc || "",
        owner: metadata.owner,
        memberCount: metadata.participants?.length || 0,
        adminCount: admins.length,
        botIsAdmin,
        lastSync: new Date(),
      };
      if (/nufotec/i.test(metadata.subject)) {
        updateData.isRestricted = true;
      }
      const group = await Group.findOneAndUpdate(
        { groupId, userId },
        updateData,
        { upsert: true, new: true }
      );

      const currentParticipantJids = (metadata.participants || []).map(p => p.id);
      await Member.deleteMany({ groupId, userId, jid: { $nin: currentParticipantJids } });

      for (const p of metadata.participants || []) {
        await Member.findOneAndUpdate(
          { jid: p.id, groupId, userId },
          {
            userId,
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
      logger.error(`Erreur syncGroupMetadataOnDemand pour ${groupId} user=${userId}: ${err.message}`);
      return null;
    }
  }

  async handleAutoReplies(sock, msg, from, userId, settings) {
    try {
      const rawContent = msg.message;
      const text = rawContent?.conversation || rawContent?.extendedTextMessage?.text || "";
      if (!text) return;

      for (const reply of settings.autoReplies) {
        if (!reply.keyword || !reply.response) continue;

        let match = false;
        if (reply.exactMatch) {
          match = text.toLowerCase() === reply.keyword.toLowerCase();
        } else {
          match = text.toLowerCase().includes(reply.keyword.toLowerCase());
        }

        if (!match) continue;

        if (reply.groupIds?.length && !reply.groupIds.includes(from)) continue;

        await sock.sendMessage(from, { text: reply.response });
        logger.info(`Auto-réponse déclenchée: "${reply.keyword}" dans ${from}`);
        break;
      }
    } catch (err) {
      logger.error(`Erreur autoReply: ${err.message}`);
    }
  }

  getSocket(userId) {
    const session = this._getSession(userId);
    return session.sock || null;
  }

  getConnectedPhones() {
    const result = {};
    for (const [key, session] of this.sessions.entries()) {
      if (session.isConnected && session.sock?.user?.id) {
        result[key] = session.sock.user.id.split("@")[0].split(":")[0];
      }
    }
    return result;
  }

  setQrCallback(userId, fn) {
    const session = this._getSession(userId);
    session.qrCallback = fn;
  }

  setStatusCallback(userId, fn) {
    const session = this._getSession(userId);
    session.statusCallback = fn;
  }

  setPairingCodeCallback(userId, fn) {
    const session = this._getSession(userId);
    session.pairingCodeCallback = fn;
  }

  async getAllActiveSessions() {
    try {
      return await WhatsappSession.find({ status: { $in: ["connected", "connecting"] } });
    } catch (e) {
      logger.error("Erreur getAllActiveSessions:", e);
      return [];
    }
  }

  async disconnectAll() {
    for (const [key] of this.sessions.entries()) {
      await this.disconnect(key);
    }
  }

  getConnectedUserIds() {
    const ids = [];
    for (const [key, session] of this.sessions.entries()) {
      if (session.isConnected && session.sock) {
        ids.push(key);
      }
    }
    return ids;
  }

  async syncAllGroups() {
    const ids = this.getConnectedUserIds();
    for (const userId of ids) {
      try {
        logger.info(`Sync auto des groupes pour user=${userId}...`);
        await this.syncGroups(userId);
      } catch (e) {
        logger.error(`Erreur sync auto user=${userId}:`, e);
      }
    }
    return ids.length;
  }
}

module.exports = new WhatsAppService();
