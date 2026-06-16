// Fonctions de validation d'URL pour la protection SSRF
// Extraites dans un fichier séparé pour les tests

function isPrivateIP(hostname) {
  var parts = hostname.split(".").map(Number);
  if (parts.length === 4 && parts.every(function(p) { return !isNaN(p); })) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  var lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  return false;
}

function isValidUrl(str) {
  try {
    var u = new URL(str);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (isPrivateIP(u.hostname)) return false;
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { isValidUrl, isPrivateIP };
