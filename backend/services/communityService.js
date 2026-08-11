const Group = require("../models/Group");
const CommunitySyncPending = require("../models/CommunitySyncPending");
const logger = require("../utils/logger");

const isValidNufotecGroup = (name) => {
  const cleanName = name.trim();
  if (!cleanName.toUpperCase().includes("NUFOTEC")) return false;
  if (/^\d/.test(cleanName)) return false;
  if (/^[^a-zA-Z]/.test(cleanName)) return false;
  return true;
};

class CommunityService {
  async scan(sock, userId) {
    try {
      const allGroups = await sock.groupFetchAllParticipating();
      
      // DEBUG: Log everything found
      logger.info(`DEBUG: Scanning all groups. Total: ${Object.keys(allGroups).length}`);
      
      const communities = Object.values(allGroups).filter(g => g.isCommunity);
      logger.info(`DEBUG: Communities found: ${communities.length}`);
      
      communities.forEach(c => {
        logger.info(`DEBUG: Community: ${c.subject} | Owner: ${c.owner} | ID: ${c.id}`);
      });

      const botId = sock.user?.id?.split(":")[0];
      logger.info(`DEBUG: Bot ID (normalized): ${botId}`);

      // Try finding by name first, ignoring owner temporarily to see if it even finds it
      const targetCommunity = communities.find(c => c.subject === "COMMUNAUTE NUFOTEC AGRI-BIO SANTE");

      if (!targetCommunity) {
          logger.warn("DEBUG: Target community NOT found by name.");
          return { error: "Communauté non trouvée. Assurez-vous que le nom est exact." };
      }

      // Check owner logic
      const ownerId = targetCommunity.owner?.split(":")[0];
      if (ownerId !== botId) {
          logger.warn(`DEBUG: Ownership mismatch. Bot: ${botId} | Owner: ${ownerId}`);
          return { error: `Communauté trouvée, mais le bot n'est pas reconnu comme propriétaire (Bot: ${botId}, Propriétaire: ${ownerId})` };
      }

      // Discover NUFOTEC groups (strictly named)
      const nufotecGroups = Object.values(allGroups).filter(g => 
        !g.isCommunity && isValidNufotecGroup(g.subject)
      );

      const existingCommunityGroupsJids = Object.values(allGroups)
        .filter(g => g.parentJid === targetCommunity.id)
        .map(g => g.id);

      const missingGroups = nufotecGroups.filter(g => !existingCommunityGroupsJids.includes(g.id));

      // Save missing to DB
      for (const group of missingGroups) {
        await CommunitySyncPending.findOneAndUpdate(
          { userId, groupId: group.id },
          { 
            userId,
            communityJid: targetCommunity.id,
            groupId: group.id,
            groupName: group.subject,
            status: 'PENDING'
          },
          { upsert: true }
        );
      }

      return {
        communityName: targetCommunity.subject,
        totalNufotecGroups: nufotecGroups.length,
        alreadyLinked: existingCommunityGroupsJids.length,
        missingCount: missingGroups.length,
        missingGroups: missingGroups.map(g => g.subject)
      };
    } catch (e) {
      logger.error(`Erreur scan communauté user=${userId}: ${e.message}`);
      throw e;
    }
  }
}

module.exports = new CommunityService();
