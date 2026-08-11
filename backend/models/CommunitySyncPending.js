const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  communityJid: { type: String, required: true },
  groupId: { type: String, required: true },
  groupName: { type: String },
  status: { type: String, enum: ['PENDING', 'NOTIFIED', 'IGNORED'], default: 'PENDING' }
}, { timestamps: true });
module.exports = mongoose.model("CommunitySyncPending", schema);
