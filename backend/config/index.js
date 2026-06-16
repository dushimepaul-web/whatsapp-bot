require("dotenv").config();

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp-bot",
  jwt: {
secret: process.env.JWT_SECRET || (() => { throw new Error("JWT_SECRET manquant dans .env"); })(),
refreshSecret: process.env.JWT_REFRESH_SECRET || (() => { throw new Error("JWT_REFRESH_SECRET manquant dans .env"); })(),
    expire: process.env.JWT_EXPIRE || "1h",
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || "7d",
  },
  whatsapp: {
    prefix: process.env.WHATSAPP_PREFIX || "/",
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30,
  },
  cors: {
    origin: (() => {
      const origins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(o => o.trim()) : [];
      const localOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000",
                            "http://localhost:9016", "http://127.0.0.1:9016"];
      return Array.from(new Set([...origins, ...localOrigins]));
    })(),
  },
  env: process.env.NODE_ENV || "development",
  consoleAllowedPhones: (process.env.CONSOLE_ALLOWED_PHONES || "").split(",").map(s => s.trim()).filter(Boolean),
};
