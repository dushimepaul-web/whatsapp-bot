const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["info", "warn", "error", "moderation", "broadcast", "message", "system"], required: true },
  action: { type: String, required: true },
  details: { type: mongoose.Schema.Types.Mixed },
  from: { type: String },
  target: { type: String },
}, { timestamps: true });

logSchema.index({ createdAt: -1 });
logSchema.index({ type: 1, createdAt: -1 });
logSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });

module.exports = mongoose.model("Log", logSchema);
