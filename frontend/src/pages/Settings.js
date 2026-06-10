import React, { useState, useEffect } from "react";
import api from "../services/api";

const Settings = () => {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/settings").then(({ data }) => { setSettings(data.settings); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const update = (field, value) => {
    setSettings((s) => ({ ...s, [field]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings", settings);
      setSettings(data.settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err.response?.data?.error || "Erreur");
    }
    setSaving(false);
  };

  if (loading) return <p style={{ color: "#667781" }}>Chargement...</p>;

  return (
    <div>
      <h2 style={styles.pageTitle}>Paramètres</h2>
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}><i className="bi bi-whatsapp" style={{ marginRight: 8, color: "#25d366" }}></i>Configuration WhatsApp</h3>
        <div style={styles.field}>
          <label style={styles.label}>Préfixe des commandes</label>
          <input style={styles.input} value={settings?.prefix || ">"} onChange={(e) => update("prefix", e.target.value)} />
        </div>
        <div style={styles.field}>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={settings?.autoRejectCalls || false} onChange={(e) => update("autoRejectCalls", e.target.checked)} />
            Rejeter automatiquement les appels
          </label>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}><i className="bi bi-shield-fill-check" style={{ marginRight: 8, color: "#075e54" }}></i>Modération</h3>
        <div style={styles.field}>
          <label style={styles.checkbox}>
            <input type="checkbox" checked={settings?.moderationEnabled || false} onChange={(e) => update("moderationEnabled", e.target.checked)} />
            Modération activée
          </label>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Message de bienvenue</label>
          <input style={styles.input} value={settings?.welcomeMessage || ""} onChange={(e) => update("welcomeMessage", e.target.value)} />
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}><i className="bi bi-speedometer2" style={{ marginRight: 8, color: "#ff9800" }}></i>Rate Limiting</h3>
        <div style={styles.field}>
          <label style={styles.label}>Messages par minute</label>
          <input style={styles.input} type="number" value={settings?.rateLimitMessagesPerMinute || 30} onChange={(e) => update("rateLimitMessagesPerMinute", parseInt(e.target.value) || 0)} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Délai entre messages (ms)</label>
          <input style={styles.input} type="number" value={settings?.rateLimitDelayBetween || 1000} onChange={(e) => update("rateLimitDelayBetween", parseInt(e.target.value) || 0)} />
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Limite quotidienne</label>
          <input style={styles.input} type="number" value={settings?.rateLimitDailyLimit || 5000} onChange={(e) => update("rateLimitDailyLimit", parseInt(e.target.value) || 0)} />
        </div>
      </div>

      <button style={styles.btnSave} onClick={save} disabled={saving}>
        {saving ? <><span style={styles.spinner} /> Sauvegarde...</> : saved ? <><i className="bi bi-check-circle-fill" style={{ marginRight: 6 }}></i>Sauvegardé</> : "Sauvegarder"}
      </button>
    </div>
  );
};

const styles = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: 10, padding: 20, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#111b21", marginBottom: 16 },
  field: { marginBottom: 14 },
  label: { display: "block", fontSize: 13, fontWeight: 500, color: "#667781", marginBottom: 6 },
  input: { width: "100%", padding: "10px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none" },
  checkbox: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#111b21", cursor: "pointer" },
  btnSave: { width: "100%", padding: "12px", backgroundColor: "#075e54", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  spinner: {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    marginRight: 6,
    verticalAlign: "middle",
  },
};

export default Settings;
