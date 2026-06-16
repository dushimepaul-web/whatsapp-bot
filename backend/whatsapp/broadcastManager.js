const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const ForwardingRule = require("../models/ForwardingRule");
const ForwardedMessage = require("../models/ForwardedMessage");
const PendingForward = require("../models/PendingForward");
const Member = require("../models/Member");
const Group = require("../models/Group");
const Setting = require("../models/Setting");
const logger = require("../utils/logger");
const { escapeRegex } = require("../utils/helpers");
const path = require("path");
const fs = require("fs");
let io = null;
let emitToUserFn = null;

const MEDIA_CACHE_DIR = path.join(__dirname, "..", "media_cache");

const cloneMsg = (msg) => {
  if (!msg) return msg;
  const seen = new WeakSet();
  const deepClone = (obj) => {
    if (Buffer.isBuffer(obj)) return Buffer.from(obj);
    if (obj instanceof Uint8Array) return Buffer.from(obj);
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (seen.has(obj)) return undefined;
    seen.add(obj);
    if (Array.isArray(obj)) return obj.map(deepClone);
    const copy = {};
    for (const [k, v] of Object.entries(obj)) {
      copy[k] = deepClone(v);
    }
    return copy;
  };
  return {
    key: msg.key ? deepClone(msg.key) : undefined,
    message: msg.message ? deepClone(msg.message) : undefined,
    messageTimestamp: msg.messageTimestamp,
    pushName: msg.pushName,
  };
};

const getRealMessage = (message) => {
  if (!message) return null;
  if (message.ephemeralMessage) return getRealMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return getRealMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return getRealMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return getRealMessage(message.documentWithCaptionMessage.message);
  return message;
};

const BATCH_DELAY_MS = 2000;
const MAX_BATCH_SIZE = 15;
const MAX_BATCH_WAIT_MS = 15000;
const MAX_MEDIA_SIZE = 100 * 1024 * 1024;
const MAX_MEM_CACHE = 20;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const BURST_DURATION_MS = 2 * 60 * 60 * 1000;
const COOLDOWN_DURATION_MS = 2 * 60 * 60 * 1000;
const MAX_QUEUE_SIZE = 5000;
const MAX_RETRIES = 30;
const SOCKET_RETRIES_BEFORE_BACKOFF = 10;

// Anti-ban constants
const MIN_DELAY_BASE_MS = 3000;
const MAX_DELAY_BASE_MS = 8000;
const JITTER_FACTOR = 0.4;
const WARM_UP_MESSAGES = 50;
const WARM_UP_DELAY_MULTIPLIER = 2.5;
const RANDOM_PAUSE_INTERVAL_MIN = 40;
const RANDOM_PAUSE_INTERVAL_MAX = 80;
const RANDOM_PAUSE_MIN_MS = 30000;
const RANDOM_PAUSE_MAX_MS = 120000;
const DEFAULT_MSG_PER_MIN = 25;
const TARGET_THROTTLE_MS = 60000;

class BroadcastManager {
  constructor() {
    this.messageQueue = [];
    this.isProcessing = false;
    this.stopRequested = new Set();
    this.forwardingPaused = new Set();
    this.restoring = false;
    this.messageCount = 0;
    this.messageWindow = [];
    this.batchBuffer = {};
    this.memCache = new Map();
    this.mediaCacheDir = MEDIA_CACHE_DIR;
    this.burstStartTime = Date.now();
    this.adaptiveDelay = 1;
    this.errorWindow = [];
    this.lastErrorTime = 0;
    this.consecutiveSocketErrors = new Map();
    this.processedIds = new Map();
    this.sockProvider = null;
    this.dailyCount = new Map();
    this.lastDailyReset = Date.now();
    this.warmUpCounts = new Map();
    this.targetThrottle = new Map();
    this.messageSincePause = 0;
    this.ensureMediaCacheDir();
  }

  ensureMediaCacheDir() {
    try {
      if (!fs.existsSync(this.mediaCacheDir)) {
        fs.mkdirSync(this.mediaCacheDir, { recursive: true });
        logger.info(`Dossier cache média créé: ${this.mediaCacheDir}`);
      } else {
        this.cleanMediaCache();
      }
    } catch (err) {
      logger.error(`Erreur création dossier cache média: ${err.message}`);
    }
  }

  getMediaCachePath(cacheKey) {
    return path.join(this.mediaCacheDir, `${cacheKey}.bin`);
  }

  getMediaSize() {
    try {
      const files = fs.readdirSync(this.mediaCacheDir);
      let totalBytes = 0;
      for (const f of files) {
        try {
          totalBytes += fs.statSync(path.join(this.mediaCacheDir, f)).size;
        } catch {}
      }
      return totalBytes;
    } catch {
      return 0;
    }
  }

  cleanMediaCache(maxBytes = 500 * 1024 * 1024) {
    try {
      const files = fs.readdirSync(this.mediaCacheDir).map((f) => {
        const fp = path.join(this.mediaCacheDir, f);
        try {
          return { name: f, path: fp, mtime: fs.statSync(fp).mtimeMs, size: fs.statSync(fp).size };
        } catch {
          return null;
        }
      }).filter(Boolean).sort((a, b) => a.mtime - b.mtime);

      let totalBytes = files.reduce((s, f) => s + f.size, 0);
      if (totalBytes <= maxBytes) return;

      const toRemove = [];
      for (const f of files) {
        if (totalBytes <= maxBytes) break;
        toRemove.push(f);
        totalBytes -= f.size;
      }
      for (const f of toRemove) {
        try {
          fs.unlinkSync(f.path);
          this.memCache.delete(f.name.replace(".bin", ""));
          logger.debug(`Cache média purgé: ${f.name}`);
        } catch {}
      }
      logger.info(`Cache média nettoyé: ${toRemove.length} fichier(s) supprimé(s), ${(totalBytes / 1024 / 1024).toFixed(1)}MB restants`);
    } catch (err) {
      logger.warn(`Erreur nettoyage cache média: ${err.message}`);
    }
  }

  setSockProvider(provider) {
    this.sockProvider = provider;
  }

  async stop(userId) {
    const uid = userId?.toString();
    this.stopRequested.add(uid);
    this.forwardingPaused.add(uid);

    for (const ruleId of Object.keys(this.batchBuffer)) {
      const batch = this.batchBuffer[ruleId];
      if (batch.rule?.userId?.toString() === uid) {
          if (batch.timer) clearTimeout(batch.timer);
          if (batch.forceTimer) clearTimeout(batch.forceTimer);
          for (const entry of batch.entries) {
            for (const targetId of entry.targets) {
              const pendingInfo = entry.pendingEntries?.find(p => p.targetId === targetId);
              await this.queueMessage(batch.sock, targetId, entry.msg, batch.rule, pendingInfo?.pendingId || null);
            }
          }
          delete this.batchBuffer[ruleId];
        }
    }

    const before = this.messageQueue.length;
    this.messageQueue = this.messageQueue.filter(
      item => item.rule?.userId?.toString() !== uid
    );
    const removed = before - this.messageQueue.length;

    // Supprimer tous les messages en attente en BDD pour cet utilisateur
    const pendingRemoved = await PendingForward.deleteMany({ userId: uid });
    logger.info(`Arrêt définitif du forwarding pour user=${uid}, ${removed} messages retirés de la file mémoire, ${pendingRemoved.deletedCount} supprimés de la BDD`);
    if (emitToUserFn && userId) {
      emitToUserFn(userId, "forwarding:stopped", { stopped: true, messages: removed });
    } else if (io) {
      io.emit("forwarding:stopped", { stopped: true, messages: removed });
    }
  }

  async resume(userId) {
    const uid = userId?.toString();
    this.forwardingPaused.delete(uid);
    logger.info(`Forwarding repris pour user=${uid}`);
    if (emitToUserFn && userId) {
      emitToUserFn(userId, "forwarding:resumed", { resumed: true });
    } else if (io) {
      io.emit("forwarding:resumed", { resumed: true });
    }
  }

  isPaused(userId) {
    return this.forwardingPaused.has(userId?.toString());
  }

  async handleIncoming(sock, msg, from, userId) {
    if (!from || !from.endsWith("@g.us")) {
      return;
    }

    if (msg.message?.senderKeyDistributionMessage) return;

    const proto = msg.message?.protocolMessage;
    if (proto) {
      if (proto.type === 0 && proto.key) {
        await this.handleMessageDeletion(sock, proto.key, userId);
      }
      return;
    }

    const msgId = msg.key?.id;
    if (msgId) {
      if (this.processedIds.has(msgId)) {
        logger.debug(`Message ${msgId} déjà traité, ignoré.`);
        return;
      }
      this.processedIds.set(msgId, Date.now());
      if (this.processedIds.size > 1000) {
        const cutoff = Date.now() - 60000;
        for (const [id, ts] of this.processedIds) {
          if (ts < cutoff) this.processedIds.delete(id);
        }
      }
    }

    try {
      const uid = userId?.toString();
      if (uid && (this.stopRequested.has(uid) || this.forwardingPaused.has(uid))) {
        logger.debug(`Forwarding arrêté pour user=${uid}, message ignoré`);
        return;
      }

      const setting = await Setting.findOne({ userId }).maxTimeMS(5000);
      const rules = await ForwardingRule.find({ sourceGroupId: from, isActive: true, userId }).maxTimeMS(5000);
      logger.debug(`handleIncoming: ${rules.length} règle(s) trouvée(s) pour ${from}`);

      if (!rules.length && setting?.masterGroupKeyword) {
        const sourceGroup = await Group.findOne({ groupId: from, userId });
        if (sourceGroup && sourceGroup.name && new RegExp(escapeRegex(setting.masterGroupKeyword), "i").test(sourceGroup.name)) {
          const fakeRule = { _id: "auto", name: `Auto: ${sourceGroup.name}`, masterGroup: true, forwardToAllGroups: true, forwardToMembers: false, onlyAdmins: false, includeMedia: true, isActive: true, userId };
          rules.push(fakeRule);
          logger.debug(`Auto-règle master créée via mot-clé "${setting.masterGroupKeyword}" pour ${sourceGroup.name}`);
        }
      }

      if (!rules.length && setting?.inboxKeyword) {
        const sourceGroup = await Group.findOne({ groupId: from, userId });
        if (sourceGroup && sourceGroup.name && new RegExp(escapeRegex(setting.inboxKeyword), "i").test(sourceGroup.name)) {
          const fakeRule = { _id: "auto", name: `Auto inbox: ${sourceGroup.name}`, masterGroup: false, forwardToAllGroups: true, forwardToMembers: true, onlyAdmins: false, includeMedia: true, isActive: true, userId, targetGroupPattern: setting.forwardingKeyword || "NUFOTEC" };
          rules.push(fakeRule);
          logger.debug(`Auto-règle inbox créée via mot-clé "${setting.inboxKeyword}" pour ${sourceGroup.name} → membres des groupes "${setting.forwardingKeyword}"`);
        }
      }

      if (!rules.length) {
        logger.debug(`Aucune règle active pour le groupe ${from}`);
        return;
      }

      let senderJid = msg.key.participant;
      if (!senderJid || !senderJid.includes("@")) {
        if (msg.key.fromMe && sock?.user?.id) {
          senderJid = sock.user.id;
        } else {
          senderJid = msg.key.participant || msg.key.remoteJid;
        }
      }
      if (msg.key.fromMe && sock?.user?.id) {
        senderJid = sock.user.id;
      }

      const isAdmin = msg.key.fromMe ? true : await this.checkIsAdmin(from, senderJid, userId);
      logger.debug(`handleIncoming: sender=${senderJid} admin=${isAdmin} fromMe=${msg.key.fromMe}`);

      for (const rule of rules) {
        const requireAdmin = rule.onlyAdmins;
        if (requireAdmin && !isAdmin) {
          logger.debug(`Règle "${rule.name}" ignorée: admin requis mais ${senderJid} n'est pas admin`);
          continue;
        }

        let targets = [];
        if (rule.forwardToAllGroups || rule.masterGroup) {
          let query = { userId };
          let pattern = rule.targetGroupPattern;
          if (!pattern) {
            pattern = setting?.forwardingKeyword || "";
          }
          if (pattern) {
            query.name = { $regex: escapeRegex(pattern), $options: "i" };
          }
          const groups = await Group.find(query);
          targets = groups.map((g) => g.groupId).filter((id) => id !== from);
          logger.debug(`Règle "${rule.name}": ${groups.length} groupes trouvés avec filtre "${pattern}"`);
        } else if (rule.targetGroupIds?.length) {
          targets = rule.targetGroupIds.filter((id) => id !== from);
        }

        if (!targets.length) {
          logger.debug(`Règle "${rule.name}": aucun groupe cible`);
          continue;
        }

        this.emitActivity(rule, msg, senderJid, targets.length);

          logger.debug(`Forward: ${targets.length} cibles pour la règle "${rule.name}"`);

          if (rule.forwardToMembers) {
            const cloned = cloneMsg(msg);
            const senderPhone = senderJid.split("@")[0].split(":")[0];
            const seen = new Set();
            let uniqueCount = 0;
            const qPromises = [];
            for (const groupId of targets) {
              let skip = 0;
              const batchSize = 100;
              while (true) {
                const members = await Member.find({ groupId, userId })
                  .skip(skip).limit(batchSize).lean();
                if (!members.length) break;
                for (const member of members) {
                  const memberPhone = member.jid.split("@")[0].split(":")[0];
                  if (memberPhone === senderPhone || seen.has(memberPhone)) continue;
                  seen.add(memberPhone);
                  uniqueCount++;
                  qPromises.push(this.queueMessage(sock, member.jid, cloned, rule));
                }
                skip += batchSize;
              }
            }
            await Promise.all(qPromises);
            logger.debug(`Inbox: ${uniqueCount} membres uniques en file d'attente (burst 2h/2h)`);
        } else {
          await this.addToBatch(sock, rule, msg, targets);
        }
      }
    } catch (err) {
      logger.error("Erreur broadcastManager:", err);
    }
  }

  async checkIsAdmin(groupId, jid, userId) {
    try {
      if (!jid) return false;
      const cleanJid = jid.split("@")[0].split(":")[0] + "@" + (jid.split("@")[1] || "s.whatsapp.net");
      let member = await Member.findOne({ groupId, userId, jid: cleanJid });
      if (member) return member.isAdmin || false;
      const altJid = cleanJid.includes("@lid") ? cleanJid.replace(/@lid/, "@s.whatsapp.net") : cleanJid.replace(/@s\.whatsapp\.net/, "@lid");
      member = await Member.findOne({ groupId, userId, jid: altJid });
      return member?.isAdmin || false;
    } catch (e) {
      logger.warn("Erreur checkIsAdmin:", e);
      return false;
    }
  }

  _jitter(base) {
    const variation = base * JITTER_FACTOR;
    return Math.round(base - variation + Math.random() * variation * 2);
  }

  _checkDailyLimit(uid, limit) {
    const now = Date.now();
    if (now - this.lastDailyReset > 86400000) {
      this.dailyCount.clear();
      this.lastDailyReset = now;
    }
    const count = this.dailyCount.get(uid) || 0;
    return count < limit;
  }

  _checkTargetThrottle(targetId) {
    const now = Date.now();
    const last = this.targetThrottle.get(targetId);
    if (last && now - last < TARGET_THROTTLE_MS) return false;
    this.targetThrottle.set(targetId, now);
    if (this.targetThrottle.size > 5000) {
      const cutoff = now - 120000;
      for (const [key, ts] of this.targetThrottle) {
        if (ts < cutoff) this.targetThrottle.delete(key);
      }
    }
    return true;
  }

  canSend(uid, perMinLimit) {
    const now = Date.now();
    this.messageWindow = this.messageWindow.filter((t) => now - t < 60000);
    return this.messageWindow.length < perMinLimit;
  }

  async queueMessage(sock, targetId, msg, rule, existingPendingId = null) {
    if (this.messageQueue.length >= MAX_QUEUE_SIZE && !this.restoring) {
      logger.warn(`File pleine (${MAX_QUEUE_SIZE}), message ignoré vers ${targetId}`);
      return;
    }
    const item = { sock, targetId, msg, rule, retries: 0, pendingId: null };

    if (existingPendingId) {
      item.pendingId = existingPendingId;
    } else {
      try {
        const doc = await PendingForward.create({
          userId: rule.userId,
          targetId,
          ruleId: rule._id?.toString() || "auto",
          ruleName: rule.name || "",
          msgKey: msg.key,
          msgData: msg.message,
        });
        item.pendingId = doc._id;
      } catch (e) {
        logger.warn(`Erreur persistance file: ${e.message}`);
      }
    }

    this.messageQueue.push(item);

    if (!this.isProcessing) {
      this.processQueue().catch(e => logger.error("processQueue crash:", e));
    }
  }

  async addToBatch(sock, rule, msg, targets) {
    const ruleId = rule._id.toString();
    if (!this.batchBuffer[ruleId]) {
      this.batchBuffer[ruleId] = { entries: [], timer: null, forceTimer: null, sock, rule };
    }
    const batch = this.batchBuffer[ruleId];

    // Persister immédiatement chaque (msg, cible) pour survivre à un crash
    const pendingEntries = [];
    for (const targetId of targets) {
      try {
        const doc = await PendingForward.create({
          userId: rule.userId,
          targetId,
          ruleId: rule._id?.toString() || "auto",
          ruleName: rule.name || "",
          msgKey: msg.key,
          msgData: msg.message,
        });
        pendingEntries.push({ targetId, pendingId: doc._id });
      } catch (e) {
        logger.warn(`Erreur persistance batch: ${e.message}`);
        pendingEntries.push({ targetId, pendingId: null });
      }
    }

    batch.entries.push({ msg: cloneMsg(msg), targets, pendingEntries });
    batch.sock = sock;
    batch.rule = rule;

    if (!batch.forceTimer) {
      batch.forceTimer = setTimeout(() => {
        logger.info(`Batch force-déclenché pour "${batch.rule.name}" après ${MAX_BATCH_WAIT_MS}ms (${batch.entries.length} msg(s))`);
        this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e));
      }, MAX_BATCH_WAIT_MS);
    }

    if (batch.entries.length >= MAX_BATCH_SIZE) {
      if (batch.timer) clearTimeout(batch.timer);
      logger.info(`Batch déclenché par taille max pour "${batch.rule.name}" (${batch.entries.length} msg(s))`);
      this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e));
      return;
    }

    if (batch.timer) clearTimeout(batch.timer);
    batch.timer = setTimeout(() => this.processBatch(ruleId).catch(e => logger.error("processBatch crash:", e)), BATCH_DELAY_MS);
  }

  async processBatch(ruleId) {
    const batchKey = `processing_${ruleId}`;
    if (this[batchKey]) {
      logger.warn(`Batch ${ruleId} déjà en cours de traitement, ignoré`);
      return;
    }
    this[batchKey] = true;

    try {
      const batch = this.batchBuffer[ruleId];
      if (!batch || !batch.entries.length) {
        if (batch) delete this.batchBuffer[ruleId];
        return;
      }
      delete this.batchBuffer[ruleId];

    if (batch.timer) clearTimeout(batch.timer);
    if (batch.forceTimer) clearTimeout(batch.forceTimer);

    const totalTargets = new Set(batch.entries.flatMap(e => e.targets)).size;
      logger.debug(`Batch "${batch.rule.name}": ${batch.entries.length} msg(s) → ${totalTargets} groupe(s)`);

    for (const entry of batch.entries) {
      await Promise.all(entry.targets.map(targetId => {
        const pendingInfo = entry.pendingEntries?.find(p => p.targetId === targetId);
        return this.queueMessage(batch.sock, targetId, entry.msg, batch.rule, pendingInfo?.pendingId || null);
      }));
    }
    } finally {
      delete this[batchKey];
    }
  }

  async processQueue() {
    this.isProcessing = true;
    this.restoring = false;
    let batchLogTimer = Date.now();
    let consecutiveErrors = 0;
    try {
      while (this.messageQueue.length) {
        const current = this.messageQueue[0];
        const uid = current?.rule?.userId?.toString();

        if (uid && (this.stopRequested.has(uid) || this.forwardingPaused.has(uid))) {
          logger.info(`Arrêt du forwarding pour user=${uid} pendant l'envoi. ${this.messageQueue.filter(item => item.rule?.userId?.toString() !== uid).length} message(s) conservés pour les autres utilisateurs.`);
          this.messageQueue = this.messageQueue.filter(
            item => item.rule?.userId?.toString() !== uid
          );
          this.stopRequested.delete(uid);
          continue;
        }

        const now = Date.now();
        this.errorWindow = this.errorWindow.filter((t) => now - t < 120000);
        if (this.errorWindow.length > 5) {
          this.adaptiveDelay = Math.min(this.adaptiveDelay + 0.5, 5);
        } else if (now - this.lastErrorTime > 60000) {
          this.adaptiveDelay = Math.max(this.adaptiveDelay - 0.1, 1);
        }

        if (now - this.lastErrorTime > 30000) {
          consecutiveErrors = 0;
        }

        if (current?.rule?.forwardToMembers) {
          const elapsed = Date.now() - this.burstStartTime;
          if (elapsed >= BURST_DURATION_MS) {
            const cooldownMin = COOLDOWN_DURATION_MS / 60000;
            logger.info(`Burst inbox terminé (${(elapsed/3600000).toFixed(1)}h), pause de ${cooldownMin}min...`);
            await this.sleep(COOLDOWN_DURATION_MS);
            this.burstStartTime = Date.now();
            logger.info("Reprise du burst inbox après pause.");
            continue;
          }
        }

        // Charger les paramètres de rate limiting pour cet utilisateur
        let perMinLimit = DEFAULT_MSG_PER_MIN;
        let delayBetween = MIN_DELAY_BASE_MS;
        let dailyLimit = 5000;
        if (uid) {
          try {
            const settings = await Setting.findOne({ userId: uid }).lean().maxTimeMS(3000);
            if (settings) {
              perMinLimit = Math.min(settings.rateLimitMessagesPerMinute || DEFAULT_MSG_PER_MIN, DEFAULT_MSG_PER_MIN);
              delayBetween = Math.max(settings.rateLimitDelayBetween || MIN_DELAY_BASE_MS, MIN_DELAY_BASE_MS);
              dailyLimit = settings.rateLimitDailyLimit || 5000;
            }
          } catch (e) {
            logger.warn(`Erreur chargement settings pour user=${uid}: ${e.message}`);
          }
        }

        // Vérifier limite quotidienne
        if (!this._checkDailyLimit(uid, dailyLimit)) {
          logger.warn(`Limite quotidienne atteinte pour user=${uid} (${dailyLimit}), pause de 1h...`);
          await this.sleepWithCheck(3600000, uid);
          continue;
        }

        // Vérifier limite par minute
        if (!this.canSend(uid, perMinLimit)) {
          const pause = Math.min(15000 + consecutiveErrors * 5000, 60000);
          logger.warn(`File: ${this.messageQueue.length} en attente, limite ${perMinLimit}/min atteinte, pause ${pause/1000}s...`);
          await this.sleepWithCheck(pause, uid);
          continue;
        }

        const item = this.messageQueue.shift();
        let { sock, targetId, msg, rule } = item;

        // Tentative de récupération du socket s'il est nul
        if (!sock && this.sockProvider && uid) {
          try {
            sock = await this.sockProvider(uid);
            item.sock = sock;
          } catch (e) {
            logger.warn(`Échec récupération socket pour user=${uid}: ${e.message}`);
          }
        }

        if (!sock) {
          item.retries++;
          if (item.retries > SOCKET_RETRIES_BEFORE_BACKOFF) {
            logger.warn(`Socket nul pour ${targetId} après ${item.retries} tentative(s). Message conservé en BDD pour reprise ultérieure.`);
            if (item.pendingId) {
              await PendingForward.updateOne(
                { _id: item.pendingId },
                { $set: { retryCount: item.retries, lastError: "socket_null" } }
              ).catch(() => {});
            } else {
              try {
                const doc = await PendingForward.create({
                  userId: rule.userId,
                  targetId,
                  ruleId: rule._id?.toString() || "auto",
                  ruleName: rule.name || "",
                  msgKey: msg.key,
                  msgData: msg.message,
                });
                item.pendingId = doc._id;
              } catch (e) {
                logger.warn(`Erreur persistance message socket nul: ${e.message}`);
              }
            }
            continue;
          }
          this.messageQueue.unshift(item);
          const waitMs = Math.min(5000 + item.retries * 2000, 30000);
          logger.warn(`Socket nul pour user=${uid}, attente ${waitMs/1000}s avant réessai (tentative ${item.retries}/${SOCKET_RETRIES_BEFORE_BACKOFF})...`);
          await this.sleepWithCheck(waitMs, uid);
          continue;
        }

        // Anti-ban: vérifier throttle par cible (pas plus d'1 msg/60s vers la même cible)
        if (!this._checkTargetThrottle(targetId)) {
          logger.debug(`Throttle cible ${targetId.split("@")[0]}, remis en fin de file`);
          this.messageQueue.push(item);
          await this.sleep(5000);
          continue;
        }

        try {
          // Anti-ban: warm-up progressif (début lent puis accélération)
          const warmUpCount = this.warmUpCounts.get(uid) || 0;
          let baseDelay = delayBetween + consecutiveErrors * 1000;
          if (warmUpCount < WARM_UP_MESSAGES) {
            const progress = warmUpCount / WARM_UP_MESSAGES;
            const warmUpMul = WARM_UP_DELAY_MULTIPLIER - (WARM_UP_DELAY_MULTIPLIER - 1) * progress;
            baseDelay = Math.round(baseDelay * warmUpMul);
          }
          baseDelay = Math.min(baseDelay, MAX_DELAY_BASE_MS);
          const delay = this._jitter(baseDelay);
          await this.sleep(delay);

          await this.forwardMessage(sock, targetId, msg, rule);

          consecutiveErrors = 0;
          this.consecutiveSocketErrors.delete(uid);
          this.messageWindow.push(Date.now());
          this.messageCount++;

          // Anti-ban: pauses aléatoires périodiques
          this.messageSincePause++;
          const pauseThreshold = RANDOM_PAUSE_INTERVAL_MIN + Math.floor(Math.random() * (RANDOM_PAUSE_INTERVAL_MAX - RANDOM_PAUSE_INTERVAL_MIN));
          if (this.messageSincePause >= pauseThreshold) {
            this.messageSincePause = 0;
            const pauseDuration = this._jitter(RANDOM_PAUSE_MIN_MS + Math.random() * (RANDOM_PAUSE_MAX_MS - RANDOM_PAUSE_MIN_MS));
            logger.info(`Pause anti-ban de ${Math.round(pauseDuration/1000)}s après ${this.messageCount} messages...`);
            await this.sleep(pauseDuration);
          }

          // Mettre à jour les compteurs
          if (uid) {
            this.warmUpCounts.set(uid, warmUpCount + 1);
            this.dailyCount.set(uid, (this.dailyCount.get(uid) || 0) + 1);
          }

          // Supprimer de la base après envoi réussi
          if (item.pendingId) {
            PendingForward.deleteOne({ _id: item.pendingId }).catch(() => {});
          }

          if (Date.now() - batchLogTimer > 30000) {
            const daily = uid ? (this.dailyCount.get(uid) || 0) : 0;
            logger.info(`File: ${this.messageQueue.length} restant(s), ${this.messageCount} envoyé(s), aujourd'hui: ${daily}/${dailyLimit}`);
            batchLogTimer = Date.now();
          }
        } catch (err) {
          logger.error(`Erreur envoi vers ${targetId}: ${err.message}`);
          this.errorWindow.push(Date.now());
          this.lastErrorTime = Date.now();
          consecutiveErrors++;

          if (item.retries < MAX_RETRIES) {
            item.retries++;
            const backoff = Math.min(item.retries * 10000, 60000);
            logger.warn(`Retry ${item.retries}/${MAX_RETRIES} pour ${targetId} dans ${backoff/1000}s`);
            this.messageQueue.push(item);
            await this.sleepWithCheck(backoff, uid);
            if (item.pendingId) {
              PendingForward.updateOne(
                { _id: item.pendingId },
                { $set: { retryCount: item.retries, lastError: err.message } }
              ).catch(() => {});
            }
          } else {
            logger.warn(`Message vers ${targetId} abandonné après ${MAX_RETRIES} tentatives.`);
            if (item.pendingId) {
              PendingForward.deleteOne({ _id: item.pendingId }).catch(() => {});
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.memCache.size > 0) {
        this.memCache.clear();
      }
    }
  }

  getMessageText(msgContent) {
    if (!msgContent) return "";
    for (const field of ["conversation", "extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"]) {
      const text = msgContent[field]?.text || msgContent[field]?.caption || (field === "conversation" ? msgContent[field] : null);
      if (text) return text;
    }
    if (msgContent.buttonsResponseMessage?.selectedButtonId) return msgContent.buttonsResponseMessage.selectedButtonId;
    if (msgContent.listResponseMessage?.singleSelectReply?.selectedRowId) return msgContent.listResponseMessage.singleSelectReply.selectedRowId;
    if (msgContent.templateButtonReplyMessage?.selectedId) return msgContent.templateButtonReplyMessage.selectedId;
    return "";
  }

  async getCachedMedia(msg) {
    const cacheKey = msg.key?.id;
    if (!cacheKey) {
      logger.warn(`[MEDIA] Pas de cacheKey pour ce message, téléchargement direct`);
      return this.downloadAndCacheMedia(msg, null);
    }

    const cachePath = this.getMediaCachePath(cacheKey);

    if (this.memCache.has(cacheKey)) {
      logger.info(`[MEDIA] MemCache HIT pour ${cacheKey}`);
      return this.memCache.get(cacheKey);
    }

    if (fs.existsSync(cachePath)) {
      logger.info(`[MEDIA] DiskCache HIT pour ${cacheKey}`);
      try {
        const data = fs.readFileSync(cachePath);
        this.memCache.set(cacheKey, data);
        if (this.memCache.size > MAX_MEM_CACHE) {
          const firstKey = this.memCache.keys().next().value;
          this.memCache.delete(firstKey);
        }
        logger.info(`[MEDIA] Chargé depuis disque: ${(data.length / 1024 / 1024).toFixed(1)}MB`);
        return data;
      } catch (err) {
        logger.warn(`[MEDIA] Erreur lecture disque pour ${cacheKey}: ${err.message}. Re-téléchargement.`);
      }
    }

    return this.downloadAndCacheMedia(msg, cacheKey);
  }

  async downloadAndCacheMedia(msg, cacheKey) {
    const msgContent = getRealMessage(msg.message);
    const content = msgContent?.imageMessage || msgContent?.videoMessage || msgContent?.audioMessage || msgContent?.documentMessage || msgContent?.stickerMessage;
    if (content?.fileLength && content.fileLength > MAX_MEDIA_SIZE) {
      logger.warn(`[MEDIA] Fichier trop volumineux: ${(content.fileLength / 1024 / 1024).toFixed(1)}MB, max ${MAX_MEDIA_SIZE / 1024 / 1024}MB. Envoi du texte uniquement.`);
      return null;
    }

    logger.info(`[MEDIA] Téléchargement média...`);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const data = await downloadMediaMessage(msg, "buffer", {}, { logger, abortSignal: abortController.signal });
      logger.info(`[MEDIA] Téléchargé: ${Buffer.isBuffer(data) ? (data.length / 1024 / 1024).toFixed(1) + "MB" : typeof data}`);

      if (cacheKey && Buffer.isBuffer(data)) {
        const cachePath = this.getMediaCachePath(cacheKey);
        try {
          fs.writeFileSync(cachePath, data);
          this.memCache.set(cacheKey, data);
          if (this.memCache.size > MAX_MEM_CACHE) {
            const firstKey = this.memCache.keys().next().value;
            this.memCache.delete(firstKey);
          }
          this.cleanMediaCache();
          logger.info(`[MEDIA] Sauvegardé sur disque: ${cacheKey}.bin (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
        } catch (err) {
          logger.warn(`[MEDIA] Échec sauvegarde disque pour ${cacheKey}: ${err.message}`);
        }
      }

      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        logger.warn(`[MEDIA] Téléchargement annulé (timeout ${DOWNLOAD_TIMEOUT_MS / 1000}s)`);
      } else {
        logger.warn(`[MEDIA] Échec téléchargement: ${err.message}`);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _sendAndTrack(sock, targetId, content, msg, rule) {
    try {
      const result = await sock.sendMessage(targetId, content);
      if (result?.key?.id && msg?.key?.id) {
        try {
          await ForwardedMessage.create({
            userId: rule.userId,
            sourceMsgId: msg.key.id,
            sourceGroupId: msg.key.remoteJid,
            targetGroupId: targetId,
            targetMsgId: result.key.id,
            ruleId: rule._id?.toString() || "auto",
          });
        } catch (e) {
          logger.warn(`Erreur enregistrement mapping forward: ${e.message}`);
        }
      }
      return result;
    } catch (err) {
      logger.warn(`[SEND] Échec envoi vers ${targetId}: ${err.message}`);
      throw err;
    }
  }

  async handleMessageDeletion(sock, protocolKey, userId) {
    try {
      const originalMsgId = protocolKey.id;
      const sourceGroupId = protocolKey.remoteJid;
      if (!originalMsgId || !sourceGroupId) return;

      logger.info(`Suppression détectée: msg=${originalMsgId} dans ${sourceGroupId}`);

      const forwarded = await ForwardedMessage.find({
        sourceMsgId: originalMsgId,
        sourceGroupId,
        userId,
      });

      if (!forwarded.length) {
        logger.debug(`Aucun forward trouvé pour msg=${originalMsgId}`);
        return;
      }

      logger.info(`Propagation suppression: ${forwarded.length} copie(s) à supprimer`);
      for (const fwd of forwarded) {
        try {
          await sock.sendMessage(fwd.targetGroupId, {
            delete: { id: fwd.targetMsgId, remoteJid: fwd.targetGroupId, fromMe: true },
          });
          logger.info(`Supprimé dans ${fwd.targetGroupId} (msg=${fwd.targetMsgId})`);
        } catch (err) {
          logger.warn(`Échec suppression dans ${fwd.targetGroupId}: ${err.message}`);
        }
      }

      await ForwardedMessage.deleteMany({
        sourceMsgId: originalMsgId,
        sourceGroupId,
        userId,
      });

      await logger.db({
        userId,
        type: "system",
        action: "message_deletion_propagated",
        details: {
          sourceMsgId: originalMsgId,
          sourceGroupId,
          count: forwarded.length,
        },
      });
    } catch (err) {
      logger.error(`Erreur handleMessageDeletion: ${err.message}`);
    }
  }

  _textContent(msgContent, caption) {
    if (!caption) return { text: "" };
    const extMsg = msgContent?.extendedTextMessage;

    // Conserver le contextInfo s'il contient des données de preview (lien, thumbnail, etc.)
    // L'API WhatsApp ne génère pas automatiquement les previews de liens,
    // donc on doit impérativement garder le contextInfo original
    if (extMsg?.contextInfo) {
      return { text: caption, contextInfo: extMsg.contextInfo };
    }

    return { text: caption };
  }

  async forwardMessage(sock, targetId, msg, rule) {
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    if (!msgContent) return;

    const msgType = this.getMessageType(msgContent);
    const caption = this.getMessageText(msgContent);

    if (rule.includeMedia && msgType && msgType !== "protocolMessage") {
      logger.info(`[MEDIA] Type=${msgType}, caption="${caption.substring(0, 40)}", cible=${targetId.split("@")[0]}`);
      try {
        switch (msgType) {
          case "imageMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { image: stream, caption }, msg, rule);
            return;
          }
          case "videoMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { video: stream, caption }, msg, rule);
            return;
          }
          case "ptvMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { video: stream, ptv: true }, msg, rule);
            return;
          }
          case "audioMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            const ptt = !!msgContent.audioMessage?.ptt;
            await this._sendAndTrack(sock, targetId, { audio: stream, ptt }, msg, rule);
            return;
          }
          case "documentMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            const doc = msgContent.documentMessage;
            await this._sendAndTrack(sock, targetId, {
              document: stream,
              fileName: doc?.fileName || "document",
              mimetype: doc?.mimetype || "application/octet-stream",
              caption,
            }, msg, rule);
            return;
          }
          case "stickerMessage": {
            const stream = await this.getCachedMedia(msg);
            if (!stream) break;
            await this._sendAndTrack(sock, targetId, { sticker: stream }, msg, rule);
            return;
          }
          case "pollCreationMessage": {
            const poll = msgContent.pollCreationMessage;
            if (!poll) break;
            await this._sendAndTrack(sock, targetId, {
              poll: {
                name: poll.name || "",
                values: (poll.options || []).map(o => o.optionName || ""),
                selectableOptionsCount: poll.selectableOptionsCount || 1
              }
            }, msg, rule);
            return;
          }
          case "locationMessage": {
            const loc = msgContent.locationMessage;
            if (!loc) break;
            await this._sendAndTrack(sock, targetId, {
              location: {
                degreesLatitude: loc.degreesLatitude || 0,
                degreesLongitude: loc.degreesLongitude || 0,
                name: loc.name || "",
                address: loc.address || ""
              }
            }, msg, rule);
            return;
          }
          case "contactMessage": {
            const con = msgContent.contactMessage;
            if (!con) break;
            await this._sendAndTrack(sock, targetId, {
              contacts: {
                displayName: con.displayName || "",
                contacts: [{ vcard: con.vcard || "" }]
              }
            }, msg, rule);
            return;
          }
          case "contactsArrayMessage": {
            const con = msgContent.contactsArrayMessage;
            if (!con) break;
            await this._sendAndTrack(sock, targetId, {
              contacts: {
                displayName: con.displayName || "",
                contacts: (con.contacts || []).map(c => ({ vcard: c.vcard || "" }))
              }
            }, msg, rule);
            return;
          }
          default: {
            if (caption) {
              await this._sendAndTrack(sock, targetId, this._textContent(msgContent, caption), msg, rule);
              return;
            }
            try {
              const stream = await this.getCachedMedia(msg);
              if (stream) {
                await this._sendAndTrack(sock, targetId, { document: stream, fileName: "media", mimetype: "application/octet-stream" }, msg, rule);
              }
            } catch {}
            return;
          }
        }
      } catch (err) {
        logger.warn(`[MEDIA] Échec média: ${err.message}`);
      }
    }

    if (caption) {
      await this._sendAndTrack(sock, targetId, this._textContent(msgContent, caption), msg, rule);
    } else {
      logger.debug(`[MEDIA] Aucun média ni caption à envoyer vers ${targetId.split("@")[0]}`);
    }
  }

  getMessageType(message) {
    if (!message) return null;
    const types = [
      "conversation", "extendedTextMessage",
      "imageMessage", "videoMessage", "audioMessage",
      "documentMessage", "stickerMessage", "ptvMessage",
      "pollCreationMessage", "locationMessage",
      "contactMessage", "contactsArrayMessage"
    ];
    for (const t of types) {
      if (message[t]) return t;
    }
    if (message.buttonsResponseMessage) return "buttonsResponseMessage";
    if (message.listResponseMessage) return "listResponseMessage";
    if (message.templateButtonReplyMessage) return "templateButtonReplyMessage";
    if (message.reactionMessage) return "reactionMessage";
    if (message.groupInviteMessage) return "groupInviteMessage";
    if (message.liveLocationMessage) return "liveLocationMessage";
    if (message.productMessage) return "productMessage";
    if (message.orderMessage) return "orderMessage";
    if (message.listMessage) return "listMessage";
    if (message.buttonsMessage) return "buttonsMessage";
    if (message.templateMessage) return "templateMessage";
    if (message.protocolMessage) return "protocolMessage";
    return "unknown";
  }

  getMediaLabel(msgType) {
    const labels = {
      "imageMessage": "📷 Image",
      "videoMessage": "🎬 Vidéo",
      "ptvMessage": "🎬 Vidéo",
      "audioMessage": "🎵 Audio",
      "documentMessage": "📄 Document",
      "stickerMessage": "🏷️ Sticker",
      "pollCreationMessage": "📊 Sondage",
      "locationMessage": "📍 Localisation",
      "contactMessage": "👤 Contact",
      "contactsArrayMessage": "👥 Contacts",
      "conversation": "💬 Texte",
      "extendedTextMessage": "💬 Texte",
    };
    return labels[msgType] || `📎 ${msgType.replace("Message", "")}`;
  }

  emitActivity(rule, msg, senderJid, targetCount) {
    if (!io) return;
    const rawContent = msg.message;
    const msgContent = getRealMessage(rawContent);
    const msgType = this.getMessageType(msgContent) || "inconnu";
    const msgPreview = this.getMessageText(msgContent);
    const displayMsg = msgPreview || this.getMediaLabel(msgType);
    const data = {
      ruleName: rule.name,
      sender: senderJid.split("@")[0],
      message: displayMsg.substring(0, 80),
      type: msgType,
      mediaLabel: this.getMediaLabel(msgType),
      targets: targetCount,
      masterGroup: rule.masterGroup,
      time: new Date().toISOString(),
    };
    logger.debug(`Activité forwarding: "${rule.name}" → ${targetCount} cible(s), ${data.mediaLabel}, sender: ${senderJid.split("@")[0]}`);
    if (emitToUserFn && rule.userId) {
      emitToUserFn(rule.userId, "forwarding:activity", data);
    } else {
      io.emit("forwarding:activity", data);
    }
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  sleepWithCheck(ms, uid) {
    const CHECK_INTERVAL = 500;
    return new Promise((resolve) => {
      const start = Date.now();
      const id = setInterval(() => {
        if (uid && (this.stopRequested.has(uid) || this.forwardingPaused.has(uid))) {
          clearInterval(id);
          resolve(true);
          return;
        }
        if (Date.now() - start >= ms) {
          clearInterval(id);
          resolve(false);
        }
      }, CHECK_INTERVAL);
    });
  }

  async restorePending(sockProvider) {
    this.restoring = true;
    try {
      const pending = await PendingForward.find().sort({ createdAt: 1 }).lean();
      if (!pending.length) { this.restoring = false; return; }
      logger.info(`Restauration de ${pending.length} message(s) en attente de forwarding...`);
      let restored = 0;
      let skipped = 0;
      for (const p of pending) {
        const sock = await sockProvider(p.userId);
        if (!sock) {
          skipped++;
          logger.warn(`Socket introuvable pour user=${p.userId}, message conservé dans PendingForward`);
          continue;
        }
        const rule = {
          userId: p.userId,
          _id: p.ruleId,
          name: p.ruleName || "restored",
        };
        const msg = {
          key: p.msgKey || {},
          message: p.msgData || {},
          messageTimestamp: Math.floor(p.createdAt.getTime() / 1000),
        };
        // queueMessage va créer une NOUVELLE entrée PendingForward (garantie BDD)
        await this.queueMessage(sock, p.targetId, msg, rule);
        // Supprimer l'ANCIENNE entrée maintenant que la nouvelle existe
        await PendingForward.deleteOne({ _id: p._id });
        restored++;
      }
      logger.info(`${restored} message(s) restaurés dans la file d'attente, ${skipped} conservés en BDD (socket indisponible)`);
      this.restoring = false;
      if (!this.isProcessing && this.messageQueue.length) {
        this.processQueue().catch(e => logger.error("processQueue (restore) crash:", e));
      }
    } catch (err) {
      this.restoring = false;
      logger.error(`Erreur restauration file: ${err.message}`);
    }
  }

  async restorePendingForUser(userId, sockProvider) {
    try {
      const sock = await sockProvider(userId);
      if (!sock) {
        logger.warn(`Socket introuvable pour restorePendingForUser user=${userId}`);
        return 0;
      }
      return await this.restoreUserPending(userId, sock);
    } catch (err) {
      logger.error(`Erreur restorePendingForUser user=${userId}: ${err.message}`);
      return 0;
    }
  }

  async restoreUserPending(userId, sock) {
    try {
      const pending = await PendingForward.find({ userId }).sort({ createdAt: 1 }).lean();
      if (!pending.length) return 0;
      logger.info(`Restauration de ${pending.length} message(s) en attente pour user=${userId}...`);
      let restored = 0;
      for (const p of pending) {
        const rule = {
          userId: p.userId,
          _id: p.ruleId,
          name: p.ruleName || "restored",
        };
        const msg = {
          key: p.msgKey || {},
          message: p.msgData || {},
          messageTimestamp: Math.floor(p.createdAt.getTime() / 1000),
        };
        await this.queueMessage(sock, p.targetId, msg, rule);
        await PendingForward.deleteOne({ _id: p._id });
        restored++;
      }
      logger.info(`${restored} message(s) restaurés pour user=${userId}`);
      if (!this.isProcessing && this.messageQueue.length) {
        this.processQueue().catch(e => logger.error("processQueue (user restore) crash:", e));
      }
      return restored;
    } catch (err) {
      logger.error(`Erreur restauration file pour user=${userId}: ${err.message}`);
      return 0;
    }
  }

  async flushQueueToDB() {
    const items = this.messageQueue.slice();
    if (!items.length) return 0;
    let persisted = 0;
    for (const item of items) {
      if (!item.pendingId) {
        try {
          const doc = await PendingForward.create({
            userId: item.rule.userId,
            targetId: item.targetId,
            ruleId: item.rule._id?.toString() || "auto",
            ruleName: item.rule.name || "",
            msgKey: item.msg.key,
            msgData: item.msg.message,
          });
          item.pendingId = doc._id;
          persisted++;
        } catch (e) {
          logger.warn(`Erreur persistance flushQueueToDB: ${e.message}`);
        }
      }
    }
    logger.info(`flushQueueToDB: ${persisted} message(s) persistés, ${items.length} total en file`);
    return persisted;
  }

  pendingCount() {
    return this.messageQueue.length;
  }

  setIO(instance, emitFn) {
    io = instance;
    emitToUserFn = emitFn;
  }

  startMasterPolling(sock, userId) {
    logger.info(`startMasterPolling appelé pour user=${userId} - mode temps réel actif`);
  }

  stopMasterPolling(userId) {
    logger.info(`stopMasterPolling appelé pour user=${userId}`);
  }
}

module.exports = new BroadcastManager();
