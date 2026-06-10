const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["text", "image", "poll"], default: "text" },
  content: { type: mongoose.Schema.Types.Mixed, required: true },
  targetGroups: [{ type: String }],
  targetMembers: [{ type: String }],
  toAllGroups: { type: Boolean, default: false },
  toAllMembers: { type: Boolean, default: false },
  status: { type: String, enum: ["pending", "sending", "completed", "failed"], default: "pending" },
  sentCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Broadcast", broadcastSchema);
