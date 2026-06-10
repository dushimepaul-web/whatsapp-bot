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
    prefix: process.env.WHATSAPP_PREFIX || ">",
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 30,
  },
  cors: {
    origin: (() => {
      const origins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map(o => o.trim()) : [];
      if (process.env.NODE_ENV !== "production") {
        const devOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"];
        return Array.from(new Set([...origins, ...devOrigins]));
      }
      return origins.length === 1 ? origins[0] : origins;
    })(),
  },
  env: process.env.NODE_ENV || "development",
};
