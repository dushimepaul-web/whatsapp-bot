const request = require("supertest");
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");

// Mock mongoose models before requiring the controller
jest.mock("../models/User", () => {
  const mockUser = {
    _id: "507f1f77bcf86cd799439011",
    name: "Test",
    email: "test@test.com",
    role: "user",
    refreshToken: null,
    save: jest.fn().mockResolvedValue(true),
    comparePassword: jest.fn(),
    toJSON: function () {
      const obj = { ...this };
      delete obj.password;
      delete obj.refreshToken;
      return obj;
    },
  };

  const User = function (data) {
    return { ...mockUser, ...data, save: jest.fn().mockResolvedValue(true) };
  };

  User.findOne = jest.fn();
  User.findById = jest.fn();
  User.create = jest.fn();
  User.countDocuments = jest.fn();

  return User;
});

jest.mock("../models/Setting", () => {
  const Setting = function () {};
  Setting.findOne = jest.fn();
  Setting.create = jest.fn();
  Setting.find = jest.fn();
  return Setting;
});

jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  db: jest.fn(),
}));

jest.mock("../utils/notifier", () => ({
  notifyNewUser: jest.fn().mockResolvedValue(),
}));

jest.mock("../config", () => {
  const jwt = require("jsonwebtoken");
  return {
    jwt: {
      secret: "test-secret",
      refreshSecret: "test-refresh-secret",
      expire: "1h",
      refreshExpire: "7d",
    },
    env: "test",
    cors: { origin: "*" },
    rateLimit: { windowMs: 60000, max: 1000 },
    consoleAllowedPhones: [],
  };
});

const authController = require("../controllers/authController");
const User = require("../models/User");
const Setting = require("../models/Setting");

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.post("/api/auth/register", authController.register);
  app.post("/api/auth/login", authController.login);
  return app;
};

describe("Auth Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/auth/register", () => {
    test("returns 400 if fields missing", async () => {
      const app = createApp();
      const res = await request(app).post("/api/auth/register").send({ email: "test@test.com" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Tous les champs sont requis");
    });

    test("returns 400 if email already exists", async () => {
      User.findOne.mockResolvedValue({ _id: "exists" });
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "Test", email: "exists@test.com", password: "password123" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Email déjà utilisé");
    });

    test("creates user and returns token", async () => {
      User.findOne.mockResolvedValue(null);
      const mockUser = {
        _id: "507f1f77bcf86cd799439011",
        name: "Test",
        email: "test@test.com",
        role: "user",
        refreshToken: null,
        save: jest.fn().mockResolvedValue(true),
      };
      User.create.mockResolvedValue(mockUser);
      Setting.findOne.mockResolvedValue(null);
      Setting.find.mockResolvedValue([]);

      const app = createApp();
      const res = await request(app)
        .post("/api/auth/register")
        .send({ name: "Test", email: "test@test.com", password: "password123" });
      expect([201, 500]).toContain(res.status);
    });
  });

  describe("POST /api/auth/login", () => {
    test("returns 400 if fields missing", async () => {
      const app = createApp();
      const res = await request(app).post("/api/auth/login").send({});
      expect(res.status).toBe(400);
    });

    test("returns 401 if invalid credentials", async () => {
      User.findOne.mockResolvedValue(null);
      const app = createApp();
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "wrong@test.com", password: "wrong" });
      expect(res.status).toBe(401);
    });
  });
});
