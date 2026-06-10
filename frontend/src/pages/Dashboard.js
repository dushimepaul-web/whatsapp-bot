import React, { useState, useEffect, useRef } from "react";
import { useSocket } from "../hooks/useSocket";
import api from "../services/api";
import StatusCard from "../components/StatusCard";

const INITIAL_LOADING = { connect: false, pair: false, disconnect: false };
let activityIdCounter = 0;

const Dashboard = () => {
  const { socket } = useSocket();
  const [stats, setStats] = useState({ groups: 0, members: 0, broadcastSent: 0, moderation: 0 });
  const [whatsapp, setWhatsapp] = useState({ status: "disconnected", qr: null, phone: null });
  const [logs, setLogs] = useState([]);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState(null);
  const [loading, setLoading] = useState(INITIAL_LOADING);
  const [forwardActivity, setForwardActivity] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const connectPollRef = useRef(null);
  const pairPollRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [grp, brd, wa, logsRes] = await Promise.all([
          api.get("/groups/stats"),
          api.get("/broadcast/stats"),
          api.get("/whatsapp/status"),
          api.get("/logs", { params: { limit: 10 } }),
        ]);
        setStats({ 
          groups: grp.data.totalGroups || 0, 
          members: grp.data.totalMembers || 0, 
          broadcastSent: brd.data.totalSent || 0, 
          moderation: 0 
        });
        setWhatsapp({ 
          status: wa.data.session?.status || "disconnected", 
          qr: wa.data.session?.qrCode || null, 
          phone: wa.data.phone || null 
        });
        setLogs(logsRes.data.logs || []);
      } catch {}
      setPageLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on("whatsapp:qr", ({ qr }) => setWhatsapp((s) => ({ ...s, qr })));
    socket.on("whatsapp:status", ({ status }) => {
      setWhatsapp((s) => ({ ...s, status, qr: status === "connected" ? null : s.qr }));
      if (status === "connected") setPairingCode(null);
    });
    socket.on("whatsapp:pairingCode", ({ code }) => setPairingCode(code));
    socket.on("forwarding:activity", (data) => setForwardActivity((prev) => [{ ...data, _id: activityIdCounter++ }, ...prev].slice(0, 50)));
    return () => {
      socket.off("whatsapp:qr");
      socket.off("whatsapp:status");
      socket.off("whatsapp:pairingCode");
      socket.off("forwarding:activity");
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      if (connectPollRef.current) clearInterval(connectPollRef.current);
      if (pairPollRef.current) clearInterval(pairPollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    setLoading((s) => ({ ...s, connect: true }));
    setWhatsapp((s) => ({ ...s, status: "connecting", qr: null }));
    try {
      await api.post("/whatsapp/connect");
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 15) { clearInterval(poll); setLoading((s) => ({ ...s, connect: false })); return; }
        try {
          const res = await api.get("/whatsapp/qr");
          if (res.data?.qr) { setWhatsapp((s) => ({ ...s, qr: res.data.qr })); clearInterval(poll); setLoading((s) => ({ ...s, connect: false })); }
        } catch {}
      }, 2000);
      connectPollRef.current = poll;
    } catch {
      setLoading((s) => ({ ...s, connect: false }));
    }
  };

  const handleDisconnect = async () => {
    setLoading((s) => ({ ...s, disconnect: true }));
    try { await api.post("/whatsapp/disconnect"); setWhatsapp({ status: "disconnected", qr: null, phone: null }); setPairingCode(null); } catch {}
    setLoading((s) => ({ ...s, disconnect: false }));
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
            <button onClick={handleConnect} style={loading.connect ? { ...styles.btnConnect, ...styles.btnDisabled } : styles.btnConnect} disabled={loading.connect}>
              {loading.connect ? <><span style={styles.spinner} /> Connexion...</> : <><i className="bi bi-qr-code-scan" style={{ marginRight: 6 }}></i>Scanner QR</>}
            </button>
          )}
          {whatsapp.status === "connected" && (
            <button onClick={handleDisconnect} style={loading.disconnect ? { ...styles.btnDisconnect, ...styles.btnDisabled } : styles.btnDisconnect} disabled={loading.disconnect}>
              {loading.disconnect ? <><span style={styles.spinner} /> Déconnexion...</> : <><i className="bi bi-power" style={{ marginRight: 6 }}></i>Déconnecter</>}
            </button>
          )}
        </div>
      </div>

      {whatsapp.qr && !pairingCode && (
        <div style={styles.qrBox}>
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
        <div style={styles.qrBox}>
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
          <div style={styles.pairRow}>
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
        <StatusCard icon="bi bi-send-check-fill" label="Diffusions relayées" value={stats.broadcastSent} color="#34b7f1" />
        <StatusCard icon="bi bi-shield-fill-check" label="Statut Sécurité" value="Actif" color="#ffc107" />
      </div>

      <div style={styles.mainGrid}>
        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>
            <i className="bi bi-arrow-left-right" style={{ marginRight: 8, color: "#00a884" }}></i>Activité en temps réel
          </h3>
          <div style={styles.activityList}>
            {forwardActivity.length === 0 && (
              <div style={styles.emptyContainer}>
                <i className="bi bi-inbox" style={styles.emptyIcon}></i>
                <p style={styles.empty}>Aucun message relayé pour le moment</p>
              </div>
            )}
            {forwardActivity.map((a) => (
              <div key={a._id} style={styles.activityItem}>
                <span style={{ ...styles.activityBadge, backgroundColor: a.masterGroup ? "#fff9db" : "#f0f2f5" }}>
                  <i className={`bi ${a.masterGroup ? "bi-trophy-fill" : "bi-arrow-left-right"}`} style={{ color: a.masterGroup ? "#ffc107" : "#8696a0" }}></i>
                </span>
                <div style={styles.activityContent}>
                  <div style={styles.activityTop}>
                    <strong style={styles.activityRule}>{a.ruleName}</strong>
                    <span style={styles.activityTime}>{a.time ? new Date(a.time).toLocaleTimeString("fr-FR") : ""}</span>
                  </div>
                  <span style={styles.activityMsg}>"{a.message}"</span>
                  <span style={styles.activityMeta}>
                    Expéditeur : <strong>@{a.sender}</strong> &rarr; Partagé avec <strong>{a.targets ?? 0} groupe{(a.targets ?? 0) > 1 ? "s" : ""}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

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
    border: "1px solid #e9edef"
  },
  waStatus: { display: "flex", alignItems: "center", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: "50%" },
  waText: { fontSize: 14, fontWeight: 600, color: "#111b21" },
  phoneBadge: { 
    fontSize: 12, 
    color: "#00a884", 
    backgroundColor: "#e6f6f3", 
    padding: "2px 8px", 
    borderRadius: 6,
    fontWeight: 600
  },
  actions: { display: "flex", gap: 8 },
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
  qrBox: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 24, 
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    border: "1px solid #e9edef",
    gap: 40
  },
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
  pairRow: { display: "flex", gap: 10 },
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
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 20
  },
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
  activityList: { 
    display: "flex", 
    flexDirection: "column", 
    gap: 12, 
    maxHeight: 400, 
    overflowY: "auto",
    paddingRight: 6
  },
  activityItem: { 
    display: "flex", 
    alignItems: "flex-start", 
    gap: 12, 
    padding: 12, 
    borderRadius: 8,
    border: "1px solid #f0f2f5",
    backgroundColor: "#f8f9fa"
  },
  activityBadge: { 
    fontSize: 16, 
    width: 36, 
    height: 36, 
    borderRadius: "50%", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center",
    flexShrink: 0
  },
  activityContent: { 
    flex: 1, 
    display: "flex", 
    flexDirection: "column", 
    gap: 4 
  },
  activityTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  activityRule: { fontSize: 13, color: "#00a884" },
  activityMsg: { 
    color: "#111b21", 
    fontSize: 13,
    fontStyle: "italic",
    lineHeight: 1.4
  },
  activityMeta: { fontSize: 11, color: "#8696a0" },
  activityTime: { fontSize: 11, color: "#8696a0" },
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
