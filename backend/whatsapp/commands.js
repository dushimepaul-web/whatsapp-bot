const logger = require("../utils/logger");
const Group = require("../models/Group");
const Member = require("../models/Member");
const Log = require("../models/Log");
const Setting = require("../models/Setting");
const communityService = require("../services/communityService");
const { extractCommand } = require("../utils/helpers");

const DEFAULT_ALLOWED_GROUPS = ["preparation group", "content preparation"];

const COMMANDS = {
  help: { desc: "Affiche la liste des commandes disponibles" },
  ping: { desc: "Test de connexion du bot" },
  groupes: { desc: "Affiche les statistiques des groupes" },
  broadcast: { desc: "Lance une campagne broadcast (texte après la commande)" },
  logs: { desc: "Affiche les dernières actions (admin)" },
  scan: { desc: "Scanne et identifie les groupes NUFOTEC à ajouter à la communauté" },
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
      const allowedNames = (settings?.commandAllowedGroups && settings.commandAllowedGroups.length > 0)
        ? settings.commandAllowedGroups
        : DEFAULT_ALLOWED_GROUPS;
      const isAllowed = groupInfo && allowedNames.some(n => groupInfo.name?.toLowerCase() === n.toLowerCase());
      if (!isAllowed) {
        await sock.sendMessage(from, {
          text: "❌ Les commandes sont autorisées uniquement dans le groupe « Content Preparation ».",
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
        case "logs":
          await this.cmdLogs(respond, userId);
          break;
        case "scan":
          logger.info("DEBUG: Case 'scan' matched.");
          await this.cmdScan(sock, respond, userId);
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

  async cmdScan(sock, respond, userId) {
    await respond("🔍 *Scan des communautés en cours...*");
    try {
      const result = await communityService.scan(sock, userId);
      if (result.error) {
        await respond(`❌ ${result.error}`);
        return;
      }

      let msg = `✅ *Scan terminé*\n\n`;
      msg += `🏢 Communauté: ${result.communityName}\n`;
      msg += `👥 Total groupes NUFOTEC détectés: ${result.totalNufotecGroups}\n`;
      msg += `🔗 Déjà liés: ${result.alreadyLinked}\n`;
      msg += `⚠️ Groupes manquants: ${result.missingCount}\n`;

      if (result.missingCount > 0) {
        msg += `\n📝 *Liste des groupes manquants:*\n`;
        result.missingGroups.forEach(name => msg += `• ${name}\n`);
        msg += `\n❗ *Note:* WhatsApp ne permet pas l'ajout automatique. Veuillez ajouter ces groupes manuellement à la communauté.`;
      }
      await respond(msg);
    } catch (err) {
      logger.error(`Erreur cmdScan: ${err.message}`);
      await respond("❌ Une erreur est survenue lors du scan des communautés.");
    }
  }
}

module.exports = new CommandHandler();
