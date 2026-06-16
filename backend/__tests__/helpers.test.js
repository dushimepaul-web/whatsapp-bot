// Set env vars before importing config
process.env.JWT_SECRET = "test-jwt-secret-for-testing";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-for-testing";

const { extractCommand, escapeRegex, formatJid } = require("../utils/helpers");

describe("extractCommand", () => {
  test("extrait une commande simple", () => {
    const cmd = extractCommand("/help");
    expect(cmd).toEqual({ name: "help", args: [] });
  });

  test("extrait une commande avec arguments", () => {
    const cmd = extractCommand("/stats all users");
    expect(cmd).toEqual({ name: "stats", args: ["all", "users"] });
  });

  test("retourne null si pas de préfixe", () => {
    expect(extractCommand("hello")).toBeNull();
  });

  test("extrait une commande avec le préfixe par défaut (/)", () => {
    const result = extractCommand("/test arg1 arg2");
    expect(result.name).toBe("test");
    expect(result.args).toEqual(["arg1", "arg2"]);
  });
});

describe("escapeRegex", () => {
  test("échappe les caractères spéciaux", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("(test)")).toBe("\\(test\\)");
    expect(escapeRegex("a+b*c?")).toBe("a\\+b\\*c\\?");
  });

  test("chaîne simple inchangée", () => {
    expect(escapeRegex("hello")).toBe("hello");
  });
});

describe("formatJid", () => {
  test("extrait le numéro du JID", () => {
    expect(formatJid("33612345678@s.whatsapp.net")).toBe("33612345678");
  });

  test("retourne chaîne vide pour null/undefined", () => {
    expect(formatJid(null)).toBe("");
    expect(formatJid("")).toBe("");
  });
});
