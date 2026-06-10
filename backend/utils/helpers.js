const config = require("../config");

const extractCommand = (text) => {
  if (!text || !text.startsWith(config.whatsapp.prefix)) return null;
  const parts = text.slice(config.whatsapp.prefix.length).trim().split(" ");
  return {
    name: parts[0]?.toLowerCase(),
    args: parts.slice(1),
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const formatJid = (jid) => {
  if (!jid) return "";
  return jid.split("@")[0];
};

const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports = { extractCommand, sleep, formatJid, escapeRegex };
