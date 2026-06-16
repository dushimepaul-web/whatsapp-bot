const logger = require("../utils/logger");
const Group = require("../models/Group");
const Member = require("../models/Member");
const ForwardingRule = require("../models/ForwardingRule");
const ForwardedMessage = require("../models/ForwardedMessage");
const Setting = require("../models/Setting");
const Log = require("../models/Log");
const broadcastManager = require("./broadcastManager");
const { extractCommand, escapeRegex } = require("../utils/helpers");

const COMMANDS = {
  help: { desc: "Affiche la liste des commandes disponibles" },
  ping: { desc: "Test de connexion du bot" },
  groupes: { desc: "Affiche les statistiques des groupes" },
  broadcast: { desc: "Lance une campagne broadcast (texte après la commande)" },
  forwarding: { desc: "Affiche l'état des règles de forwarding actives" },
  list: { desc: "Liste les groupes cibles (page: /list, /list 2, ...)" },
  stop: { desc: "Arrête définitivement le forwarding et vide la file d'attente" },
  resume: { desc: "Réactive le forwarding après un /stop" },
  stats: { desc: "Affiche les statistiques globales du bot" },
  logs: { desc: "Affiche les dernières actions (admin)" },
};

class CommandHandler {
  async _isAdmin(from, senderJid, userId) {
    try {
      if (!senderJid) return false;
      const senderPhone = senderJid.split("@")[0].split(":")[0];
      const members = await Member.find({ groupId: from, userId }).lean();
      for (const m of members) {
        const mp = m.jid.split("@")[0].split(":")[0];
        if (mp === senderPhone && (m.isAdmin || m.isSuperAdmin)) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async _getAdminsPhones(from, userId) {
    try {
      const admins = await Member.find({ groupId: from, userId, $or: [{ isAdmin: true }, { isSuperAdmin: true }] }).lean();
      return admins.map(a => a.jid);
    } catch { return []; }
  }

  async _notifyAdmins(sock, from, userId, senderName, cmdName) {
    const admins = await this._getAdminsPhones(from, userId);
    const group = await Group.findOne({ groupId: from, userId }).lean();
    const groupName = group?.name || from;
    for (const adminJid of admins) {
      try {
        await sock.sendMessage(adminJid, {
          text: `⚠️ *Commande refusée*\n\n👤 ${senderName} a tenté \`/${cmdName}\`\n📁 Groupe: ${groupName}`,
        });
      } catch (e) {
        logger.warn(`Impossible d'alerter l'admin ${adminJid}: ${e.message}`);
      }
    }
  }

  async _reply(sock, to, text, isPrivate = false) {
    try {
      await sock.sendMessage(to, { text });
      if (isPrivate) logger.info(`Réponse privée envoyée à ${to.split("@")[0]}`);
    } catch (err) {
      logger.warn(`Erreur envoi réponse: ${err.message}`);
    }
  }

  async handle(sock, msg, from, userId) {
    try {
      if (msg.key.fromMe) return;

      const rawContent = msg.message;
      const text = rawContent?.conversation || rawContent?.extendedTextMessage?.text || "";
      if (!text) return;

      const cmd = extractCommand(text);
      if (!cmd) return;

      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderName = msg.pushName || senderJid.split("@")[0];
      const isAdmin = await this._isAdmin(from, senderJid, userId);

      if (!isAdmin) {
        await sock.sendMessage(from, {
          text: "❌ Ces commandes sont réservées aux administrateurs du groupe.",
        });

        const adminJids = await this._getAdminsPhones(from, userId);
        const group = await Group.findOne({ groupId: from, userId }).lean();
        const groupName = group?.name || from;
        for (const adminJid of adminJids) {
          try {
            await sock.sendMessage(adminJid, {
              text: `⚠️ *Alerte Commande*\n\n👤 ${senderName} a tenté \`/${cmd.name}\`\n📁 ${groupName}\n💬 Pour répondre, envoie la commande toi-même dans le groupe.`,
            });
          } catch (e) {
            logger.warn(`Échec alerte admin ${adminJid}: ${e.message}`);
          }
        }
        return;
      }

      const groupInfo = await Group.findOne({ groupId: from, userId }).lean();
      const settings = await Setting.findOne({ userId }).lean();
      const allowedGroup = settings?.commandGroupName || "preparation group";
      if (!groupInfo || groupInfo.name?.toLowerCase() !== allowedGroup.toLowerCase()) {
        await sock.sendMessage(from, {
          text: `❌ Les commandes sont autorisées uniquement dans le groupe « ${allowedGroup} ».`,
        });
        return;
      }

      logger.info(`Commande reçue: ${cmd.name} args="${cmd.args.join(" ")}" de ${senderName}`);

      await logger.db({
        userId,
        type: "info",
        action: "command_executed",
        details: { command: cmd.name, args: cmd.args.join(" "), sender: senderName, group: from },
      });

      const respond = async (text) => {
        await sock.sendMessage(from, { text });
      };
      const respondPrivate = async (text) => {
        await sock.sendMessage(senderJid, { text });
      };

      switch (cmd.name) {
        case "help":
          await this.cmdHelp(respond);
          break;
        case "ping":
          await this.cmdPing(respond, senderJid);
          break;
        case "groupes":
          await this.cmdGroupes(respond, userId);
          break;
        case "broadcast":
          await this.cmdBroadcast(sock, respond, from, userId, cmd.args);
          break;
        case "forwarding":
          await this.cmdForwarding(respond, userId);
          break;
        case "list":
          await this.cmdList(respond, userId, cmd.args);
          break;
        case "stop":
          await this.cmdStop(sock, from, userId, respond);
          break;
        case "resume":
          await this.cmdResume(sock, from, userId, respond);
          break;
        case "stats":
          await this.cmdStats(respond, userId);
          break;
        case "logs":
          await this.cmdLogs(respond, userId);
          break;
        default:
          await sock.sendMessage(from, {
            text: `❌ Commande inconnue "${cmd.name}". Envoie \`/help\` pour voir les commandes disponibles.`,
          });
      }
    } catch (err) {
      logger.error(`Erreur commande: ${err.message}`);
    }
  }

  async cmdHelp(respond) {
    let msg = "🤖 *Commandes disponibles (admins)*\n\n";
    for (const [name, info] of Object.entries(COMMANDS)) {
      msg += `➤ \`/${name}\` — ${info.desc}\n`;
    }
    msg += "\n_Le préfixe est `/`_";
    await respond(msg);
  }

  async cmdPing(respond, senderJid) {
    const start = Date.now();
    await respond("🏓 Pong!");
    const latency = Date.now() - start;
    await respond(`⏱ Latence: ${latency}ms`);
  }

  async cmdGroupes(respond, userId) {
    const total = await Group.countDocuments({ userId });
    const visibles = await Group.countDocuments({ userId, isVisible: true });
    const restreints = await Group.countDocuments({ userId, isRestricted: true });
    const membres = await Member.countDocuments({ userId });
    const actifs = await Group.countDocuments({ userId, lastSync: { $ne: null } });

    const msg = `📊 *Statistiques des groupes*\n\n` +
      `📁 Total groupes: ${total}\n` +
      `👁 Visibles: ${visibles}\n` +
      `🔒 Restreints: ${restreints}\n` +
      `👥 Membres totaux: ${membres}\n` +
      `🔄 Synchronisés: ${actifs}`;

    await respond(msg);
  }

  async cmdBroadcast(sock, respond, from, userId, args) {
    const text = args.join(" ");
    if (!text) {
      await respond("📢 *Broadcast*\n\nUtilisation: `/broadcast Votre message ici`\n\nLe message sera envoyé à tous les groupes.");
      return;
    }

    const groups = await Group.find({ userId, isVisible: true });
    if (!groups.length) {
      await respond("❌ Aucun groupe visible trouvé.");
      return;
    }

    let sent = 0;
    let failed = 0;
    for (const group of groups) {
      try {
        await sock.sendMessage(group.groupId, { text });
        sent++;
        await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
      } catch (err) {
        logger.warn(`Échec broadcast vers ${group.groupId}: ${err.message}`);
        failed++;
      }
    }

    await respond(`📢 *Broadcast terminé*\n\n✅ Envoyé à ${sent} groupe(s)\n❌ Échec: ${failed}\n📁 Total: ${groups.length}`);
  }

  async cmdForwarding(respond, userId) {
    const rules = await ForwardingRule.find({ userId, isActive: true });
    if (!rules.length) {
      let msg = "📭 Aucune règle de forwarding active.";
      if (broadcastManager.isPaused(userId)) {
        msg += `\n\n⚠️ Le forwarding est en pause. Utilisez /resume pour réactiver.`;
      }
      await respond(msg);
      return;
    }

    const setting = await Setting.findOne({ userId }).lean();
    const pausedLabel = broadcastManager.isPaused(userId) ? "⚠️ *(EN PAUSE)*" : "";
    let msg = `🔄 *Règles de forwarding actives (${rules.length})* ${pausedLabel}\n\n`;
    for (const rule of rules) {
      const source = await Group.findOne({ groupId: rule.sourceGroupId, userId });
      msg += `➤ *${rule.name}*\n`;
      msg += `  Source: ${source?.name || rule.sourceGroupId}\n`;
      if (rule.forwardToMembers) {
        let pattern = rule.targetGroupPattern;
        if (!pattern) pattern = setting?.forwardingKeyword || "";
        const memberQuery = pattern
          ? { userId, groupId: { $in: (await Group.find({ userId, name: { $regex: escapeRegex(pattern), $options: "i" } }).select('groupId').lean()).map(g => g.groupId) } }
          : { userId };
        const memberCount = await Member.countDocuments(memberQuery);
        msg += `  Membres cibles: ${memberCount}\n`;
      } else if (rule.forwardToAllGroups || rule.masterGroup) {
        let pattern = rule.targetGroupPattern;
        if (!pattern) pattern = setting?.forwardingKeyword || "";
        const query = pattern
          ? { userId, name: { $regex: escapeRegex(pattern), $options: "i" } }
          : { userId };
        let ciblesCount = await Group.countDocuments(query);
        if (source && (!pattern || new RegExp(escapeRegex(pattern), "i").test(source.name))) {
          ciblesCount--;
        }
        msg += `  Cibles: ${ciblesCount}\n`;
      } else {
        const ciblesCount = rule.targetGroupIds?.length || 0;
        msg += `  Cibles: ${ciblesCount}\n`;
      }
      msg += `  Master: ${rule.masterGroup ? "✅" : "❌"} | Membres: ${rule.forwardToMembers ? "✅" : "❌"}\n\n`;
    }

    await respond(msg);
  }

  async cmdList(respond, userId, args) {
    const pattern = "NUFOTEC";
    const PAGE_SIZE = 50;
    const page = parseInt(args[0], 10) || 1;

    const groups = await Group.find(
      { userId, name: { $regex: pattern, $options: "i" } },
      { name: 1, groupId: 1 }
    ).sort({ name: 1 }).lean();

    if (!groups.length) {
      await respond("📭 Aucun groupe cible trouvé.");
      return;
    }

    const totalPages = Math.ceil(groups.length / PAGE_SIZE);
    if (page < 1 || page > totalPages) {
      await respond(`❌ Page ${page} inexistante. Pages: 1-${totalPages}`);
      return;
    }

    const start = (page - 1) * PAGE_SIZE;
    const batch = groups.slice(start, start + PAGE_SIZE);

    let msg = `📋 *Groupes cibles NUFOTEC* (${groups.length})\n`;
    msg += `📄 Page ${page}/${totalPages}\n\n`;
    for (let i = 0; i < batch.length; i++) {
      const idx = start + i + 1;
      msg += `${idx}. ${batch[i].name}\n`;
    }
    msg += `\n_/list ${page + 1} pour la page suivante_`;

    await respond(msg);
  }

  async cmdStop(sock, from, userId, respond) {
    await broadcastManager.stop(userId);

    await respond(`🛑 *Forwarding définitivement arrêté*\n\nTous les messages en attente (file mémoire + BDD) ont été supprimés. Utilisez /resume pour réactiver le forwarding.`);

    await logger.db({
      userId,
      type: "system",
      action: "forwarding_stopped_via_command",
      details: { from },
    });
  }

  async cmdResume(sock, from, userId, respond) {
    broadcastManager.resume(userId);

    await respond(`✅ *Forwarding réactivé*\n\nLe forwarding des nouveaux messages va reprendre.`);

    await logger.db({
      userId,
      type: "system",
      action: "forwarding_resumed_via_command",
      details: { from },
    });
  }

  async cmdStats(respond, userId) {
    const groups = await Group.countDocuments({ userId });
    const members = await Member.countDocuments({ userId });
    const rules = await ForwardingRule.countDocuments({ userId });
    const activeRules = await ForwardingRule.countDocuments({ userId, isActive: true });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const forwardToday = await ForwardedMessage.countDocuments({ userId, forwardedAt: { $gte: todayStart } });
    const forwardWeek = await ForwardedMessage.countDocuments({ userId, forwardedAt: { $gte: weekAgo } });

    const queueSize = broadcastManager.messageQueue.length;
    const adaptiveDelay = broadcastManager.adaptiveDelay || 1;

    const msg = `📊 *Statistiques*\n\n` +
      `📁 Groupes: ${groups}\n` +
      `👥 Membres: ${members}\n` +
      `🔄 Règles: ${rules} (${activeRules} actives)\n` +
      `📤 Forward aujourd'hui: ${forwardToday}\n` +
      `📤 Forward cette semaine: ${forwardWeek}\n` +
      `⏳ File d'attente: ${queueSize}\n` +
      `🐌 Délai adaptatif: ${adaptiveDelay.toFixed(1)}x\n` +
      `🤖 Bot: opérationnel`;

    await respond(msg);
  }

  async cmdLogs(respond, userId) {
    try {
      const logs = await Log.find({ userId })
        .sort({ createdAt: -1 }).limit(10).lean();

      if (!logs.length) {
        await respond("📭 Aucune action enregistrée.");
        return;
      }

      let msg = `📋 *Dernières actions (10)*\n\n`;
      for (const log of logs) {
        const time = new Date(log.createdAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" });
        const detail = log.details?.command
          ? `/${log.details.command}`
          : log.details?.action || log.action;
        msg += `▸ ${time} — ${detail}\n`;
      }
      msg += `\n_/stats pour les statistiques_`;

      await respond(msg);
    } catch (err) {
      logger.error(`Erreur cmdLogs: ${err.message}`);
      await respond("❌ Erreur lors de la récupération des logs.");
    }
  }
}

module.exports = new CommandHandler();
