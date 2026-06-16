import React, { useState, useEffect } from "react";
import api from "../services/api";
import { useMediaQuery } from "../hooks/useMediaQuery";

const Toggle = ({ checked, onChange }) => (
  <div
    onClick={() => onChange(!checked)}
    style={{
      width: 44, height: 24, borderRadius: 12,
      background: checked ? "#075e54" : "#ccc",
      position: "relative", cursor: "pointer", flexShrink: 0,
      transition: "background 0.25s",
    }}
  >
    <div style={{
      width: 20, height: 20, borderRadius: "50%", background: "#fff",
      position: "absolute", top: 2, left: checked ? 22 : 2,
      transition: "left 0.25s, transform 0.15s",
      boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
    }} />
  </div>
);

const Settings = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      setSettings(data.settings);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const update = (field, value) => {
    setSettings(s => ({ ...s, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings", settings);
      setSettings(data.settings);
      setLastSaved(new Date());
      setToast({ type: "success", msg: "Paramètres sauvegardés avec succès" });
    } catch (err) {
      setToast({ type: "error", msg: err.response?.data?.error || "Erreur lors de la sauvegarde" });
    }
    setSaving(false);
  };

  const hasChanges = () => {
    if (!settings || !lastSaved) return false;
    return true;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", flexDirection: "column", gap: 16 }}>
        <div style={{ width: 40, height: 40, border: "3px solid #e0e0e0", borderTopColor: "#075e54", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
        <div style={{ color: "#8696a0", fontSize: 14 }}>Chargement des paramètres...</div>
      </div>
    );
  }

  return (
    <div style={styles.page(isMobile)}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .setting-card { animation: slideUp 0.3s ease-out both; }
        .setting-card:nth-child(1) { animation-delay: 0.05s; }
        .setting-card:nth-child(2) { animation-delay: 0.1s; }
        .setting-card:nth-child(3) { animation-delay: 0.15s; }
        .setting-card:nth-child(4) { animation-delay: 0.2s; }
        .setting-card:nth-child(5) { animation-delay: 0.25s; }
        .setting-card:nth-child(6) { animation-delay: 0.3s; }
        .setting-card:nth-child(7) { animation-delay: 0.35s; }
        .setting-card:nth-child(8) { animation-delay: 0.4s; }
        input:focus { border-color: #075e54 !important; box-shadow: 0 0 0 2px rgba(7,94,84,0.12) !important; }
      `}</style>

      {toast && (
        <div style={{
          ...styles.toast,
          background: toast.type === "success" ? "linear-gradient(135deg, #25d366, #128c7e)" : "linear-gradient(135deg, #ef5350, #c62828)",
          animation: "slideUp 0.3s ease-out, fadeIn 0.3s ease-out",
        }}>
          <span style={{ marginRight: 8, fontSize: 16 }}>
            {toast.type === "success" ? "✓" : "✕"}
          </span>
          {toast.msg}
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h2 style={styles.pageTitle}>Paramètres</h2>
          <p style={styles.pageSubtitle}>Configurez l'ensemble du bot WhatsApp</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {lastSaved && (
            <span style={{ fontSize: 11, color: "#8696a0" }}>
              Dernière sauvegarde : {lastSaved.toLocaleTimeString("fr-FR")}
            </span>
          )}
          <button style={{
            ...styles.btnSave,
            ...(saving ? styles.btnDisabled : {}),
          }} onClick={save} disabled={saving}>
            {saving ? (
              <><span style={styles.spinnerSmall} /> Sauvegarde...</>
            ) : (
              <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>Sauvegarder</>
            )}
          </button>
        </div>
      </div>

      {/* SECTION 1 : WhatsApp */}
      <div className="setting-card">
      <Section icon="whatsapp" color="#25d366" title="WhatsApp" desc="Configuration générale de la connexion WhatsApp">
        <Field label="Préfixe des commandes" hint="Caractère avant chaque commande (ex: >aide, /help)">
          <input style={styles.input} value={settings?.prefix || "/"} onChange={e => update("prefix", e.target.value)} placeholder="/" maxLength={2} />
        </Field>
        <Field label="Groupe des commandes" hint="Nom du groupe où les commandes sont actives (ex: 'preparation group')">
          <input style={styles.input} value={settings?.commandGroupName || ""} onChange={e => update("commandGroupName", e.target.value)} placeholder="preparation group" />
        </Field>
        <Field label="Rejeter automatiquement les appels" hint="Refuse les appels entrants sur le numéro WhatsApp connecté">
          <Toggle checked={settings?.autoRejectCalls || false} onChange={v => update("autoRejectCalls", v)} />
        </Field>
      </Section>
      </div>

      {/* SECTION 2 : Modération */}
      <div className="setting-card">
      <Section icon="shield" color="#075e54" title="Modération" desc="Gestion automatique des groupes restreints">
        <Field label="Activer la modération" hint="Supprime automatiquement les médias et liens des non-admins dans les groupes restreints">
          <Toggle checked={settings?.moderationEnabled || false} onChange={v => update("moderationEnabled", v)} />
        </Field>
        <Field label="Mot-clé d'auto-restriction" hint="Les groupes contenant ce mot-clé sont automatiquement marqués comme restreints (ex: nufotec)">
          <input style={styles.input} value={settings?.autoRestrictKeyword || ""} onChange={e => update("autoRestrictKeyword", e.target.value)} placeholder="nufotec" />
        </Field>
        <Field label="Message de bienvenue" hint="Envoyé aux nouveaux membres. Utilisez {user} pour mentionner">
          <textarea style={{ ...styles.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={settings?.welcomeMessage || ""} onChange={e => update("welcomeMessage", e.target.value)} placeholder="Bienvenue dans le groupe {user} !" />
        </Field>
      </Section>
      </div>

      {/* SECTION 3 : Transfert automatique (Forwarding) TO GROUPES */}
      <div className="setting-card">
      <Section icon="arrow-left-right" color="#00a884" title="Transfert automatique (Forwarding) TO GROUPES" desc="Configuration des mots-clés pour le forwarding automatique">
        <Field label="Mot-clé groupe maître (source)" hint="Les messages des groupes contenant ce mot-clé sont automatiquement transférés">
          <input style={styles.input} value={settings?.masterGroupKeyword || ""} onChange={e => update("masterGroupKeyword", e.target.value)} placeholder="ex: GROUPES" />
        </Field>
        <Field label="Mot-clé groupes cibles" hint="Les messages sont transférés aux groupes contenant ce mot-clé dans leur nom">
          <input style={styles.input} value={settings?.forwardingKeyword || ""} onChange={e => update("forwardingKeyword", e.target.value.toUpperCase())} placeholder="NUFOTEC" />
        </Field>
        <div style={{ padding: "8px 20px 14px", fontSize: 12, color: "#8696a0", borderTop: "1px solid #f0f2f5", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>
            <i className="bi bi-info-circle" style={{ marginRight: 4 }}></i>
            Ces paramètres sont utilisés par les règles de forwarding avec l'option "Tous les groupes" activée.
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#25d366", background: "#e8f5e9", padding: "2px 10px", borderRadius: 4 }}>OUI ✓</span>
        </div>
      </Section>
      </div>

      {/* SECTION 3.5 : Forward to Members (Inbox) */}
      <div className="setting-card">
      <Section icon="inbox" color="#5b4fff" title="Transfert aux membres (Inbox)" desc="Les groupes source avec le mot-clé INBOX envoient aux membres des groupes NUFOTEC">
        <Field label="Mot-clé groupe source (Inbox)" hint="Les messages des groupes contenant ce mot-clé sont envoyés en MP aux membres">
          <input style={styles.input} value={settings?.inboxKeyword || ""} onChange={e => update("inboxKeyword", e.target.value)} placeholder="ex: INBOX" />
        </Field>
        <Field label="Mot-clé groupes cibles (membres)" hint="Les membres des groupes contenant ce mot-clé reçoivent le message en privé">
          <input style={styles.input} value={settings?.forwardingKeyword || "NUFOTEC"} onChange={e => update("forwardingKeyword", e.target.value.toUpperCase())} placeholder="NUFOTEC" readOnly />
        </Field>
        <div style={{ padding: "8px 20px 14px", fontSize: 12, color: "#8696a0", borderTop: "1px solid #f0f2f5", marginTop: 4 }}>
          <i className="bi bi-info-circle" style={{ marginRight: 4 }}></i>
          Les messages sont envoyés individuellement à chaque membre des groupes cibles (pas dans un groupe).
        </div>
      </Section>
      </div>

      {/* SECTION 4 : Limites de débit */}
      <div className="setting-card">
      <Section icon="speedometer2" color="#ff9800" title="Limites de débit (Rate Limiting)" desc="Protection contre le spam et limitation du nombre de messages">
        <Field label="Messages par minute" hint="Nombre maximum de messages envoyés par minute (1-300)">
          <input style={styles.input} type="number" min="1" max="300" value={settings?.rateLimitMessagesPerMinute ?? 30}
            onChange={e => update("rateLimitMessagesPerMinute", Math.max(1, Math.min(300, parseInt(e.target.value) || 1)))} />
        </Field>
        <Field label="Délai entre messages (ms)" hint="Pause minimale entre chaque message envoyé (100-10000ms)">
          <input style={styles.input} type="number" min="100" max="10000" value={settings?.rateLimitDelayBetween ?? 1000}
            onChange={e => update("rateLimitDelayBetween", Math.max(100, Math.min(10000, parseInt(e.target.value) || 100)))} />
        </Field>
        <Field label="Limite quotidienne" hint="Nombre maximum de messages par jour (10-100000)">
          <input style={styles.input} type="number" min="10" max="100000" value={settings?.rateLimitDailyLimit ?? 5000}
            onChange={e => update("rateLimitDailyLimit", Math.max(10, Math.min(100000, parseInt(e.target.value) || 10)))} />
        </Field>
      </Section>
      </div>

      {/* SECTION 5 : Auto-réponses */}
      <div className="setting-card">
      <Section icon="chat-dots" color="#5b4fff" title="Auto-réponses" desc="Réponses automatiques aux mots-clés dans les groupes" noPadding>
        <div style={{ padding: isMobile ? 16 : 20 }}>
          {(settings?.autoReplies || []).length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#8696a0" }}>
              <i className="bi bi-chat-dots" style={{ fontSize: 32, display: "block", marginBottom: 8, opacity: 0.4 }}></i>
              <p style={{ fontSize: 13, margin: 0 }}>Aucune auto-réponse configurée.</p>
              <p style={{ fontSize: 12, margin: "4px 0 0" }}>Cliquez sur "Ajouter" pour créer une règle.</p>
            </div>
          )}
        </div>
        {(settings?.autoReplies || []).map((reply, idx) => (
          <div key={idx} style={styles.autoReplyRow}>
            <div style={{ display: "flex", gap: 8, flex: 1, flexDirection: isMobile ? "column" : "row" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input style={{ ...styles.input, paddingRight: 30 }} placeholder="Mot-clé à détecter" value={reply.keyword}
                  onChange={e => updateAutoReply(idx, "keyword", e.target.value)} />
                {reply.exactMatch && <span style={{ position: "absolute", right: 8, top: 8, fontSize: 9, color: "#5b4fff", fontWeight: 600 }}>EXACT</span>}
              </div>
              <input style={{ ...styles.input, flex: 2 }} placeholder="Réponse automatique" value={reply.response}
                onChange={e => updateAutoReply(idx, "response", e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: isMobile ? 8 : 0 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#667781", cursor: "pointer", whiteSpace: "nowrap", background: "#f0f2f5", padding: "4px 8px", borderRadius: 4 }}>
                <input type="checkbox" checked={reply.exactMatch} onChange={e => updateAutoReply(idx, "exactMatch", e.target.checked)} />
                Exact
              </label>
              <button onClick={() => removeAutoReply(idx)} style={styles.btnDanger} title="Supprimer cette auto-réponse">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        ))}
        <div style={{
          padding: isMobile ? 16 : 20,
          borderTop: (settings?.autoReplies || []).length > 0 ? "1px solid #f0f2f5" : "none",
          display: "flex", gap: 8,
        }}>
          <button onClick={addAutoReply} style={styles.btnAdd}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Ajouter une auto-réponse
          </button>
        </div>
      </Section>
      </div>

      {/* SECTION 6 : Notifications Telegram */}
      <div className="setting-card">
      <Section icon="bell" color="#e91e63" title="Notifications Telegram" desc="Recevez des alertes sur Telegram pour les événements du bot">
        <Field label="Token du bot Telegram" hint="Obtenu auprès de @BotFather sur Telegram">
          <div style={{ position: "relative" }}>
            <input style={styles.input} type="password" value={settings?.telegramToken || ""}
              onChange={e => update("telegramToken", e.target.value)} placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" />
            <span style={{ position: "absolute", right: 8, top: 8, fontSize: 10, color: "#8696a0" }}>
              <i className="bi bi-lock"></i>
            </span>
          </div>
        </Field>
        <Field label="Chat ID Telegram" hint="ID du chat ou groupe qui recevra les notifications (commence par -100...)">
          <input style={styles.input} value={settings?.telegramChatId || ""} onChange={e => update("telegramChatId", e.target.value)} placeholder="-1001234567890" />
        </Field>
        <Field label="Notification de déconnexion" hint="Envoyer une notification quand WhatsApp se déconnecte">
          <Toggle checked={settings?.notifyOnDisconnect || false} onChange={v => update("notifyOnDisconnect", v)} />
        </Field>
        <Field label="Notification d'erreur" hint="Envoyer une notification en cas d'erreur critique">
          <Toggle checked={settings?.notifyOnError || false} onChange={v => update("notifyOnError", v)} />
        </Field>
        <Field label="Nouvel utilisateur" hint="Envoyer une notification quand un utilisateur s'inscrit">
          <Toggle checked={settings?.notifyOnNewUser || false} onChange={v => update("notifyOnNewUser", v)} />
        </Field>
      </Section>
      </div>

      {/* SECTION 7 : Webhook */}
      <div className="setting-card">
      <Section icon="link-45deg" color="#607d8b" title="Webhook" desc="API externe pour envoyer des messages via HTTP">
        <Field label="URL du webhook" hint="URL où envoyer les événements (POST)">
          <input style={styles.input} value={settings?.webhookUrl || ""} onChange={e => update("webhookUrl", e.target.value)} placeholder="https://exemple.com/webhook" />
        </Field>
        <Field label="Clé API" hint="Clé secrète envoyée dans l'en-tête X-Api-Key pour authentifier les appels">
          <div style={{ position: "relative" }}>
            <input style={styles.input} type="password" value={settings?.webhookApiKey || ""}
              onChange={e => update("webhookApiKey", e.target.value)} placeholder="clé secrète" />
            <span style={{ position: "absolute", right: 8, top: 8, fontSize: 10, color: "#8696a0" }}>
              <i className="bi bi-lock"></i>
            </span>
          </div>
        </Field>
      </Section>
      </div>

      {/* SECTION 8 : Système */}
      <div className="setting-card">
      <Section icon="gear" color="#455a64" title="Système" desc="Informations et actions système">
        <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#111b21" }}>État de la connexion</div>
            <div style={{ fontSize: 11, color: "#8696a0", marginTop: 2 }}>Les paramètres sont sauvegardés en base de données</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#25d366" }} />
            <span style={{ fontSize: 12, color: "#25d366", fontWeight: 600 }}>Actif</span>
          </div>
        </div>
      </Section>
      </div>

      {/* Barre de sauvegarde flottante en bas */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 32, marginBottom: 40,
        background: "linear-gradient(to top, #fff 60%, transparent)",
        padding: "16px 0 8px",
        display: "flex", justifyContent: "flex-end",
      }}>
        <button style={{
          ...styles.btnSave,
          padding: "12px 32px",
          fontSize: 15,
          boxShadow: "0 4px 16px rgba(7,94,84,0.3)",
          ...(saving ? styles.btnDisabled : {}),
        }} onClick={save} disabled={saving}>
          {saving ? (
            <><span style={styles.spinnerSmall} /> Sauvegarde en cours...</>
          ) : (
            <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 8 }}><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/></svg>Enregistrer les modifications</>
          )}
        </button>
      </div>
    </div>
  );

  function addAutoReply() {
    const replies = [...(settings.autoReplies || [])];
    replies.push({ keyword: "", response: "", exactMatch: false, groupIds: [] });
    update("autoReplies", replies);
  }

  function updateAutoReply(index, field, value) {
    const replies = [...(settings.autoReplies || [])];
    replies[index] = { ...replies[index], [field]: value };
    update("autoReplies", replies);
  }

  function removeAutoReply(index) {
    const replies = [...(settings.autoReplies || [])];
    replies.splice(index, 1);
    update("autoReplies", replies);
  }
};

const Section = ({ icon, color, title, desc, children, noPadding }) => {
  const mobile = useMediaQuery("(max-width: 768px)");
  return (
    <div style={styles.card}>
      <div style={styles.sectionHeader}>
        <div style={{ ...styles.sectionIcon, background: `${color}15`, color }}>
          <i className={`bi bi-${icon}`} style={{ fontSize: 16 }}></i>
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={styles.sectionTitle}>{title}</h3>
          {desc && <p style={styles.sectionDesc}>{desc}</p>}
        </div>
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
      <div style={{
        flex: isMobile ? "none" : 1,
        minWidth: isMobile ? "100%" : 220,
        marginTop: isMobile ? 6 : 0,
      }}>
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 24,
    gap: 16,
    flexWrap: "wrap",
  },
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", margin: 0 },
  pageSubtitle: { fontSize: 13, color: "#8696a0", margin: "4px 0 0" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    overflow: "hidden",
    transition: "box-shadow 0.2s",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px",
    borderBottom: "1px solid #f0f2f5",
  },
  sectionIcon: {
    width: 36, height: 36, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: "#111b21", margin: 0 },
  sectionDesc: { fontSize: 11, color: "#8696a0", margin: "2px 0 0" },
  field: {
    display: "flex",
    justifyContent: "space-between",
    padding: "14px 20px",
    borderBottom: "1px solid #f8f9fa",
    gap: 12,
  },
  fieldLabel: { fontSize: 13, fontWeight: 500, color: "#111b21" },
  fieldHint: { fontSize: 11, color: "#8696a0", marginTop: 2, lineHeight: 1.4 },
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
    transition: "border 0.2s",
  },
  autoReplyRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 20px",
    borderBottom: "1px solid #f0f2f5",
    flexWrap: "wrap",
    background: "#fafafa",
  },
  btnAdd: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    background: "#f0f2f5",
    border: "1px dashed #bbb",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    color: "#075e54",
    cursor: "pointer",
    transition: "all 0.2s",
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
    transition: "background 0.2s",
    flexShrink: 0,
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
    transition: "opacity 0.2s, transform 0.1s",
  },
  btnDisabled: { opacity: 0.6, cursor: "not-allowed" },
  spinnerSmall: {
    display: "inline-block",
    width: 14, height: 14,
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    marginRight: 6,
  },
  toast: {
    position: "fixed",
    bottom: 24,
    right: 24,
    zIndex: 9999,
    color: "#fff",
    borderRadius: 10,
    padding: "14px 22px",
    fontSize: 13,
    fontWeight: 600,
    boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
    maxWidth: 380,
    display: "flex",
    alignItems: "center",
  },
};

export default Settings;