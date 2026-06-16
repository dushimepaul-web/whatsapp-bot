const mongoose = require("mongoose");

const pendingForwardSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  targetId: { type: String, required: true },
  ruleId: { type: String, default: "auto" },
  ruleName: { type: String, default: "" },
  msgKey: { type: mongoose.Schema.Types.Mixed },
  msgData: { type: mongoose.Schema.Types.Mixed },
  retryCount: { type: Number, default: 0, max: 3 },
  lastError: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

pendingForwardSchema.index({ createdAt: 1 });

module.exports = mongoose.model("PendingForward", pendingForwardSchema);
