const { isValidUrl, isPrivateIP } = require("../utils/urlValidator");

describe("SSRF Protection - isPrivateIP", () => {
  test("localhost est bloqué", () => {
    expect(isPrivateIP("localhost")).toBe(true);
  });
  test("127.0.0.1 est bloqué", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true);
  });
  test("10.0.0.1 est bloqué (plage privée)", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true);
  });
  test("192.168.1.1 est bloqué (plage privée)", () => {
    expect(isPrivateIP("192.168.1.1")).toBe(true);
  });
  test("172.16.0.1 est bloqué (plage privée)", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true);
  });
  test("169.254.1.1 est bloqué (link-local)", () => {
    expect(isPrivateIP("169.254.1.1")).toBe(true);
  });
  test("0.0.0.0 est bloqué", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true);
  });
  test("8.8.8.8 est autorisé (DNS public)", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false);
  });
  test("google.com est autorisé", () => {
    expect(isPrivateIP("google.com")).toBe(false);
  });
  test(".local domain est bloqué", () => {
    expect(isPrivateIP("myserver.local")).toBe(true);
  });
  test(".internal domain est bloqué", () => {
    expect(isPrivateIP("db.internal")).toBe(true);
  });
});

describe("SSRF Protection - isValidUrl", () => {
  test("URL http valide est acceptée", () => {
    expect(isValidUrl("http://example.com/image.jpg")).toBe(true);
  });
  test("URL https valide est acceptée", () => {
    expect(isValidUrl("https://example.com/image.jpg")).toBe(true);
  });
  test("URL locale est rejetée", () => {
    expect(isValidUrl("http://localhost:3000")).toBe(false);
  });
  test("URL IP privée est rejetée", () => {
    expect(isValidUrl("http://192.168.1.1/admin")).toBe(false);
  });
  test("Protocole ftp est rejeté", () => {
    expect(isValidUrl("ftp://example.com/file")).toBe(false);
  });
  test("Chaine invalide est rejetée", () => {
    expect(isValidUrl("not-a-url")).toBe(false);
  });
  test("URL IP publique est acceptée", () => {
    expect(isValidUrl("http://8.8.8.8/test")).toBe(true);
  });
  test("URL avec .internal est rejetée", () => {
    expect(isValidUrl("http://secret.internal/api")).toBe(false);
  });
});
