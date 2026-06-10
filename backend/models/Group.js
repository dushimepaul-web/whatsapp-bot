const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: "" },
  owner: { type: String },
  memberCount: { type: Number, default: 0 },
  adminCount: { type: Number, default: 0 },
  isVisible: { type: Boolean, default: true },
  isRestricted: { type: Boolean, default: false },
  botIsAdmin: { type: Boolean, default: false },
  lastSync: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model("Group", groupSchema);
