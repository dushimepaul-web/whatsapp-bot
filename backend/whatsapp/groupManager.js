const Group = require("../models/Group");
const Member = require("../models/Member");
const whatsappService = require("../services/whatsappService");
const logger = require("../utils/logger");

class GroupManager {
  async refreshGroups() {
    return whatsappService.syncGroups();
  }

  async getGroups({ page = 1, limit = 50, search } = {}) {
    const query = {};
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

  async getGroupById(groupId) {
    const group = await Group.findOne({ groupId });
    if (!group) throw new Error("Groupe introuvable");
    return group;
  }

  async getGroupMembers(groupId) {
    const group = await Group.findOne({ groupId });
    if (!group) throw new Error("Groupe introuvable");
    return Member.find({ groupId }).sort({ name: 1 });
  }

  async getGroupAdmins(groupId) {
    return Member.find({ groupId, isAdmin: true }).sort({ name: 1 });
  }

  async getStats() {
    const totalGroups = await Group.countDocuments();
    const totalMembers = await Member.countDocuments();
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
