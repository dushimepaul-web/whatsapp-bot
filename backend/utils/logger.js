const pino = require("pino");
const Log = require("../models/Log");
const logHub = require("./logHub");

const isDev = process.env.NODE_ENV === "development";
const transport = isDev
  ? pino.transport({ target: "pino-pretty", options: { colorize: true } })
  : undefined;

const pinoInstance = isDev ? pino({ level: "info" }, transport) : pino({ level: "info" });

const logToDB = async (data) => {
  try {
    await Log.create(data);
    return true;
  } catch (err) {
    pinoInstance.error("Erreur sauvegarde log DB:", err);
    return false;
  }
};

pinoInstance.db = logToDB;

const LEVELS = ["info", "warn", "error", "debug", "trace", "fatal"];
for (const level of LEVELS) {
  const original = pinoInstance[level].bind(pinoInstance);
  pinoInstance[level] = function (...args) {
    const result = original(...args);
    try {
      const parts = args.map((a) => {
        if (typeof a === "string") return a;
        if (a instanceof Error) return a.message;
        if (a && typeof a === "object") return JSON.stringify(a).slice(0, 300);
        return String(a);
      });
      const message = parts.filter(Boolean).join(" ").trim();
      logHub.emit("log", {
        level: level === "fatal" ? "error" : level,
        message: message || "(empty)",
        timestamp: Date.now(),
      });
    } catch (_) {}
    return result;
  };
}

const logger = pinoInstance;
module.exports = logger;
