import React, { useState, useEffect } from "react";
import api from "../services/api";

const Members = () => {
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/members", { params: { limit: 200 } }).then(({ data }) => setMembers(data.members)).catch(() => {});
  }, []);

  const toggleSelect = (jid) => {
    setSelected((prev) => prev.includes(jid) ? prev.filter((j) => j !== jid) : [...prev, jid]);
  };

  const selectAll = () => {
    if (selected.length === filtered.length) {
      setSelected([]);
    } else {
      setSelected(filtered.map((m) => m.jid));
    }
  };

  const sendMessage = async () => {
    if (!message || !selected.length) return;
    setSending(true);
    setResult(null);
    try {
      const { data } = await api.post("/members/send-message", { jids: selected, text: message });
      setResult({ success: data.results.filter((r) => r.success).length, failed: data.results.filter((r) => !r.success).length });
      setMessage("");
      setSelected([]);
    } catch (err) {
      setResult({ error: err.response?.data?.error || "Erreur" });
    }
    setSending(false);
  };

  const filtered = members.filter((m) => {
    const q = search.toLowerCase();
    return (m.name?.toLowerCase().includes(q) || m.pushName?.toLowerCase().includes(q) || m.jid?.toLowerCase().includes(q));
  });

  return (
    <div>
      <h2 style={styles.pageTitle}>Membres</h2>
      <div style={styles.toolbar}>
        <input style={styles.search} type="text" placeholder="Rechercher un membre..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <span style={styles.count}>{filtered.length} membres</span>
      </div>
      <div style={styles.split}>
        <div style={styles.listPanel}>
          <div style={styles.selectAll}>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={selectAll} />
              Tout sélectionner ({filtered.length})
            </label>
          </div>
          {filtered.map((m) => (
            <div key={m._id} style={styles.memberItem}>
              <input type="checkbox" checked={selected.includes(m.jid)} onChange={() => toggleSelect(m.jid)} />
              <div style={styles.avatar}>{m.name?.charAt(0)?.toUpperCase() || "?"}</div>
              <div style={styles.info}>
                <div style={styles.name}>{m.name || m.pushName || "Inconnu"}</div>
                <div style={styles.jid}>{m.jid?.split("@")[0]}</div>
              </div>
              {m.isAdmin && <span style={styles.badge}>Admin</span>}
            </div>
          ))}
        </div>
        <div style={styles.msgPanel}>
          <h3 style={styles.msgTitle}>Envoyer un message</h3>
          <p style={styles.msgInfo}>{selected.length} destinataire(s) sélectionné(s)</p>
          <textarea style={styles.textarea} rows={6} placeholder="Votre message..." value={message} onChange={(e) => setMessage(e.target.value)} />
          <button style={styles.btnSend} onClick={sendMessage} disabled={sending || !message || !selected.length}>
            {sending ? "Envoi en cours..." : "Envoyer le message"}
          </button>
          {result && (
            <div style={result.error ? styles.resultError : styles.resultSuccess}>
              {result.error || `${result.success} envoyé(s), ${result.failed} échec(s)`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", marginBottom: 16 },
  toolbar: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16 },
  search: { flex: 1, padding: "10px 16px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none" },
  count: { fontSize: 13, color: "#667781", whiteSpace: "nowrap" },
  split: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  listPanel: { backgroundColor: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)", maxHeight: "calc(100vh - 180px)", overflow: "auto" },
  selectAll: { padding: "8px 0", borderBottom: "1px solid #f0f2f5", marginBottom: 8 },
  checkboxLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#667781", cursor: "pointer" },
  memberItem: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0f2f5" },
  avatar: { width: 32, height: 32, borderRadius: "50%", backgroundColor: "#128c7e", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: 500, color: "#111b21" },
  jid: { fontSize: 11, color: "#8696a0" },
  badge: { fontSize: 10, backgroundColor: "#075e54", color: "#fff", padding: "2px 8px", borderRadius: 8 },
  msgPanel: { backgroundColor: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  msgTitle: { fontSize: 16, fontWeight: 600, color: "#111b21", marginBottom: 8 },
  msgInfo: { fontSize: 13, color: "#667781", marginBottom: 12 },
  textarea: { width: "100%", padding: 12, border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit" },
  btnSend: { marginTop: 12, padding: "10px 24px", backgroundColor: "#075e54", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" },
  resultSuccess: { marginTop: 12, padding: 10, backgroundColor: "#e8f5e9", color: "#2e7d32", borderRadius: 6, fontSize: 13, textAlign: "center" },
  resultError: { marginTop: 12, padding: 10, backgroundColor: "#fce4e4", color: "#c62828", borderRadius: 6, fontSize: 13, textAlign: "center" },
};

export default Members;
