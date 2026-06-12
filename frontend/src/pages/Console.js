import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../hooks/useSocket";
import { useMediaQuery } from "../hooks/useMediaQuery";
import api from "../services/api";

const MAX_LINES = 5000;
const KEYWORDS = [
  { pattern: /✅/, label: "success", color: "#00a884" },
  { pattern: /⚠️|warning|warn/gi, label: "warn", color: "#ffc107" },
  { pattern: /❌|error|fail|échec|erreur/gi, label: "error", color: "#ef5350" },
  { pattern: /➡️|→|envoyé|forward/gi, label: "send", color: "#34b7f1" },
  { pattern: /🔁|reconnect|reconnexion/gi, label: "reconnect", color: "#ff9800" },
  { pattern: /🔌|déconnect|disconnect/gi, label: "disconnect", color: "#f44336" },
  { pattern: /📡|socket|connecté/i, label: "socket", color: "#9c27b0" },
  { pattern: /💾|sauvegard|save|creds/gi, label: "save", color: "#4caf50" },
  { pattern: /🗑️|supprim|delete|modéré/gi, label: "moderation", color: "#ff5722" },
  { pattern: /QR|code|appariement|pairing/gi, label: "qr", color: "#e91e63" },
];

const getLogColor = (level, message) => {
  if (level === "error") return "#ef5350";
  if (level === "warn") return "#ffc107";
  if (level === "debug") return "#78909c";
  if (level === "trace") return "#78909c";
  for (const kw of KEYWORDS) {
    if (kw.pattern.test(message)) return kw.color;
  }
  return "#e0e0e0";
};

const formatTime = (ts) => {
  const d = new Date(ts);
  return d.toLocaleTimeString("fr-FR", { hour12: false });
};

const Console = () => {
  const { socket } = useSocket();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  const addLine = useCallback((data) => {
    const line = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      time: formatTime(data.timestamp || Date.now()),
      level: data.level || "info",
      message: data.message || "",
      raw: data,
    };
    setLines((prev) => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  useEffect(() => {
    api.get("/settings/console-access").then((res) => {
      if (!res.data.allowed) {
        navigate("/", { replace: true });
        return;
      }
      setLoading(false);
    }).catch(() => {
      navigate("/", { replace: true });
    });
  }, [navigate]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (paused) return;
      addLine(data);
    };
    socket.on("log:new", handler);
    return () => socket.off("log:new", handler);
  }, [socket, paused, addLine]);

  useEffect(() => {
    if (follow && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [lines, follow]);

  if (loading) return null;

  const filtered = filter
    ? lines.filter(
        (l) =>
          l.message.toLowerCase().includes(filter.toLowerCase()) ||
          l.level.toLowerCase().includes(filter.toLowerCase())
      )
    : lines;

  const togglePause = () => setPaused((p) => !p);

  const clear = () => setLines([]);

  const copyAll = () => {
    const text = filtered.map((l) => `[${l.time}] [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const levelCounts = {};
  for (const l of lines) levelCounts[l.level] = (levelCounts[l.level] || 0) + 1;

  return (
    <div style={styles.page}>
      <div style={styles.header(isMobile)}>
        <div style={styles.headerLeft}>
          <h2 style={styles.title}><i className="bi bi-terminal-fill" style={{ marginRight: 10 }}></i>Console</h2>
          <span style={styles.badge}>{lines.length} lignes</span>
          <span style={styles.badgeOnline}>
            <span style={styles.dot} />
            {socket?.connected ? "Connecté" : "Déconnecté"}
          </span>
        </div>
        <div style={styles.actions(isMobile)}>
          <button onClick={togglePause} style={{ ...styles.btn, color: paused ? "#ff9800" : "#e0e0e0" }}>
            <i className={`bi ${paused ? "bi-play-fill" : "bi-pause-fill"}`} style={{ marginRight: 6 }}></i>{paused ? "Reprendre" : "Pause"}
          </button>
          <button onClick={clear} style={styles.btn}><i className="bi bi-trash" style={{ marginRight: 6 }}></i>Effacer</button>
          <button onClick={copyAll} style={styles.btn}><i className="bi bi-clipboard" style={{ marginRight: 6 }}></i>Copier</button>
        </div>
      </div>

      <div style={styles.filterBar}>
        <i className="bi bi-search" style={{ color: "#5e6f7d", fontSize: 13 }}></i>
        <input
          type="text"
          placeholder="Filtrer les logs (texte, niveau...)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={styles.filterInput}
        />
        <label style={styles.followLabel}>
          <input
            type="checkbox"
            checked={follow}
            onChange={() => setFollow((f) => !f)}
            style={{ accentColor: "#00a884" }}
          />
          <span style={{ marginLeft: 6, fontSize: 12 }}>Auto-scroll</span>
        </label>
      </div>

      <div ref={containerRef} style={styles.terminal} onClick={() => setFollow(true)}>
        <div style={styles.terminalHeader(isMobile)}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>
            <i className="bi bi-cpu" style={{ marginRight: 6 }}></i>
            WhatsApp Bot Console
          </span>
          <span style={{ fontSize: 11, color: "#5e6f7d" }}>
            {Object.entries(levelCounts).map(([lv, cnt]) => (
              <span key={lv} style={{ marginLeft: 10 }}>
                <span style={{ color: getLogColor(lv, lv), fontWeight: 600 }}>{lv}</span>: {cnt}
              </span>
            ))}
          </span>
        </div>
        <div style={styles.terminalBody}>
          {filtered.length === 0 && (
            <div style={styles.empty}>
              {lines.length === 0
                ? "En attente de logs... Les actions du bot s'afficheront ici en temps réel."
                : "Aucun résultat pour ce filtre."}
            </div>
          )}
          {filtered.map((l) => (
            <div key={l.id} style={styles.line} title={l.message}>
              <span style={styles.time}>[{l.time}]</span>
              <span style={{ ...styles.level, color: getLogColor(l.level, l.message) }}>
                [{l.level.toUpperCase().padEnd(5)}]
              </span>
              <span style={styles.msg}>{l.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    height: "calc(100vh - 40px)",
  },
  header: (isMobile) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: isMobile ? "stretch" : "center",
    flexDirection: isMobile ? "column" : "row",
    gap: 10,
    flexShrink: 0,
  }),
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: "#111b21",
    margin: 0,
  },
  badge: {
    fontSize: 11,
    color: "#667781",
    backgroundColor: "#f0f2f5",
    padding: "2px 10px",
    borderRadius: 10,
    fontWeight: 600,
  },
  badgeOnline: {
    fontSize: 11,
    color: "#00a884",
    backgroundColor: "#e6f6f3",
    padding: "2px 10px",
    borderRadius: 10,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: "#00a884",
    display: "inline-block",
  },
  actions: (isMobile) => ({ display: "flex", gap: 6, flexWrap: "wrap" }),
  btn: {
    padding: "6px 14px",
    backgroundColor: "#1d2a35",
    color: "#e0e0e0",
    border: "1px solid #38434d",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    transition: "all 0.15s",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    backgroundColor: "#1d2a35",
    borderRadius: 8,
    border: "1px solid #38434d",
    flexShrink: 0,
  },
  filterInput: {
    flex: 1,
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
    color: "#e0e0e0",
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
  },
  followLabel: {
    display: "flex",
    alignItems: "center",
    color: "#aebac1",
    cursor: "pointer",
    userSelect: "none",
  },
  terminal: {
    flex: 1,
    backgroundColor: "#0a0e12",
    borderRadius: 10,
    border: "1px solid #1d2a35",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
  },
  terminalHeader: (isMobile) => ({
    padding: "8px 16px",
    backgroundColor: "#141f2b",
    borderBottom: "1px solid #1d2a35",
    color: "#aebac1",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
    userSelect: "none",
    flexDirection: isMobile ? "column" : "row",
    gap: 6,
  }),
  terminalBody: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 0",
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', 'Courier New', monospace",
    fontSize: 12,
    lineHeight: 1.7,
  },
  empty: {
    color: "#5e6f7d",
    padding: "40px 20px",
    textAlign: "center",
    fontSize: 13,
    fontStyle: "italic",
  },
  line: {
    display: "flex",
    gap: 8,
    padding: "1px 16px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  time: {
    color: "#5e6f7d",
    flexShrink: 0,
    userSelect: "none",
  },
  level: {
    flexShrink: 0,
    fontWeight: 700,
    userSelect: "none",
    minWidth: 70,
  },
  msg: {
    color: "#e0e0e0",
    flex: 1,
  },
};

export default Console;
