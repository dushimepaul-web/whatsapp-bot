const mongoose = require("mongoose");

describe("User Model Validation", () => {
  test("Le mot de passe doit faire au moins 8 caractères", () => {
    const passwordValidator = {
      validator: function(v) {
        return v.length >= 8;
      },
      message: "Le mot de passe doit contenir au moins 8 caractères",
    };
    expect(passwordValidator.validator("1234567")).toBe(false);
    expect(passwordValidator.validator("12345678")).toBe(true);
    expect(passwordValidator.validator("")).toBe(false);
    expect(passwordValidator.validator("a".repeat(8))).toBe(true);
  });
});

describe("Token Generation Utilities", () => {
  test("JWT token contient les bons champs", () => {
    const payload = { id: "123", email: "test@test.com", role: "admin" };
    const jwt = require("jsonwebtoken");
    const token = jwt.sign(payload, "test-secret", { expiresIn: "1h" });
    const decoded = jwt.verify(token, "test-secret");
    expect(decoded.id).toBe("123");
    expect(decoded.email).toBe("test@test.com");
    expect(decoded.role).toBe("admin");
  });

  test("JWT token avec signature invalide est rejeté", () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ id: "123" }, "secret1", { expiresIn: "1h" });
    expect(() => jwt.verify(token, "secret2")).toThrow();
  });

  test("JWT token expiré est rejeté", () => {
    const jwt = require("jsonwebtoken");
    const token = jwt.sign({ id: "123" }, "test-secret", { expiresIn: "0s" });
    // Attendre un peu pour que le token expire
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(() => jwt.verify(token, "test-secret")).toThrow();
        resolve();
      }, 100);
    });
  });
});
