const mongoose = require("mongoose");

const whatsappSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["connecting", "connected", "disconnected", "error"], default: "disconnected" },
  qrCode: { type: String },
  pairingCode: { type: String },
  phone: { type: String },
  lastSync: { type: Date },
}, { timestamps: true });

whatsappSessionSchema.index({ userId: 1 });

module.exports = mongoose.model("WhatsappSession", whatsappSessionSchema);
