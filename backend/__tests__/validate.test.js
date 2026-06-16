process.env.JWT_SECRET = "test-jwt-secret-for-testing";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-testing";

const { schemas } = require("../middlewares/validate");

describe("Validation schemas - register", () => {
  test("valide un body correct", () => {
    const result = schemas.register.parse({ name: "Test", email: "test@example.com", password: "12345678" });
    expect(result.name).toBe("Test");
  });

  test("rejette email invalide", () => {
    expect(() => schemas.register.parse({ name: "Test", email: "pas-un-email", password: "12345678" })).toThrow();
  });

  test("rejette mot de passe trop court", () => {
    expect(() => schemas.register.parse({ name: "Test", email: "test@example.com", password: "123" })).toThrow();
  });

  test("rejette nom manquant", () => {
    expect(() => schemas.register.parse({ email: "test@example.com", password: "12345678" })).toThrow();
  });
});

describe("Validation schemas - login", () => {
  test("valide un body correct", () => {
    const result = schemas.login.parse({ email: "test@example.com", password: "12345678" });
    expect(result.email).toBe("test@example.com");
  });

  test("rejette email vide", () => {
    expect(() => schemas.login.parse({ email: "", password: "12345678" })).toThrow();
  });

  test("rejette mot de passe manquant", () => {
    expect(() => schemas.login.parse({ email: "test@example.com" })).toThrow();
  });
});

describe("Validation schemas - forgotPassword", () => {
  test("valide un email", () => {
    const result = schemas.forgotPassword.parse({ email: "test@example.com" });
    expect(result.email).toBe("test@example.com");
  });

  test("rejette email invalide", () => {
    expect(() => schemas.forgotPassword.parse({ email: "pas-email" })).toThrow();
  });
});

describe("Validation schemas - resetPassword", () => {
  test("valide un mot de passe correct", () => {
    const result = schemas.resetPassword.parse({ password: "12345678" });
    expect(result.password).toBe("12345678");
  });

  test("rejette mot de passe trop court", () => {
    expect(() => schemas.resetPassword.parse({ password: "123" })).toThrow();
  });
});

describe("Validation schemas - broadcast", () => {
  test("valide un broadcast text", () => {
    const result = schemas.broadcast.parse({ type: "text", content: { text: "Hello" } });
    expect(result.type).toBe("text");
  });

  test("rejette type invalide", () => {
    expect(() => schemas.broadcast.parse({ type: "video", content: {} })).toThrow();
  });
});

describe("Validation schemas - forwardingRule", () => {
  test("valide une règle complète", () => {
    const result = schemas.forwardingRule.parse({ name: "Ma règle", sourceGroupId: "abc@g.us" });
    expect(result.name).toBe("Ma règle");
  });

  test("rejette nom manquant", () => {
    expect(() => schemas.forwardingRule.parse({ sourceGroupId: "abc@g.us" })).toThrow();
  });

  test("rejette source manquante", () => {
    expect(() => schemas.forwardingRule.parse({ name: "Règle" })).toThrow();
  });
});

describe("Validation schemas - webhookSend", () => {
  test("valide un envoi text", () => {
    const result = schemas.webhookSend.parse({ to: "33612345678@s.whatsapp.net", text: "Hello" });
    expect(result.text).toBe("Hello");
  });

  test("rejette texte manquant", () => {
    expect(() => schemas.webhookSend.parse({ to: "33612345678@s.whatsapp.net" })).toThrow();
  });

  test("valide avec type image", () => {
    const result = schemas.webhookSend.parse({ to: "33612345678@s.whatsapp.net", text: "https://img.jpg", type: "image" });
    expect(result.type).toBe("image");
  });
});
