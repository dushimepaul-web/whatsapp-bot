const Broadcast = require("../models/Broadcast");
const Group = require("../models/Group");
const Member = require("../models/Member");
const Setting = require("../models/Setting");
const whatsappService = require("./whatsappService");
const logger = require("../utils/logger");
const { sleep } = require("../utils/helpers");

const isValidUrl = (str) => {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

class BroadcastService {
  async sendBroadcast(broadcastId, userId) {
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) throw new Error("Campagne introuvable");

    broadcast.status = "sending";
    broadcast.sentCount = 0;
    broadcast.failedCount = 0;
    await broadcast.save();

    const sock = whatsappService.getSocket();
    if (!sock) throw new Error("WhatsApp non connecté");

    const settings = await Setting.findOne({ userId });
    const delayMs = settings?.rateLimitDelayBetween || 1000;
    const dailyLimit = settings?.rateLimitDailyLimit || 5000;

    let targets = [];

    if (broadcast.toAllGroups) {
      const groups = await Group.find({});
      targets = groups.map((g) => ({ type: "group", id: g.groupId }));
    } else if (broadcast.targetGroups?.length) {
      targets = broadcast.targetGroups.map((id) => ({ type: "group", id }));
    }

    if (broadcast.toAllMembers) {
      const members = await Member.find({});
      const memberTargets = members.map((m) => ({ type: "member", id: m.jid }));
      targets = [...targets, ...memberTargets];
    } else if (broadcast.targetMembers?.length) {
      targets = [...targets, ...broadcast.targetMembers.map((id) => ({ type: "member", id }))];
    }

    broadcast.totalCount = targets.length;
    await broadcast.save();

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targets.length; i++) {
      if (i >= dailyLimit) {
        logger.warn("Limite quotidienne atteinte");
        break;
      }

      const { id } = targets[i];

      try {
        // Anti-ban: Simulation d'écriture
        await sock.sendPresenceUpdate("composing", id);
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
        
        // Anti-ban: Délai variable avec jitter aléatoire de 1 à 3 secondes
        const jitter = 1000 + Math.random() * 2000;
        await sleep(delayMs + jitter);
      } catch (err) {
        logger.error(`Erreur envoi broadcast vers ${id}: ${err}`);
        failedCount++;
      }

      if ((i + 1) % 10 === 0) {
        broadcast.sentCount = sentCount;
        broadcast.failedCount = failedCount;
        await broadcast.save();
      }
    }

    broadcast.sentCount = sentCount;
    broadcast.failedCount = failedCount;
    broadcast.status = "completed";
    await broadcast.save();

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
