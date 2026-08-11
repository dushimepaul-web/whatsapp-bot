import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import { useMediaQuery } from "../hooks/useMediaQuery";
import api from "../services/api";
import StatusCard from "../components/StatusCard";

const INITIAL_LOADING = { connect: false, pair: false, disconnect: false, refresh: false };

const Dashboard = () => {
  const { socket } = useSocket();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [stats, setStats] = useState({ groups: 0, members: 0, broadcastSent: 0, moderation: 0, users: 0 });
  const [whatsapp, setWhatsapp] = useState({ status: "disconnected", qr: null, phone: null });
  const [logs, setLogs] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState(null);
  const [loading, setLoading] = useState(INITIAL_LOADING);
  const [autoRejectCalls, setAutoRejectCalls] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const connectPollRef = useRef(null);
  const pairPollRef = useRef(null);
  const refreshPollRef = useRef(null);
  const statusPollRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const wa = await api.get("/whatsapp/status");
      setWhatsapp((s) => {
        const newStatus = wa.data.session?.status || "disconnected";
        if (newStatus !== s.status) {
          return { ...s, status: newStatus, qr: newStatus === "connected" ? null : (wa.data.session?.qrCode || s.qr), phone: wa.data.phone || s.phone };
        }
        return s;
      });
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [grp, brd, wa, logsRes, usr, settingsRes] = await Promise.all([
          api.get("/groups/stats"),
          api.get("/broadcast/stats"),
          api.get("/whatsapp/status"),
          api.get("/logs", { params: { limit: 10 } }),
          api.get("/auth/stats"),
          api.get("/settings"),
        ]);
        setStats({ 
          groups: grp.data.totalGroups || 0, 
          members: grp.data.totalMembers || 0, 
          broadcastSent: brd.data.totalSent || 0, 
          moderation: 0,
          users: usr.data.totalUsers || 0,
        });
        setWhatsapp({ 
          status: wa.data.session?.status || "disconnected", 
          qr: wa.data.session?.qrCode || null, 
          phone: wa.data.phone || null 
        });
        if (settingsRes.data?.settings) setAutoRejectCalls(settingsRes.data.settings.autoRejectCalls !== false);
        setLogs(logsRes.data.logs || []);
      } catch {}
      setPageLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("whatsapp:qr", ({ qr }) => {
      setWhatsapp((s) => ({ ...s, qr }));
      setLoading((s) => ({ ...s, connect: false, pair: false }));
    });
    socket.on("whatsapp:status", ({ status }) => {
      setWhatsapp((s) => ({ ...s, status, qr: status === "connected" ? null : s.qr }));
      if (status === "connected") setPairingCode(null);
    });
    socket.on("whatsapp:pairingCode", ({ code }) => setPairingCode(code));
    socket.on("connect", () => fetchStatus());
    return () => {
      socket.off("whatsapp:qr");
      socket.off("whatsapp:status");
      socket.off("whatsapp:pairingCode");
      socket.off("connect", fetchStatus);
    };
  }, [socket]);

  useEffect(() => {
    statusPollRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (connectPollRef.current) clearInterval(connectPollRef.current);
      if (pairPollRef.current) clearInterval(pairPollRef.current);
      if (refreshPollRef.current) clearInterval(refreshPollRef.current);
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  const handleToggleCalls = async () => {
    const newVal = !autoRejectCalls;
    try {
      await api.put("/settings", { autoRejectCalls: newVal });
      setAutoRejectCalls(newVal);
    } catch {}
  };

  const handleConnect = async () => {
    if (connectPollRef.current) clearInterval(connectPollRef.current);
    setLoading((s) => ({ ...s, connect: true }));
    setWhatsapp((s) => ({ ...s, status: "connecting", qr: null }));
    try {
      await api.post("/whatsapp/connect");
      const startTime = Date.now();
      const TIMEOUT_MS = 3 * 60 * 1000;
      const poll = setInterval(async () => {
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(poll);
          setLoading((s) => ({ ...s, connect: false }));
          return;
        }
        try {
          const statusRes = await api.get("/whatsapp/status");
          const sessionStatus = statusRes.data?.session?.status;
          if (sessionStatus === "connected") {
            setWhatsapp((s) => ({ ...s, status: "connected", qr: null }));
            clearInterval(poll);
            setLoading((s) => ({ ...s, connect: false }));
            return;
          }
          const qr = statusRes.data?.session?.qrCode;
          if (qr) {
            setWhatsapp((s) => ({ ...s, qr }));
            clearInterval(poll);
            setLoading((s) => ({ ...s, connect: false }));
          }
        } catch {}
      }, 3000);
      connectPollRef.current = poll;
    } catch {
      setLoading((s) => ({ ...s, connect: false }));
    }
  };

  const handleDisconnect = async () => {
    if (connectPollRef.current) clearInterval(connectPollRef.current);
    if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    setLoading((s) => ({ ...s, disconnect: true }));
    try { await api.post("/whatsapp/disconnect"); setWhatsapp({ status: "disconnected", qr: null, phone: null }); setPairingCode(null); } catch {}
    setLoading((s) => ({ ...s, disconnect: false }));
  };

  const handleFreshConnect = async () => {
    if (refreshPollRef.current) clearInterval(refreshPollRef.current);
    setLoading((s) => ({ ...s, refresh: true }));
    setWhatsapp((s) => ({ ...s, status: "connecting", qr: null }));
    try {
      await api.post("/whatsapp/connect?fresh=true");
      const startTime = Date.now();
      const TIMEOUT_MS = 3 * 60 * 1000;
      const poll = setInterval(async () => {
        if (Date.now() - startTime > TIMEOUT_MS) {
          clearInterval(poll);
          setLoading((s) => ({ ...s, refresh: false }));
          return;
        }
        try {
          const statusRes = await api.get("/whatsapp/status");
          const sessionStatus = statusRes.data?.session?.status;
          if (sessionStatus === "connected") {
            setWhatsapp((s) => ({ ...s, status: "connected", qr: null }));
            clearInterval(poll);
            setLoading((s) => ({ ...s, refresh: false }));
            return;
          }
          const qr = statusRes.data?.session?.qrCode;
          if (qr) {
            setWhatsapp((s) => ({ ...s, qr }));
            clearInterval(poll);
            setLoading((s) => ({ ...s, refresh: false }));
          }
        } catch {}
      }, 3000);
      refreshPollRef.current = poll;
    } catch {
      setLoading((s) => ({ ...s, refresh: false }));
    }
  };

  const handlePair = async () => {
    if (!phoneNumber.trim()) return;
    setLoading((s) => ({ ...s, pair: true }));
    setWhatsapp((s) => ({ ...s, status: "connecting" }));
    try {
      setPairingCode(null);
      await api.post("/whatsapp/pair", { phone: phoneNumber });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 20) { clearInterval(poll); setLoading((s) => ({ ...s, pair: false })); return; }
        try {
          const res = await api.get("/whatsapp/status");
          if (res.data?.session?.pairingCode) { setPairingCode(res.data.session.pairingCode); clearInterval(poll); setLoading((s) => ({ ...s, pair: false })); }
          if (res.data?.session?.status === "connected") { setPairingCode(null); clearInterval(poll); setLoading((s) => ({ ...s, pair: false })); }
        } catch {}
      }, 2000);
      pairPollRef.current = poll;
    } catch {
      setLoading((s) => ({ ...s, pair: false }));
    }
  };

  const handleSyncGroups = async () => {
    setSyncing(true);
    try {
      await api.post("/groups/refresh");
      const grp = await api.get("/groups/stats");
      setStats((s) => ({ ...s, groups: grp.data.totalGroups || 0, members: grp.data.totalMembers || 0 }));
    } catch {}
    setSyncing(false);
  };

  if (pageLoading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#8696a0", fontSize: 16 }}><span style={styles.spinner} /> Chargement du tableau de bord...</div>;
  }

  const waColor = whatsapp.status === "connected" ? "#00a884" : whatsapp.status === "connecting" ? "#ffc107" : "#ea4335";

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .hover-card:hover { transform: translateY(-3px); box-shadow: 0 4px 15px rgba(0,0,0,0.06); }
      `}</style>
      
      <div style={styles.headerRow}>
        <h2 style={styles.pageTitle}>Dashboard</h2>
        <span style={styles.pageSubtitle}>Aperçu global de l'activité du bot WhatsApp</span>
      </div>

      <div style={styles.statusBar}>
        <div style={styles.waStatus}>
          <span style={{ ...styles.dot, backgroundColor: waColor }} />
          <span style={styles.waText}>
            Service WhatsApp : <span style={{ color: waColor, fontWeight: 700 }}>
              {whatsapp.status === "connected" ? "Opérationnel" : whatsapp.status === "connecting" ? "Initialisation..." : "Hors ligne"}
            </span>
          </span>
          {whatsapp.phone && <span style={styles.phoneBadge}>{whatsapp.phone}</span>}
        </div>
        <div style={styles.actions}>
          <button onClick={handleSyncGroups} style={syncing ? { ...styles.btnSync, ...styles.btnDisabled } : styles.btnSync} disabled={syncing}>
            {syncing ? <><span style={styles.spinner} /> Sync...</> : <><i className="bi bi-arrow-clockwise" style={{ marginRight: 6 }}></i>Synchroniser</>}
          </button>
          {whatsapp.status !== "connected" && (
            <button onClick={handleConnect} style={loading.connect ? { ...styles.btnStart, ...styles.btnDisabled } : styles.btnStart} disabled={loading.connect}>
              {loading.connect ? <><span style={styles.spinner} /> Démarrage...</> : <><i className="bi bi-play-fill" style={{ marginRight: 6 }}></i>Démarrer le serveur</>}
            </button>
          )}
          {whatsapp.status === "connected" && (
            <>
              <button onClick={handleFreshConnect} style={loading.refresh ? { ...styles.btnRefresh, ...styles.btnDisabled } : styles.btnRefresh} disabled={loading.refresh}>
                {loading.refresh ? <><span style={styles.spinner} /> Scan...</> : <><i className="bi bi-qr-code-scan" style={{ marginRight: 6 }}></i>Scan nouveau QR</>}
              </button>
              <button onClick={handleDisconnect} style={loading.disconnect ? { ...styles.btnDisconnect, ...styles.btnDisabled } : styles.btnDisconnect} disabled={loading.disconnect}>
                {loading.disconnect ? <><span style={styles.spinner} /> Déconnexion...</> : <><i className="bi bi-power" style={{ marginRight: 6 }}></i>Déconnecter</>}
              </button>
            </>
          )}
        </div>
      </div>

      {whatsapp.qr && !pairingCode && (
        <div style={styles.qrBox(isMobile)}>
          <div style={styles.qrInfo}>
            <h3 style={styles.qrTitle}>Lier votre appareil via QR Code</h3>
            <p style={styles.qrText}>
              Ouvrez WhatsApp sur votre téléphone, accédez aux <strong>Appareils liés</strong>, appuyez sur <strong>Lier un appareil</strong> puis scannez le QR code affiché à droite.
            </p>
          </div>
          <div style={styles.qrContainer}>
            <img src={whatsapp.qr} alt="QR Code" style={styles.qrImg} />
          </div>
        </div>
      )}

      {pairingCode && (
        <div style={styles.qrBox(isMobile)}>
          <div style={styles.qrInfo}>
            <h3 style={styles.qrTitle}>Lier votre appareil via Code d'appariement</h3>
            <p style={styles.qrText}>
              1. Ouvrez WhatsApp sur votre téléphone.<br />
              2. Allez dans les **Paramètres > Appareils liés**.<br />
              3. Appuyez sur **Lier un appareil**, puis sur **Lier avec le numéro de téléphone**.<br />
              4. Entrez le code de sécurité affiché à droite.
            </p>
          </div>
          <div style={styles.pairingCodeBox}>
            <span style={styles.pairingCode}>{pairingCode}</span>
          </div>
        </div>
      )}

      {whatsapp.status === "disconnected" && !whatsapp.qr && !pairingCode && (
        <div style={styles.pairSection}>
          <h4 style={styles.pairTitle}>Pas d'appareil photo fonctionnel ? Appairez avec un code textuel</h4>
          <div style={styles.pairRow(isMobile)}>
            <input
              type="tel"
              placeholder="Numéro au format international (ex: 33612345678)"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={styles.phoneInput}
            />
            <button onClick={handlePair} style={loading.pair ? { ...styles.btnPair, ...styles.btnDisabled } : styles.btnPair} disabled={loading.pair}>
              {loading.pair ? <><span style={styles.spinner} /> Génération...</> : "Obtenir un code"}
            </button>
          </div>
        </div>
      )}

      <div style={styles.grid}>
        <StatusCard icon="bi bi-people-fill" label="Groupes détectés" value={stats.groups} color="#00a884" />
        <StatusCard icon="bi bi-person-fill" label="Membres totaux" value={stats.members} color="#128c7e" />
        <StatusCard icon="bi bi-people" label="Utilisateurs du bot" value={stats.users} color="#5f4b8b" />
        <StatusCard icon="bi bi-send-check-fill" label="Diffusions relayées" value={stats.broadcastSent} color="#34b7f1" />
        <StatusCard icon="bi bi-telephone-x-fill" label="Rejeter les appels" value={autoRejectCalls ? "Activé" : "Désactivé"} color={autoRejectCalls ? "#dc3545" : "#8696a0"} onClick={handleToggleCalls} style={{ cursor: "pointer" }} />
      </div>

      <div style={styles.mainGrid(isMobile)}>
        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>
            <i className="bi bi-terminal-fill" style={{ marginRight: 8, color: "#ffc107" }}></i>Journaux d'événements
          </h3>
          <div style={styles.logList}>
            {logs.map((log) => (
              <div key={log._id} style={styles.logItem}>
                <span style={{ 
                  ...styles.logType, 
                  color: log.type === "error" ? "#ea4335" : log.type === "warn" ? "#fe9f06" : "#00a884",
                  backgroundColor: log.type === "error" ? "#fce8e6" : log.type === "warn" ? "#fff3cd" : "#e6f6f3"
                }}>{log.type}</span>
                <span style={styles.logAction}>{log.action}</span>
                <span style={styles.logDate}>{new Date(log.createdAt).toLocaleTimeString("fr-FR")}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div style={styles.emptyContainer}>
                <i className="bi bi-code-slash" style={styles.emptyIcon}></i>
                <p style={styles.empty}>Aucun log disponible</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#111b21",
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  headerRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  pageTitle: { fontSize: 24, fontWeight: 700, color: "#111b21", margin: 0 },
  pageSubtitle: { fontSize: 13, color: "#667781" },
  statusBar: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: "16px 20px", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "space-between", 
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    border: "1px solid #e9edef",
    gap: 12,
    flexWrap: "wrap"
  },
  waStatus: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  dot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  waText: { fontSize: 14, fontWeight: 600, color: "#111b21" },
  phoneBadge: { 
    fontSize: 12, 
    color: "#00a884", 
    backgroundColor: "#e6f6f3", 
    padding: "2px 8px", 
    borderRadius: 6,
    fontWeight: 600
  },
actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  btnConnect: { 
    padding: "10px 20px", 
    backgroundColor: "#00a884", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s"
  },
  btnStop: { 
    padding: "10px 20px", 
    backgroundColor: "#ea4335", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s",
    animation: "pulse 1.5s infinite"
  },
  btnDisconnect: { 
    padding: "10px 20px", 
    backgroundColor: "#ea4335", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s"
  },
  btnSync: { 
    padding: "10px 20px", 
    backgroundColor: "#f0f2f5", 
    color: "#54656f", 
    border: "1px solid #e9edef", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s"
  },
  btnRefresh: { 
    padding: "10px 20px", 
    backgroundColor: "#5f4b8b", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s",
    boxShadow: "0 2px 8px rgba(95,75,139,0.3)"
  },
  qrBox: (isMobile) => ({ 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 24, 
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    border: "1px solid #e9edef",
    gap: 24,
    flexDirection: isMobile ? "column" : "row",
    textAlign: isMobile ? "center" : "left"
  }),
  qrInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  qrTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#111b21",
    margin: 0
  },
  qrText: { 
    fontSize: 14, 
    color: "#54656f", 
    lineHeight: 1.6,
    margin: 0
  },
  qrContainer: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #e9edef"
  },
  qrImg: { width: 180, height: 180, display: "block" },
  pairingCodeBox: { 
    backgroundColor: "#f0f2f5", 
    borderRadius: 8, 
    padding: "18px 24px", 
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #e9edef"
  },
  pairingCode: { fontSize: 32, fontWeight: 700, letterSpacing: 4, color: "#111b21", fontFamily: "monospace" },
  pairSection: {
    backgroundColor: "#fff",
    border: "1px solid #e9edef",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  pairTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#54656f",
    margin: 0
  },
  pairRow: (isMobile) => ({ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }),
  phoneInput: { 
    flex: 1, 
    padding: "12px 14px", 
    borderRadius: 8, 
    border: "1px solid #e9edef", 
    fontSize: 14, 
    outline: "none",
    backgroundColor: "#f8f9fa",
    transition: "border 0.2s"
  },
  btnPair: { 
    padding: "10px 24px", 
    backgroundColor: "#111b21", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer", 
    whiteSpace: "nowrap" 
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  mainGrid: (isMobile) => ({
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 20
  }),
  sectionCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 20, 
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    border: "1px solid #e9edef",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: "#111b21", margin: 0 },
  logList: { 
    display: "flex", 
    flexDirection: "column", 
    gap: 8,
    maxHeight: 400,
    overflowY: "auto",
    paddingRight: 6
  },
  logItem: { 
    display: "flex", 
    alignItems: "center", 
    gap: 12, 
    padding: "8px 10px", 
    borderRadius: 6,
    borderBottom: "1px solid #f0f2f5", 
    fontSize: 12 
  },
  logType: { 
    fontWeight: 700, 
    textTransform: "uppercase", 
    fontSize: 9, 
    padding: "2px 6px",
    borderRadius: 4,
    minWidth: 50,
    textAlign: "center"
  },
  logAction: { color: "#111b21", flex: 1, fontWeight: 500 },
  logDate: { color: "#8696a0", fontSize: 11 },
  emptyContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 0",
    color: "#8696a0",
    gap: 8
  },
  emptyIcon: {
    fontSize: 32,
    color: "#cfd8dc"
  },
  empty: { fontSize: 13, margin: 0 },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "currentColor",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    marginRight: 6,
    verticalAlign: "middle",
  },
};

export default Dashboard;
