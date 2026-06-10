const mongoose = require("mongoose");

const settingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  prefix: { type: String, default: ">" },
  rateLimitMessagesPerMinute: { type: Number, default: 30 },
  rateLimitDelayBetween: { type: Number, default: 1000 },
  rateLimitDailyLimit: { type: Number, default: 5000 },
  moderationEnabled: { type: Boolean, default: true },
  autoRejectCalls: { type: Boolean, default: true },
  welcomeMessage: { type: String, default: "Bienvenue dans le groupe !" },
}, { timestamps: true });

module.exports = mongoose.model("Setting", settingSchema);
