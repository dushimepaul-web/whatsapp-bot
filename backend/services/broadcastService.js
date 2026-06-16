const Broadcast = require("../models/Broadcast");
const Group = require("../models/Group");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const whatsappService = require("./whatsappService");
const logger = require("../utils/logger");
const { sleep } = require("../utils/helpers");

var urlValidator = require("../utils/urlValidator");
var isValidUrl = urlValidator.isValidUrl;
var isPrivateIP = urlValidator.isPrivateIP;

class BroadcastService {
  async sendBroadcast(broadcastId, userId) {
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) throw new Error("Campagne introuvable");

    broadcast.status = "sending";
    broadcast.sentCount = 0;
    broadcast.failedCount = 0;
    broadcast.startedAt = new Date();
    await broadcast.save();

    const sock = whatsappService.getSocket(userId);
    if (!sock) throw new Error("WhatsApp non connecté");

    const settings = await Setting.findOne({ userId });
    const delayMs = settings?.rateLimitDelayBetween || 1000;
    const dailyLimit = settings?.rateLimitDailyLimit || 5000;

    // Timeout de sécurité : si le broadcast dure plus de 2h, on le force en "completed"
    const heartbeat = setInterval(async () => {
      try {
        const b = await Broadcast.findById(broadcastId);
        if (b && b.status === "sending") {
          b.sentCount = sentCount;
          b.failedCount = failedCount;
          await b.save();
        }
      } catch (e) {
        logger.error(`Erreur heartbeat broadcast ${broadcastId}: ${e.message}`);
      }
    }, 30000);

    const safetyTimeout = setTimeout(async () => {
      try {
        const b = await Broadcast.findById(broadcastId);
        if (b && b.status === "sending") {
          b.status = "completed";
          b.sentCount = sentCount;
          b.failedCount = failedCount;
          await b.save();
          logger.warn(`Broadcast ${broadcastId} forcé à "completed" (timeout 2h)`);
        }
      } catch (e) {
        logger.error(`Erreur safetyTimeout broadcast ${broadcastId}: ${e.message}`);
      }
    }, 2 * 60 * 60 * 1000);

    let targets = [];
    if (broadcast.toAllGroups) {
      const groups = await Group.find({ userId });
      targets = groups.map((g) => ({ type: "group", id: g.groupId }));
    } else if (broadcast.targetGroups?.length) {
      targets = broadcast.targetGroups.map((id) => ({ type: "group", id }));
    }

    if (broadcast.toAllMembers) {
      const members = await Member.find({ userId });
      const memberTargets = members.map((m) => ({ type: "member", id: m.jid }));
      targets = [...targets, ...memberTargets];
    } else if (broadcast.targetMembers?.length) {
      targets = [...targets, ...broadcast.targetMembers.map((id) => ({ type: "member", id }))];
    }

    if (targets.length > dailyLimit) {
      logger.warn(`Broadcast ${broadcastId}: ${targets.length} cibles dépasse la limite quotidienne ${dailyLimit}, tronqué`);
      targets = targets.slice(0, dailyLimit);
    }

    broadcast.totalCount = targets.length;
    await broadcast.save();

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      const { id } = targets[i];

      try {
        try { await sock.sendPresenceUpdate("composing", id); } catch {}
        await sleep(1000 + Math.random() * 1000);

        if (broadcast.type === "text") {
          await sock.sendMessage(id, { text: broadcast.content.text });
        } else if (broadcast.type === "image") {
          if (!isValidUrl(broadcast.content.url)) {
            logger.warn(`URL image invalide dans broadcast ${broadcastId}: ${broadcast.content.url}`);
            failedCount++;
            continue;
          }
          await sock.sendMessage(id, {
            image: { url: broadcast.content.url },
            caption: broadcast.content.caption || "",
          });
        } else if (broadcast.type === "poll") {
          await sock.sendMessage(id, {
            poll: { name: broadcast.content.question, values: broadcast.content.options },
          });
        }
        sentCount++;

        const jitter = 1000 + Math.random() * 2000;
        await sleep(delayMs + jitter);
      } catch (err) {
        logger.error(`Erreur envoi broadcast vers ${id}: ${err.message}`);
        failedCount++;
      }

      if ((i + 1) % 5 === 0) {
        broadcast.sentCount = sentCount;
        broadcast.failedCount = failedCount;
        await broadcast.save();
      }
    }

    broadcast.sentCount = sentCount;
    broadcast.failedCount = failedCount;
    broadcast.status = "completed";
    await broadcast.save();

    clearInterval(heartbeat);
    clearTimeout(safetyTimeout);

    await logger.db({
      userId,
      type: "broadcast",
      action: "broadcast_completed",
      details: { sent: sentCount, failed: failedCount, total: targets.length },
    });

    return broadcast;
  }
}

module.exports = new BroadcastService();
