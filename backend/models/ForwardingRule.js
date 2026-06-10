const mongoose = require("mongoose");

const forwardingRuleSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, default: "Règle sans nom" },
  sourceGroupId: { type: String, required: true },
  targetGroupIds: [{ type: String }],
  targetGroupPattern: { type: String, default: "" },
  forwardToAllGroups: { type: Boolean, default: false },
  forwardToMembers: { type: Boolean, default: false },
  onlyAdmins: { type: Boolean, default: false },
  masterGroup: { type: Boolean, default: false },
  includeMedia: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("ForwardingRule", forwardingRuleSchema);
