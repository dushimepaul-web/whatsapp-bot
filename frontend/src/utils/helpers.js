export const formatDate = (date) => {
  if (!date) return "";
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatNumber = (num) => {
  if (!num && num !== 0) return "0";
  return num.toLocaleString("fr-FR");
};

export const getInitials = (name) => {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
};

export const truncate = (str, len = 30) => {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
};
