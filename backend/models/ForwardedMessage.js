const mongoose = require("mongoose");

const forwardedMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sourceMsgId: { type: String, required: true },
  sourceGroupId: { type: String, required: true },
  targetGroupId: { type: String, required: true },
  targetMsgId: { type: String, required: true },
  ruleId: { type: String },
  forwardedAt: { type: Date, default: Date.now },
});

forwardedMessageSchema.index({ sourceMsgId: 1, sourceGroupId: 1, userId: 1 });
forwardedMessageSchema.index({ targetMsgId: 1 });

module.exports = mongoose.model("ForwardedMessage", forwardedMessageSchema);
