import React, { useState, useEffect } from "react";
import api from "../services/api";
import { formatDate } from "../utils/helpers";

const BroadcastCenter = () => {
  const [tab, setTab] = useState("new");
  const [groups, setGroups] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [form, setForm] = useState({ type: "text", content: "", caption: "", targetGroups: [], targetMembers: [], toAllGroups: false, toAllMembers: false });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/groups").then(({ data }) => setGroups(data.groups)).catch(() => {});
    api.get("/broadcast").then(({ data }) => setBroadcasts(data.broadcasts)).catch(() => {});
  }, []);

  const toggleGroup = (id) => {
    setForm((f) => ({ ...f, targetGroups: f.targetGroups.includes(id) ? f.targetGroups.filter((g) => g !== id) : [...f.targetGroups, id] }));
  };

  const createAndSend = async () => {
    setSending(true);
    try {
      const payload = { type: form.type, content: {}, targetGroups: form.targetGroups, toAllGroups: form.toAllGroups, toAllMembers: form.toAllMembers };

      if (form.type === "text") payload.content = { text: form.content };
      else if (form.type === "image") payload.content = { url: form.content, caption: form.caption };

      const { data } = await api.post("/broadcast", payload);
      if (data?.broadcast?._id) {
        await api.post(`/broadcast/${data.broadcast._id}/send`);
      }
      setForm({ type: "text", content: "", caption: "", targetGroups: [], toAllGroups: false, toAllMembers: false });
      const res = await api.get("/broadcast");
      setBroadcasts(res.data.broadcasts);
    } catch (err) {
      alert(err.response?.data?.error || "Erreur");
    }
    setSending(false);
  };

  return (
    <div>
      <h2 style={styles.pageTitle}>Centre de Broadcast</h2>
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, borderBottom: tab === "new" ? "2px solid #075e54" : "2px solid transparent", color: tab === "new" ? "#075e54" : "#667781" }} onClick={() => setTab("new")}>Nouvelle campagne</button>
        <button style={{ ...styles.tab, borderBottom: tab === "history" ? "2px solid #075e54" : "2px solid transparent", color: tab === "history" ? "#075e54" : "#667781" }} onClick={() => setTab("history")}>Historique</button>
      </div>

      {tab === "new" && (
        <div style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Type de message</label>
            <select style={styles.select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="text">Texte</option>
              <option value="image">Image</option>
            </select>
          </div>
          {form.type === "text" ? (
            <div style={styles.formGroup}>
              <label style={styles.label}>Message</label>
              <textarea style={styles.textarea} rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Votre message..." />
            </div>
          ) : (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>URL de l'image</label>
                <input style={styles.input} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="https://..." />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Légende</label>
                <input style={styles.input} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
              </div>
            </>
          )}

          <div style={styles.formGroup}>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={form.toAllGroups} onChange={() => setForm({ ...form, toAllGroups: !form.toAllGroups })} />
              Envoyer à tous les groupes
            </label>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.checkbox}>
              <input type="checkbox" checked={form.toAllMembers} onChange={() => setForm({ ...form, toAllMembers: !form.toAllMembers })} />
              Envoyer à tous les membres
            </label>
          </div>

          {!form.toAllGroups && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Groupes cibles</label>
              <div style={styles.groupGrid}>
                {groups.map((g) => (
                  <label key={g.groupId} style={styles.groupCheckbox}>
                    <input type="checkbox" checked={form.targetGroups.includes(g.groupId)} onChange={() => toggleGroup(g.groupId)} />
                    {g.name} ({g.memberCount})
                  </label>
                ))}
              </div>
            </div>
          )}

          <button style={styles.btnSend} onClick={createAndSend} disabled={sending || !form.content}>
            {sending ? "Envoi en cours..." : "Lancer la campagne"}
          </button>
        </div>
      )}

      {tab === "history" && (
        <div style={styles.history}>
          {broadcasts.map((b) => (
            <div key={b._id} style={styles.historyItem}>
              <div style={styles.historyHeader}>
                <span style={{ ...styles.statusBadge, backgroundColor: b.status === "completed" ? "#25d366" : b.status === "sending" ? "#ffc107" : "#ef5350" }}>{b.status}</span>
                <span style={styles.historyType}>{b.type}</span>
                <span style={styles.historyDate}>{formatDate(b.createdAt)}</span>
              </div>
              <div style={styles.historyStats}>{b.sentCount || 0} envoyés / {b.failedCount || 0} échecs / {b.totalCount || 0} total</div>
            </div>
          ))}
          {broadcasts.length === 0 && <p style={styles.empty}>Aucune campagne</p>}
        </div>
      )}
    </div>
  );
};

const styles = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", marginBottom: 16 },
  tabs: { display: "flex", gap: 0, marginBottom: 20, backgroundColor: "#fff", borderRadius: "10px 10px 0 0", overflow: "hidden" },
  tab: { flex: 1, padding: "12px 20px", backgroundColor: "#fff", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" },
  form: { backgroundColor: "#fff", borderRadius: 10, padding: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  formGroup: { marginBottom: 16 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#111b21", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none" },
  select: { width: "100%", padding: "10px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none", backgroundColor: "#fff" },
  textarea: { width: "100%", padding: 12, border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none", resize: "vertical", fontFamily: "inherit" },
  checkbox: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#111b21", cursor: "pointer" },
  groupGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6, maxHeight: 200, overflow: "auto", padding: 8, border: "1px solid #e0e0e0", borderRadius: 8 },
  groupCheckbox: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#111b21", cursor: "pointer", padding: "4px 0" },
  btnSend: { width: "100%", padding: "12px", backgroundColor: "#075e54", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 8 },
  history: { backgroundColor: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  historyItem: { padding: "12px 0", borderBottom: "1px solid #f0f2f5" },
  historyHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 },
  statusBadge: { fontSize: 10, color: "#fff", padding: "2px 8px", borderRadius: 8, textTransform: "uppercase" },
  historyType: { fontSize: 13, fontWeight: 500, color: "#111b21" },
  historyDate: { fontSize: 12, color: "#8696a0", marginLeft: "auto" },
  historyStats: { fontSize: 12, color: "#667781" },
  empty: { textAlign: "center", color: "#8696a0", padding: 40, fontSize: 14 },
};

export default BroadcastCenter;
