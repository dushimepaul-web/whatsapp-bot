const User = require("../models/User");
const Setting = require("../models/Setting");
const ForwardingRule = require("../models/ForwardingRule");
const Group = require("../models/Group");
const logger = require("../utils/logger");

const TARGET_PHONE = "25779666439";

async function applyDefaultConfig(userId, phone) {
  if (phone !== TARGET_PHONE) return;

  try {
    logger.info(`[defaultConfig] Application de la config par défaut pour user=${userId} (${phone})`);

    // 1. Appliquer les paramètres UNE SEULE FOIS (à la création du document)
    //    $setOnInsert ne modifie jamais un document existant
    await Setting.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          autoRestrictKeyword: "nufotec",
          forwardingKeyword: "NUFOTEC",
          masterGroupKeyword: "GROUPES",
          inboxKeyword: "INBOX",
          moderationEnabled: true,
          commandGroupName: "CONTENT PREPARATION",
          autoRejectCalls: false,
          rateLimitMessagesPerMinute: 30,
          rateLimitDelayBetween: 1000,
          rateLimitDailyLimit: 5000,
        },
      },
      { upsert: true }
    );
    logger.info(`[defaultConfig] Paramètres vérifiés pour user=${userId}`);

    // 2. Restreindre tous les groupes contenant "nufotec"
    const restrictedResult = await Group.updateMany(
      { userId, name: { $regex: /nufotec/i } },
      { $set: { isRestricted: true } }
    );
    if (restrictedResult.modifiedCount > 0) {
      logger.info(`[defaultConfig] ${restrictedResult.modifiedCount} groupes restreints (nufotec) pour user=${userId}`);
    }

    // 3. Créer les règles de forwarding par défaut si elles n'existent pas
    const existingRules = await ForwardingRule.find({ userId });

    // Chercher les groupes par nom pour obtenir les JIDs réels
    const groups = await Group.find({ userId }).lean();
    const getGroupJid = (pattern) => {
      const group = groups.find((g) => g.name && new RegExp(pattern, "i").test(g.name));
      return group ? group.groupId : null;
    };

    // Règle 1: MASTER GROUPES → NUFOTEC (forward vers tous les groupes avec motif NUFOTEC)
    const rule1Exists = existingRules.some((r) => /MASTER\s*GROUPES?\s*→/.test(r.name));
    if (!rule1Exists) {
      const masterJid = getGroupJid("MASTER") || "Nº1.MASTER GROUPES";
      await ForwardingRule.create({
        userId,
        name: "MASTER GROUPES → NUFOTEC",
        sourceGroupId: masterJid,
        targetGroupIds: [],
        forwardToAllGroups: true,
        forwardToMembers: false,
        onlyAdmins: false,
        masterGroup: true,
        includeMedia: true,
        isActive: true,
        targetGroupPattern: "NUFOTEC",
      });
      logger.info(`[defaultConfig] Règle "MASTER GROUPES → NUFOTEC" créée pour user=${userId} (source: ${masterJid})`);
    }

    // Règle 2: Nº2.MASTER INBOX → TOUS LES MEMBRES
    const rule2Exists = existingRules.some((r) => /INBOX\s*→/.test(r.name));
    if (!rule2Exists) {
      const inboxJid = getGroupJid("INBOX") || "Nº2.MASTER INBOX";
      await ForwardingRule.create({
        userId,
        name: "Nº2.MASTER INBOX → TOUS LES MEMBRES",
        sourceGroupId: inboxJid,
        targetGroupIds: [],
        forwardToAllGroups: true,
        forwardToMembers: true,
        onlyAdmins: false,
        masterGroup: false,
        includeMedia: true,
        isActive: true,
        targetGroupPattern: "NUFOTEC",
      });
      logger.info(`[defaultConfig] Règle "Nº2.MASTER INBOX → TOUS LES MEMBRES" créée pour user=${userId} (source: ${inboxJid})`);
    }

    logger.info(`[defaultConfig] Configuration terminée pour user=${userId}`);
  } catch (err) {
    logger.error(`[defaultConfig] Erreur pour user=${userId}:`, err);
  }
}

module.exports = { applyDefaultConfig, TARGET_PHONE };
