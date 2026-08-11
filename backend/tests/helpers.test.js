const { extractCommand, sleep, formatJid, escapeRegex } = require("../utils/helpers");

describe("extractCommand", () => {
  test("extracts command with prefix", () => {
    const result = extractCommand("/help");
    expect(result).toEqual({ name: "help", args: [] });
  });

  test("extracts command with args", () => {
    const result = extractCommand("/broadcast Hello world");
    expect(result).toEqual({ name: "broadcast", args: ["Hello", "world"] });
  });

  test("returns null for text without prefix", () => {
    expect(extractCommand("hello")).toBeNull();
  });

  test("returns null for empty text", () => {
    expect(extractCommand("")).toBeNull();
  });
});

describe("formatJid", () => {
  test("strips @ suffix", () => {
    expect(formatJid("123@s.whatsapp.net")).toBe("123");
  });

  test("returns empty for null", () => {
    expect(formatJid(null)).toBe("");
  });
});

describe("escapeRegex", () => {
  test("escapes special characters", () => {
    expect(escapeRegex("hello.world")).toBe("hello\\.world");
    expect(escapeRegex("(test)")).toBe("\\(test\\)");
  });
});
