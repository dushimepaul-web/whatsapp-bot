const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  jid: { type: String, required: true },
  groupId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, default: "" },
  pushName: { type: String, default: "" },
  isAdmin: { type: Boolean, default: false },
  isSuperAdmin: { type: Boolean, default: false },
  lastSeen: { type: Date },
}, { timestamps: true });

memberSchema.index({ jid: 1, groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Member", memberSchema);
