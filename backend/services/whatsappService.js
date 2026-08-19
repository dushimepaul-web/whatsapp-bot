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

class WhatsAppService {
  constructor() {
    this.sessions = new Map();
    this.baseAuthDir = path.join(__dirname, "..", "auth_info");
    this.RECONNECT_BASE_DELAY = 3000;
    this.RECONNECT_MAX_DELAY = 30000;
    this.RECONNECT_MAX_ATTEMPTS = 15;
    this._settingsCache = new Map();
  }

  async _getSettings(userId) {
    const now = Date.now();
    const cached = this._settingsCache.get(userId);
    if (cached && now - cached.ts < 10000) return cached.settings;
    let settings;
    try {
      settings = await Setting.findOne({ userId });
    } catch (e) {
      logger.warn(`Erreur getSettings user=${userId}:`, e);
    }
    this._settingsCache.set(userId, { settings: settings || null, ts: now });
    return settings || null;
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
        reconnectCount: 0,
        reconnectTimer: null,
        syncTimer: null,
        lastSyncAt: 0,
        syncing: false,
      });
    }
    return this.sessions.get(key);
  }

  _isBotAdmin(sock, admins) {
    if (!sock || !admins || !admins.length) return false;
    const identities = new Set();
    const addJid = (jid) => {
      if (!jid) return;
      const user = jid.split(":")[0];
      identities.add(user);
      identities.add(user.split("@")[0]);
    };
    addJid(sock.user?.id);
    addJid(sock.authState?.creds?.me?.id);
    addJid(sock.authState?.creds?.me?.lid);
    for (const adminJid of admins) {
      const user = adminJid.split(":")[0];
      if (identities.has(user) || identities.has(user.split("@")[0])) return true;
    }
    return false;
  }

  _clearReconnectTimer(session) {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
  }

  _scheduleReconnect(userId) {
    const session = this._getSession(userId);
    this._clearReconnectTimer(session);

    session.reconnectCount++;
    const delay = Math.min(
      this.RECONNECT_BASE_DELAY * Math.pow(2, session.reconnectCount),
      this.RECONNECT_MAX_DELAY
    );

    logger.info(`Reconnexion planifiée pour user=${userId} (tentative ${session.reconnectCount}) dans ${delay}ms`);

    session.reconnectTimer = setTimeout(async () => {
      session.reconnectTimer = null;
      const s = this._getSession(userId);
      if (s.isConnecting || s.isConnected) return;
      this.connect(userId, false).catch(e =>
        logger.error(`Échec reconnexion user=${userId}:`, e.message || e)
      );
    }, delay);
  }

  _scheduleGroupSync(userId) {
    const session = this._getSession(userId);
    if (session.syncTimer) clearTimeout(session.syncTimer);
    session.syncTimer = setTimeout(async () => {
      session.syncTimer = null;
      const now = Date.now();
      if (now - (session.lastSyncAt || 0) < 600000) return;
      session.lastSyncAt = now;
      try {
        await this.syncGroups(userId);
      } catch (e) {
        logger.error(`Erreur sync planifié user=${userId}:`, e.message || e);
      }
    }, 10000);
  }

  async _notifyGroupsServerStarted(sock, userId) {
    try {
      const groups = await Group.find({ userId, isRestricted: true }).lean();
      if (!groups.length) return;
      const total = groups.length;
      const msg = `🔔 *Serveur prêt* — ${total} groupes cibles surveillés\n_Connexion WhatsApp établie_`;
      const BATCH = 15;
      const DELAY = 2000;
      for (let i = 0; i < groups.length; i += BATCH) {
        const batch = groups.slice(i, i + BATCH);
        await Promise.allSettled(batch.map(g =>
          sock.sendMessage(g.groupId, { text: msg }).catch(() => {})
        ));
        if (i + BATCH < groups.length) await new Promise(r => setTimeout(r, DELAY));
      }
      logger.info(`Notification démarrage envoyée à ${total} groupes (user=${userId})`);
    } catch (err) {
      logger.error(`Erreur _notifyGroupsServerStarted user=${userId}:`, err.message || err);
    }
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

  async connect(userId, fresh = false, pairingPhone = null, notifyOnConnect = false) {
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
          session.reconnectCount = 0;
          const phone = sock.user?.id ? sock.user.id.split("@")[0].split(":")[0] : null;
          if (session.statusCallback) session.statusCallback("connected");

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

          if (notifyOnConnect) {
            this._notifyGroupsServerStarted(sock, userId).catch(e =>
              logger.error(`Erreur notification démarrage user=${userId}:`, e.message || e)
            );
          }

          this._scheduleGroupSync(userId);
        }

        if (connection === "close") {
          const wasConnected = session.isConnected;
          session.isConnected = false;
          session.isConnecting = false;
          session.isPairing = false;
          this._clearReconnectTimer(session);
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
            if (reasonCode === DisconnectReason.loggedOut) {
              s.qrCode = null;
              s.phone = null;
            }
            s.status = "disconnected";
            await s.save();
          }

          if (wasConnected) {
            notifier.notifyDisconnect(userId, phone, reasonText).catch(() => {});
          }

          if (reasonCode === DisconnectReason.loggedOut) {
            logger.error(`Session expirée user=${userId}. Nettoie auth_info.`);
            this.clearAuthDir(userId);
            session.reconnectCount = 0;
          } else {
            this._scheduleReconnect(userId);
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
        const settings = await this._getSettings(userId);
        for (const msg of messages) {
          if (!msg || !msg.message) continue;
          const from = msg.key.remoteJid;
          if (!from) continue;
          if (!from.endsWith("@g.us")) continue;

          if (!msg.key.fromMe && settings?.moderationEnabled) {
            moderation.handleMessage(sock, msg, from, userId);
          }

          if (!msg.key.fromMe) {
            await commands.handle(sock, msg, from, userId);
          }

          if (!msg.key.fromMe && settings?.autoReplies?.length) {
            await this.handleAutoReplies(sock, msg, from, userId, settings);
          }
        }
      } catch (e) {
        logger.error(`Erreur messages.upsert user=${userId}:`, e);
      }
    });

    sock.ev.on("group-participants.update", async (ev) => {
      try {
        const { id, participants, action } = ev || {};
        if (!id || !participants) return;
        moderation.clearCache(id, userId);
        if (action === "add") {
          const settings = await this._getSettings(userId);
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
      const settings = await this._getSettings(userId);
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
    this._clearReconnectTimer(session);
    session.isConnecting = false;
    session.isConnected = false;
    session.reconnectCount = 0;
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
    if (!session.sock || session.syncing) return;
    session.syncing = true;
    try {
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
          const botIsAdmin = this._isBotAdmin(session.sock, admins);
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
          if (/nufotec|alimentation/i.test(metadata.subject)) {
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
    } finally {
      session.syncing = false;
    }
  }

  async syncGroupMetadataOnDemand(userId, groupId) {
    const session = this._getSession(userId);
    if (!session.sock) return null;
    try {
      const metadata = await session.sock.groupMetadata(groupId);
      const admins = (metadata.participants || []).filter((p) => p.admin).map((p) => p.id);
      const botIsAdmin = this._isBotAdmin(session.sock, admins);

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
      if (/nufotec|alimentation/i.test(metadata.subject)) {
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

  isConnecting(userId) {
    const session = this._getSession(userId);
    return session.isConnecting;
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
