const mongoose = require("mongoose");
const config = require("./index");
const logger = require("../utils/logger");

mongoose.set("strictQuery", true);

const connectDB = async (retries = 5) => {
  while (retries > 0) {
    try {
      const conn = await mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 5000,
        authSource: "admin",
      });
      logger.info(`MongoDB connectée: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      retries--;
      logger.error(`Erreur MongoDB (${retries} tentatives restantes): ${err.message}`);
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
};

module.exports = connectDB;
