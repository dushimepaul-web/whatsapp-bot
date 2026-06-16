process.env.JWT_SECRET = "test-jwt-secret-for-testing";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-testing";
process.env.NODE_ENV = "test";

// Mock rate limiter for tests
jest.mock("../middlewares/rateLimiter", () => ({
  authLimiter: (req, res, next) => next(),
  apiLimiter: (req, res, next) => next(),
  connectLimiter: (req, res, next) => next(),
  broadcastLimiter: (req, res, next) => next(),
  groupSyncLimiter: (req, res, next) => next(),
  forwardingLimiter: (req, res, next) => next(),
}));

const request = require("supertest");
const express = require("express");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let app;
let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();

  // Re-require modules with fresh env (after jest.mock hoisting)
  delete require.cache[require.resolve("../config/database")];
  delete require.cache[require.resolve("../config/index")];
  delete require.cache[require.resolve("../models/User")];
  delete require.cache[require.resolve("../models/Setting")];
  delete require.cache[require.resolve("../controllers/authController")];
  delete require.cache[require.resolve("../middlewares/auth")];
  delete require.cache[require.resolve("../middlewares/validate")];

  const connectDB = require("../config/database");
  await connectDB();

  app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use("/api/auth", require("../routes/auth"));
  app.use((err, req, res, next) => {
    res.status(500).json({ error: err?.message || "Internal server error" });
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe("Auth Integration", () => {
  let userToken;

  test("POST /api/auth/register - crée un utilisateur", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User", email: "test@test.com", password: "12345678" });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("test@test.com");
    expect(res.body.user.password).toBeUndefined();
    userToken = res.body.token;
  });

  test("POST /api/auth/register - rejette email déjà utilisé", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test User 2", email: "test@test.com", password: "12345678" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Email déjà utilisé");
  });

  test("POST /api/auth/register - rejette body invalide (Zod)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test", email: "pas-email", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("POST /api/auth/login - connecte un utilisateur", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "12345678" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe("test@test.com");
    userToken = res.body.token;
  });

  test("POST /api/auth/login - rejette mauvais mot de passe", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test("POST /api/auth/login - rejette body invalide (Zod)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "", password: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("GET /api/auth/me - retourne l'utilisateur", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("test@test.com");
  });

  test("GET /api/auth/me - rejette sans token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  test("POST /api/auth/forgot-password - ne retourne PAS le token en clair", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "test@test.com" });

    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
    expect(res.body.message).toContain("email");
  });

  test("POST /api/auth/forgot-password - rejette email invalide (Zod)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "pas-email" });

    expect(res.status).toBe(400);
  });
});
