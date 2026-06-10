import React from "react";

const StatusCard = ({ icon, label, value, color }) => (
  <div style={styles.card}>
    <div style={{ ...styles.icon, backgroundColor: color + "20" }}>
      <i className={icon} style={{ fontSize: 24, color }}></i>
    </div>
    <div style={styles.info}>
      <span style={styles.value}>{value}</span>
      <span style={styles.label}>{label}</span>
    </div>
  </div>
);

const styles = {
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 20, display: "flex", alignItems: "center", gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  icon: { width: 52, height: 52, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  info: { display: "flex", flexDirection: "column" },
  value: { fontSize: 28, fontWeight: 700, color: "#111b21" },
  label: { fontSize: 13, color: "#667781", marginTop: 2 },
};

export default StatusCard;
