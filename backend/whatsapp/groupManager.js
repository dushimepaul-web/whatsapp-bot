const Group = require("../models/Group");
const Member = require("../models/Member");
const logger = require("../utils/logger");

class GroupManager {
  async refreshGroups(userId) {
    const whatsappService = require("../services/whatsappService");
    return whatsappService.syncGroups(userId);
  }

  async getGroups({ page = 1, limit = 50, search, userId } = {}) {
    const query = { userId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    const total = await Group.countDocuments(query);
    const groups = await Group.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    return { groups, total, page, pages: Math.ceil(total / limit) };
  }

  async getGroupById(groupId, userId) {
    const group = await Group.findOne({ groupId, userId });
    if (!group) throw new Error("Groupe introuvable");
    return group;
  }

  async getGroupMembers(groupId, userId) {
    const group = await Group.findOne({ groupId, userId });
    if (!group) throw new Error("Groupe introuvable");
    return Member.find({ groupId, userId }).sort({ name: 1 });
  }

  async getGroupAdmins(groupId, userId) {
    return Member.find({ groupId, userId, isAdmin: true }).sort({ name: 1 });
  }

  async getStats(userId) {
    const totalGroups = await Group.countDocuments({ userId });
    const totalMembers = await Member.countDocuments({ userId });
    return { totalGroups, totalMembers };
  }

  async sendMessageToMember(sock, jid, text) {
    try {
      await sock.sendMessage(jid, { text });
      return true;
    } catch (err) {
      logger.error(`Erreur envoi message à ${jid}: ${err}`);
      return false;
    }
  }

  async sendMessageToGroup(sock, groupId, text) {
    try {
      await sock.sendMessage(groupId, { text });
      return true;
    } catch (err) {
      logger.error(`Erreur envoi message groupe ${groupId}: ${err}`);
      return false;
    }
  }
}

module.exports = new GroupManager();
