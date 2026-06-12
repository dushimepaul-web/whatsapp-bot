import React, { useState, useEffect } from "react";
import api from "../services/api";
import { useMediaQuery } from "../hooks/useMediaQuery";

const Toggle = ({ checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 40, height: 22, borderRadius: 11,
      background: checked ? "#075e54" : "#ccc",
      position: "relative", cursor: "pointer", flexShrink: 0,
      transition: "background 0.2s",
    }}
  >
    <div style={{
      width: 18, height: 18, borderRadius: "50%", background: "#fff",
      position: "absolute", top: 2, left: checked ? 20 : 2,
      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    }} />
  </div>
);

const Settings = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      setSettings(data.settings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) setTimeout(() => setToast(null), 2500);
  }, [toast]);

  const update = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings", settings);
      setSettings(data.settings);
      setToast({ type: "success", msg: "Paramètres sauvegardés" });
    } catch (err) {
      setToast({ type: "error", msg: err.response?.data?.error || "Erreur lors de la sauvegarde" });
    }
    setSaving(false);
  };

  const addAutoReply = () => {
    const replies = [...(settings.autoReplies || [])];
    replies.push({ keyword: "", response: "", exactMatch: false, groupIds: [] });
    update("autoReplies", replies);
  };

  const updateAutoReply = (index, field, value) => {
    const replies = [...(settings.autoReplies || [])];
    replies[index] = { ...replies[index], [field]: value };
    update("autoReplies", replies);
  };

  const removeAutoReply = (index) => {
    const replies = [...(settings.autoReplies || [])];
    replies.splice(index, 1);
    update("autoReplies", replies);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh" }}>
        <div style={styles.spinnerLarge} />
      </div>
    );
  }

  return (
    <div style={styles.page(isMobile)}>
      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === "success" ? "#25d366" : "#ef5350",
        }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div style={styles.header}>
        <h2 style={styles.pageTitle}>Paramètres</h2>
        <button style={styles.btnSave} onClick={save} disabled={saving}>
          {saving ? (
            <><span style={styles.spinnerSmall} /> Sauvegarde...</>
          ) : (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>Sauvegarder</>
          )}
        </button>
      </div>

      <Section icon="whatsapp" color="#25d366" title="WhatsApp">
        <Field label="Préfixe des commandes" hint="Caractère avant chaque commande (ex: >aide)">
          <input style={styles.input} value={settings?.prefix || ">"} onChange={e => update("prefix", e.target.value)} />
        </Field>
        <Field label="Rejeter automatiquement les appels" hint="Refuse les appels entrants sur le numéro connecté">
          <Toggle checked={settings?.autoRejectCalls || false} onChange={v => update("autoRejectCalls", v)} />
        </Field>
      </Section>

      <Section icon="shield" color="#075e54" title="Modération">
        <Field label="Activer la modération" hint="Supprime automatiquement les médias et liens des non-admins dans les groupes restreints">
          <Toggle checked={settings?.moderationEnabled || false} onChange={v => update("moderationEnabled", v)} />
        </Field>
        <Field label="Message de bienvenue" hint="Envoyé aux nouveaux membres {user} = mention">
          <input style={styles.input} value={settings?.welcomeMessage || ""} onChange={e => update("welcomeMessage", e.target.value)} placeholder="Bienvenue dans le groupe !" />
        </Field>
      </Section>

      <Section icon="arrow-left-right" color="#00a884" title="Transfert automatique (Forwarding)">
        <Field label="Mot-clé groupe maître (source)" hint="Les messages des groupes contenant ce mot-clé sont transférés">
          <input style={styles.input} value={settings?.masterGroupKeyword || ""} onChange={e => update("masterGroupKeyword", e.target.value)} placeholder="ex: GESTION" />
        </Field>
        <Field label="Mot-clé groupes cibles" hint="Les messages sont transférés aux groupes contenant ce mot-clé">
          <input style={styles.input} value={settings?.forwardingKeyword || "NUFOTEC"} onChange={e => update("forwardingKeyword", e.target.value.toUpperCase())} placeholder="NUFOTEC" />
        </Field>
      </Section>

      <Section icon="speedometer2" color="#ff9800" title="Limites de débit (Rate Limiting)">
        <Field label="Messages par minute" hint="Nombre maximum de messages envoyés par minute">
          <input style={styles.input} type="number" min="1" max="300" value={settings?.rateLimitMessagesPerMinute ?? 30} onChange={e => update("rateLimitMessagesPerMinute", parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Délai entre messages (ms)" hint="Pause entre chaque message envoyé">
          <input style={styles.input} type="number" min="100" max="10000" value={settings?.rateLimitDelayBetween ?? 1000} onChange={e => update("rateLimitDelayBetween", parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Limite quotidienne" hint="Nombre maximum de messages par jour">
          <input style={styles.input} type="number" min="10" max="100000" value={settings?.rateLimitDailyLimit ?? 5000} onChange={e => update("rateLimitDailyLimit", parseInt(e.target.value) || 0)} />
        </Field>
      </Section>

      <Section icon="chat-dots" color="#5b4fff" title="Auto-réponses" noPadding>
        <div style={{ padding: isMobile ? 16 : 20 }}>
          {(settings?.autoReplies || []).length === 0 && (
            <p style={{ color: "#8696a0", fontSize: 13, margin: 0 }}>Aucune auto-réponse configurée.</p>
          )}
        </div>
        {(settings?.autoReplies || []).map((reply, idx) => (
          <div key={idx} style={styles.autoReplyRow}>
            <div style={{ display: "flex", gap: 8, flex: 1, flexDirection: isMobile ? "column" : "row" }}>
              <input style={{ ...styles.input, flex: 1 }} placeholder="Mot-clé" value={reply.keyword} onChange={e => updateAutoReply(idx, "keyword", e.target.value)} />
              <input style={{ ...styles.input, flex: 2 }} placeholder="Réponse" value={reply.response} onChange={e => updateAutoReply(idx, "response", e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: isMobile ? 8 : 0 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#667781", cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={reply.exactMatch} onChange={e => updateAutoReply(idx, "exactMatch", e.target.checked)} />
                Exact
              </label>
              <button onClick={() => removeAutoReply(idx)} style={styles.btnDanger} title="Supprimer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        ))}
        <div style={{ padding: isMobile ? 16 : 20, borderTop: (settings?.autoReplies || []).length > 0 ? "1px solid #f0f2f5" : "none" }}>
          <button onClick={addAutoReply} style={styles.btnAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter une auto-réponse
          </button>
        </div>
      </Section>

      <Section icon="bell" color="#e91e63" title="Notifications Telegram">
        <Field label="Token du bot Telegram" hint="Obtenu auprès de @BotFather">
          <input style={styles.input} value={settings?.telegramToken || ""} onChange={e => update("telegramToken", e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
        </Field>
        <Field label="Chat ID Telegram" hint="ID du chat ou groupe qui recevra les notifications (-100...)">
          <input style={styles.input} value={settings?.telegramChatId || ""} onChange={e => update("telegramChatId", e.target.value)} placeholder="-1001234567890" />
        </Field>
        <Field label="Notification de déconnexion" hint="Envoyer une notification quand WhatsApp se déconnecte">
          <Toggle checked={settings?.notifyOnDisconnect || false} onChange={v => update("notifyOnDisconnect", v)} />
        </Field>
        <Field label="Notification d'erreur" hint="Envoyer une notification en cas d'erreur critique">
          <Toggle checked={settings?.notifyOnError || false} onChange={v => update("notifyOnError", v)} />
        </Field>
        <Field label="Notification nouvel utilisateur" hint="Envoyer une notification quand un utilisateur s'inscrit">
          <Toggle checked={settings?.notifyOnNewUser || false} onChange={v => update("notifyOnNewUser", v)} />
        </Field>
      </Section>

      <Section icon="link-45deg" color="#607d8b" title="Webhook">
        <Field label="URL du webhook" hint="URL où envoyer les événements">
          <input style={styles.input} value={settings?.webhookUrl || ""} onChange={e => update("webhookUrl", e.target.value)} placeholder="https://exemple.com/webhook" />
        </Field>
        <Field label="Clé API du webhook" hint="Clé secrète envoyée dans l'en-tête X-Api-Key">
          <input style={styles.input} value={settings?.webhookApiKey || ""} onChange={e => update("webhookApiKey", e.target.value)} placeholder="clé secrète" />
        </Field>
      </Section>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24, marginBottom: 40 }}>
        <button style={styles.btnSave} onClick={save} disabled={saving}>
          {saving ? (
            <><span style={styles.spinnerSmall} /> Sauvegarde...</>
          ) : (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>Sauvegarder</>
          )}
        </button>
      </div>
    </div>
  );
};

const Section = ({ icon, color, title, children, noPadding }) => {
  const mobile = useMediaQuery("(max-width: 768px)");
  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <div style={{ ...styles.sectionIcon, background: `${color}18`, color }}>
          <i className={`bi bi-${icon}`} style={{ fontSize: 16 }}></i>
        </div>
        <h3 style={styles.sectionTitle}>{title}</h3>
      </div>
      <div style={{ padding: noPadding ? 0 : mobile ? "0 16px 16px" : "0 20px 20px" }}>
        {children}
      </div>
    </div>
  );
};

const Field = ({ label, hint, children }) => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  return (
    <div style={{
      ...styles.field,
      flexDirection: isMobile ? "column" : "row",
      alignItems: isMobile ? "stretch" : "center",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.fieldLabel}>{label}</div>
        {hint && <div style={styles.fieldHint}>{hint}</div>}
      </div>
      <div style={{ flex: isMobile ? "none" : 1, minWidth: isMobile ? "100%" : 200, marginTop: isMobile ? 6 : 0 }}>
        {children}
      </div>
    </div>
  );
};

const styles = {
  page: (isMobile) => ({
    maxWidth: 840,
    margin: "0 auto",
    padding: isMobile ? 12 : 0,
  }),
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", margin: 0 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 20px",
    borderBottom: "1px solid #f0f2f5",
  },
  sectionIcon: {
    width: 32, height: 32, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#111b21", margin: 0 },
  field: {
    display: "flex",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid #f8f9fa",
    gap: 12,
  },
  fieldLabel: { fontSize: 13, fontWeight: 500, color: "#111b21" },
  fieldHint: { fontSize: 11, color: "#8696a0", marginTop: 2 },
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    fontSize: 13,
    outline: "none",
    background: "#fff",
    color: "#111b21",
    boxSizing: "border-box",
  },
  autoReplyRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 20px",
    borderBottom: "1px solid #f0f2f5",
    flexWrap: "wrap",
  },
  btnAdd: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    background: "#f0f2f5",
    border: "1px dashed #ccc",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    color: "#075e54",
    cursor: "pointer",
  },
  btnDanger: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    border: "none",
    borderRadius: 6,
    background: "#fff0f0",
    color: "#ef5350",
    cursor: "pointer",
  },
  btnSave: {
    display: "inline-flex",
    alignItems: "center",
    padding: "10px 24px",
    background: "#075e54",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  spinnerSmall: {
    display: "inline-block",
    width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    marginRight: 6,
  },
  spinnerLarge: {
    width: 32, height: 32,
    border: "3px solid #e0e0e0",
    borderTopColor: "#075e54",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
  toast: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9999,
    color: "#fff",
    borderRadius: 8,
    padding: "12px 20px",
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
    maxWidth: 340,
  },
};

export default Settings;
