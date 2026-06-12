const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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

groupSchema.index({ groupId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("Group", groupSchema);
