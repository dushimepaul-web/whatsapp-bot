const mongoose = require("mongoose");

const autoReplySchema = new mongoose.Schema({
  keyword: { type: String, required: true },
  response: { type: String, required: true },
  exactMatch: { type: Boolean, default: false },
  groupIds: [{ type: String }],
}, { _id: true });

const settingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  prefix: { type: String, default: "/" },
  rateLimitMessagesPerMinute: { type: Number, default: 30 },
  rateLimitDelayBetween: { type: Number, default: 1000 },
  rateLimitDailyLimit: { type: Number, default: 5000 },
  moderationEnabled: { type: Boolean, default: true },
  autoRejectCalls: { type: Boolean, default: true },
  welcomeMessage: { type: String, default: "Bienvenue dans le groupe !" },
  forwardingKeyword: { type: String, default: "NUFOTEC" },
  masterGroupKeyword: { type: String, default: "" },
  autoReplies: { type: [autoReplySchema], default: [] },
  telegramToken: { type: String, default: "" },
  telegramChatId: { type: String, default: "" },
  notifyOnDisconnect: { type: Boolean, default: false },
  notifyOnError: { type: Boolean, default: false },
  notifyOnNewUser: { type: Boolean, default: false },
  webhookUrl: { type: String, default: "" },
  webhookApiKey: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Setting", settingSchema);
