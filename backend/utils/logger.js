const pino = require("pino");
const Log = require("../models/Log");

const transport = pino.transport({
  target: "pino-pretty",
  options: { colorize: true }
});

const logger = pino({ level: "info" }, transport);

const logToDB = async (data) => {
  try {
    await Log.create(data);
    return true;
  } catch (err) {
    logger.error("Erreur sauvegarde log DB:", err);
    return false;
  }
};

logger.db = logToDB;

module.exports = logger;
