import React, { useState, useEffect } from "react";
import { useSocket } from "../hooks/useSocket";
import api from "../services/api";
import { useSidebar } from "../context/SidebarContext";
import { useMediaQuery } from "../hooks/useMediaQuery";

const Header = () => {
  const { socket, connected: socketConnected } = useSocket();
  const [status, setStatus] = useState("disconnected");
  const [phone, setPhone] = useState(null);
  const { setSidebarOpen } = useSidebar();
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { data } = await api.get("/whatsapp/status");
        setStatus(data.session?.status || "disconnected");
        setPhone(data.phone);
      } catch {}
    };
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("whatsapp:status", ({ status: s }) => setStatus(s));
    return () => socket.off("whatsapp:status");
  }, [socket]);

  const statusColors = { connected: "#00a884", connecting: "#ffc107", disconnected: "#ea4335", error: "#ea4335" };
  const statusBgColors = { connected: "#d9fdd3", connecting: "#fff3cd", disconnected: "#f8d7da", error: "#f8d7da" };
  const statusLabels = { connected: "Connecté", connecting: "Connexion...", disconnected: "Déconnecté", error: "Erreur" };

  return (
    <div style={styles.header}>
      <div style={styles.titleArea}>
        <button onClick={() => setSidebarOpen(true)} style={styles.hamburger}>
          <i className="bi bi-list"></i>
        </button>
        <div>
          <h1 style={styles.title}>Console de Gestion</h1>
          <span style={styles.subtitle}>Supervision et contrôle en temps réel</span>
        </div>
      </div>
      <div style={styles.statusGroup}>
        <div style={{ ...styles.statusBadge, backgroundColor: statusBgColors[status] || "#f8d7da", color: statusColors[status] || "#ea4335" }}>
          <span style={{ ...styles.dot, backgroundColor: statusColors[status] || "#ea4335" }} />
          <span>WhatsApp : {statusLabels[status] || status}</span>
          {phone && <span style={styles.phone}>({phone})</span>}
        </div>
        <div style={{ ...styles.statusBadge, backgroundColor: socketConnected ? "#d9fdd3" : "#f8d7da", color: socketConnected ? "#00a884" : "#ea4335" }}>
          <span style={{ ...styles.dot, backgroundColor: socketConnected ? "#00a884" : "#ea4335" }} />
          <span>Socket : {socketConnected ? "Connecté" : "Déconnecté"}</span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: { 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "space-between", 
    padding: "16px 24px", 
    backgroundColor: "#fff", 
    borderBottom: "1px solid #e9edef",
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    gap: 12,
    flexWrap: "wrap"
  },
  titleArea: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  hamburger: {
    background: "none", border: "none", fontSize: 24,
    color: "#111b21", cursor: "pointer", padding: "4px 8px 4px 0",
    display: "flex"
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111b21",
    margin: 0
  },
  subtitle: {
    fontSize: 11,
    color: "#8696a0"
  },
  statusGroup: { 
    display: "flex", 
    alignItems: "center", 
    gap: 12 
  },
  statusBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.03)"
  },
  dot: { 
    width: 8, 
    height: 8, 
    borderRadius: "50%",
    display: "inline-block"
  },
  phone: { 
    fontSize: 11, 
    opacity: 0.8,
    marginLeft: 4 
  },
};

export default Header;
