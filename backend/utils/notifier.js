const https = require("https");
const logger = require("./logger");
const Setting = require("../models/Setting");

const TELEGRAM_API = "https://api.telegram.org/bot";

class Notifier {
  async sendTelegram(userId, message) {
    try {
      if (!userId) return;
      const settings = await Setting.findOne({ userId });
      if (!settings?.telegramToken || !settings?.telegramChatId) return;

      const url = `${TELEGRAM_API}${settings.telegramToken}/sendMessage`;
      const data = JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message,
        parse_mode: "HTML",
      });

      return new Promise((resolve, reject) => {
        const req = https.request(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
        }, (res) => {
          let body = "";
          res.on("data", (chunk) => body += chunk);
          res.on("end", () => {
            if (res.statusCode === 200) {
              logger.info(`Notification Telegram envoyée à user=${userId}`);
            } else {
              logger.warn(`Erreur Telegram HTTP ${res.statusCode}: ${body}`);
            }
            resolve();
          });
        });
        req.on("error", (err) => {
          logger.warn(`Erreur envoi Telegram: ${err.message}`);
          resolve();
        });
        req.write(data);
        req.end();
      });
    } catch (err) {
      logger.warn(`Erreur notif Telegram: ${err.message}`);
    }
  }

  async notifyDisconnect(userId, phone, reason) {
    const msg = `🔌 <b>WhatsApp Déconnecté</b>\n\n📱 Numéro: ${phone || "inconnu"}\n❗ Raison: ${reason}\n🕐 ${new Date().toLocaleString("fr-FR")}`;
    await this.sendTelegram(userId, msg);

    await this.sendWebhook(userId, {
      event: "disconnect",
      phone,
      reason,
      time: new Date().toISOString(),
    });
  }

  async notifyConnect(userId, phone) {
    const msg = `✅ <b>WhatsApp Connecté</b>\n\n📱 Numéro: ${phone}\n🕐 ${new Date().toLocaleString("fr-FR")}`;
    await this.sendTelegram(userId, msg);
  }

  async notifyError(userId, action, error) {
    const settings = await Setting.findOne({ userId });
    if (!settings?.notifyOnError) return;

    const msg = `⚠️ <b>Erreur Bot</b>\n\nAction: ${action}\nErreur: ${error}\n🕐 ${new Date().toLocaleString("fr-FR")}`;
    await this.sendTelegram(userId, msg);
  }

  async notifyNewUser(userId, email, name) {
    const msg = `👤 <b>Nouvel utilisateur</b>\n\nNom: ${name}\nEmail: ${email}\n🕐 ${new Date().toLocaleString("fr-FR")}`;
    await this.sendTelegram(userId, msg);
  }

  async sendWebhook(userId, payload) {
    try {
      const settings = await Setting.findOne({ userId });
      if (!settings?.webhookUrl) return;

      const url = new URL(settings.webhookUrl);
      const data = JSON.stringify(payload);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      if (settings.webhookApiKey) {
        options.headers["Authorization"] = `Bearer ${settings.webhookApiKey}`;
      }

      return new Promise((resolve) => {
        const req = https.request(options, (res) => {
          let body = "";
          res.on("data", (chunk) => body += chunk);
          res.on("end", () => {
            logger.info(`Webhook envoyé à ${settings.webhookUrl} (${res.statusCode})`);
            resolve();
          });
        });
        req.on("error", (err) => {
          logger.warn(`Erreur webhook: ${err.message}`);
          resolve();
        });
        req.write(data);
        req.end();
      });
    } catch (err) {
      logger.warn(`Erreur envoi webhook: ${err.message}`);
    }
  }
}

module.exports = new Notifier();
