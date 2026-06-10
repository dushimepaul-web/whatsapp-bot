import React, { useState, useEffect } from "react";
import api from "../services/api";

const Forwarding = () => {
  const [rules, setRules] = useState([]);
  const [groups, setGroups] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    name: "", sourceGroupId: "", targetGroupIds: [],
    forwardToAllGroups: false, forwardToMembers: false,
    onlyAdmins: false, masterGroup: false, includeMedia: true,
    targetGroupPattern: "",
  });

  useEffect(() => { load(); }, []);

  const load = async (showmsg) => {
    try {
      const [r, g] = await Promise.all([
        api.get("/forwarding"),
        api.get("/groups"),
      ]);
      const groupsData = g.data.groups || [];
      setGroups(groupsData);
      setRules(r.data.rules || []);
      if (showmsg) alert(`Groupes chargés: ${groupsData.length}`);
    } catch (e) {
      if (e.code !== "ERR_CANCELED" && e.message !== "Request aborted") {
        console.error("Erreur chargement:", e);
        if (showmsg) alert(`Erreur: ${e.message}`);
      }
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.post("/groups/refresh");
      alert("Synchronisation réussie");
    } catch (e) {
      alert(`Erreur lors de la synchronisation: ${e.message}`);
    }
    await load();
    setSyncing(false);
  };

  const resetForm = () => {
    setForm({ name: "", sourceGroupId: "", targetGroupIds: [], forwardToAllGroups: false, forwardToMembers: false, onlyAdmins: false, masterGroup: false, includeMedia: true, targetGroupPattern: "" });
    setEditing(null);
    setShowForm(false);
  };

  const handleEdit = (rule) => {
    setForm({ 
      name: rule.name, 
      sourceGroupId: rule.sourceGroupId, 
      targetGroupIds: rule.targetGroupIds || [], 
      forwardToAllGroups: rule.forwardToAllGroups, 
      forwardToMembers: rule.forwardToMembers, 
      onlyAdmins: rule.onlyAdmins, 
      masterGroup: rule.masterGroup, 
      includeMedia: rule.includeMedia, 
      targetGroupPattern: rule.targetGroupPattern || "" 
    });
    setEditing(rule._id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.sourceGroupId) {
      alert("Le nom et le groupe source sont requis.");
      return;
    }
    if (!form.forwardToAllGroups && form.targetGroupIds.length === 0 && !form.forwardToMembers) {
      alert("Veuillez sélectionner au moins un groupe cible ou cocher 'Tous les groupes'.");
      return;
    }
    try {
      if (editing) {
        await api.put(`/forwarding/${editing}`, form);
      } else {
        await api.post("/forwarding", form);
      }
      resetForm();
      load();
    } catch (e) {
      alert("Erreur lors de la sauvegarde.");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Voulez-vous vraiment supprimer cette règle ?")) {
      try { await api.delete(`/forwarding/${id}`); load(); } catch {}
    }
  };

  const handleToggle = async (id) => {
    try { await api.patch(`/forwarding/${id}/toggle`); load(); } catch {}
  };

  const toggleTarget = (gid) => {
    setForm((f) => ({
      ...f,
      targetGroupIds: f.targetGroupIds.includes(gid)
        ? f.targetGroupIds.filter((id) => id !== gid)
        : [...f.targetGroupIds, gid],
    }));
  };

  const getGroupName = (gid) => groups.find((g) => g.groupId === gid)?.name || gid?.split("@")[0] || gid;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerInfo}>
          <h2 style={styles.pageTitle}>Règles de diffusion</h2>
          <span style={styles.pageSubtitle}>Configurez le transfert automatique en temps réel de vos messages</span>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} style={styles.btnAdd}>
          <i className="bi bi-plus-lg" style={{ marginRight: 6 }}></i>Nouvelle règle
        </button>
      </div>

      {groups.length === 0 && (
        <div style={styles.infoBox}>
          <i className="bi bi-exclamation-circle-fill" style={{ fontSize: 24, color: "#ea4335", marginBottom: 8 }}></i>
          <p style={styles.infoText}>Aucun groupe trouvé. Assurez-vous que WhatsApp est connecté, puis synchronisez les groupes.</p>
          <button onClick={handleSync} style={styles.btnSync} disabled={syncing}>
            {syncing ? "Synchronisation en cours..." : <><i className="bi bi-arrow-clockwise" style={{ marginRight: 6 }}></i>Synchroniser les groupes</>}
          </button>
        </div>
      )}

      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>
            <i className="bi bi-sliders" style={{ marginRight: 8, color: "#00a884" }}></i>
            {editing ? "Modifier la règle" : "Créer une règle de transfert"}
          </h3>
          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Nom de la règle</label>
              <input style={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Groupe Master vers Diffusions" />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Groupe source (Master ou Standard)</label>
              <select style={styles.input} value={form.sourceGroupId} onChange={(e) => setForm({ ...form, sourceGroupId: e.target.value })}>
                <option value="">-- Sélectionner un groupe --</option>
                {groups.map((g) => <option key={g.groupId} value={g.groupId}>{g.name}</option>)}
              </select>
            </div>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Groupes cibles (Destinations)</label>
            {form.forwardToAllGroups ? (
              <div style={styles.patternBox}>
                <p style={styles.hint}>
                  <i className="bi bi-globe2" style={{ marginRight: 6, color: "#00a884" }}></i>
                  Diffusion vers <strong>tous les groupes</strong> de votre compte (excluant la source).
                </p>
                <input 
                  style={styles.input} 
                  value={form.targetGroupPattern} 
                  onChange={(e) => setForm({ ...form, targetGroupPattern: e.target.value })} 
                  placeholder="Filtre par nom (ex: Clients) - Laissez vide pour cibler tous les groupes" 
                />
              </div>
            ) : (
              <div style={styles.chipSection}>
                <p style={styles.hintSmall}>Sélectionnez individuellement les groupes de destination (cliquez pour sélectionner/désélectionner) :</p>
                <div style={styles.chipList}>
                  {groups.filter((g) => g.groupId !== form.sourceGroupId).map((g) => {
                    const isSelected = form.targetGroupIds.includes(g.groupId);
                    return (
                      <span 
                        key={g.groupId} 
                        onClick={() => toggleTarget(g.groupId)} 
                        style={{ 
                          ...styles.chip, 
                          backgroundColor: isSelected ? "#00a884" : "#f0f2f5", 
                          color: isSelected ? "#fff" : "#111b21",
                          border: isSelected ? "1px solid #00a884" : "1px solid #e9edef"
                        }}
                      >
                        {isSelected && <i className="bi bi-check-lg" style={{ marginRight: 4 }}></i>}
                        {g.name}
                      </span>
                    );
                  })}
                  {groups.filter((g) => g.groupId !== form.sourceGroupId).length === 0 && (
                    <span style={styles.emptyChips}>Aucun autre groupe disponible</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div style={styles.checkSection}>
            <h4 style={styles.checkTitle}>Options de transfert</h4>
            <div style={styles.checkGrid}>
              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} checked={form.masterGroup} onChange={(e) => setForm({ ...form, masterGroup: e.target.checked })} />
                <div style={styles.checkTexts}>
                  <strong style={styles.checkMain}><i className="bi bi-trophy-fill" style={{ color: "#ffc107", marginRight: 4 }}></i>Groupe Master</strong>
                  <span style={styles.checkDesc}>Transférer automatiquement TOUS les messages de n'importe quel type reçus dans ce groupe.</span>
                </div>
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} checked={form.forwardToAllGroups} onChange={(e) => setForm({ ...form, forwardToAllGroups: e.target.checked })} />
                <div style={styles.checkTexts}>
                  <strong style={styles.checkMain}>Tous les groupes</strong>
                  <span style={styles.checkDesc}>Cibler automatiquement tous vos groupes (avec filtre optionnel).</span>
                </div>
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} checked={form.onlyAdmins} onChange={(e) => setForm({ ...form, onlyAdmins: e.target.checked })} />
                <div style={styles.checkTexts}>
                  <strong style={styles.checkMain}>Admins uniquement</strong>
                  <span style={styles.checkDesc}>Transférer uniquement si l'expéditeur d'origine est un administrateur du groupe source.</span>
                </div>
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} checked={form.includeMedia} onChange={(e) => setForm({ ...form, includeMedia: e.target.checked })} />
                <div style={styles.checkTexts}>
                  <strong style={styles.checkMain}>Inclure les médias</strong>
                  <span style={styles.checkDesc}>Transférer les images, vidéos, audios, documents et autocollants (recommandé).</span>
                </div>
              </label>

              <label style={styles.checkLabel}>
                <input type="checkbox" style={styles.checkbox} checked={form.forwardToMembers} onChange={(e) => setForm({ ...form, forwardToMembers: e.target.checked })} />
                <div style={styles.checkTexts}>
                  <strong style={styles.checkMain}>Envoyer aux membres</strong>
                  <span style={styles.checkDesc}>Envoyer en message privé individuel à chaque membre des groupes cibles.</span>
                </div>
              </label>
            </div>
          </div>

          <div style={styles.formActions}>
            <button onClick={handleSubmit} style={styles.btnSave}>
              <i className="bi bi-check-circle-fill" style={{ marginRight: 6 }}></i>
              {editing ? "Enregistrer" : "Créer la règle"}
            </button>
            <button onClick={resetForm} style={styles.btnCancel}>Annuler</button>
          </div>
        </div>
      )}

      <div style={styles.list}>
        <div style={styles.listHeader}>Règles actives</div>
        {rules.length === 0 && <p style={styles.empty}>Aucune règle de diffusion configurée. Cliquez sur "Nouvelle règle" pour commencer.</p>}
        {rules.map((rule) => (
          <div key={rule._id} style={{ ...styles.card, opacity: rule.isActive ? 1 : 0.6 }}>
            <div style={styles.cardHeader}>
              <div style={styles.cardTitleRow}>
                <span style={styles.cardName}>{rule.name}</span>
                {rule.masterGroup && (
                  <span style={styles.masterBadge}>
                    <i className="bi bi-trophy-fill" style={{ marginRight: 4 }}></i>Master
                  </span>
                )}
                {rule.onlyAdmins && (
                  <span style={styles.adminBadge}>
                    <i className="bi bi-shield-fill-check" style={{ marginRight: 4 }}></i>Admins
                  </span>
                )}
                <span style={{ ...styles.statusBadge, backgroundColor: rule.isActive ? "#e6f6f3" : "#eaeaea", color: rule.isActive ? "#00a884" : "#8696a0" }}>
                  {rule.isActive ? "Actif" : "Inactif"}
                </span>
              </div>
              <div style={styles.cardActions}>
                <button onClick={() => handleEdit(rule)} style={styles.smallBtn} title="Modifier"><i className="bi bi-pencil-square"></i></button>
                <button onClick={() => handleToggle(rule._id)} style={styles.smallBtn} title={rule.isActive ? "Désactiver" : "Activer"}>
                  {rule.isActive ? <i className="bi bi-pause-circle-fill" style={{ color: "#fe9f06" }}></i> : <i className="bi bi-play-circle-fill" style={{ color: "#00a884" }}></i>}
                </button>
                <button onClick={() => handleDelete(rule._id)} style={styles.smallBtn} title="Supprimer"><i className="bi bi-trash3-fill" style={{ color: "#ea4335" }}></i></button>
              </div>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.cardInfoGrid}>
                <p style={styles.cardLine}>
                  <strong>Groupe Source :</strong> <span style={styles.highlightText}>{getGroupName(rule.sourceGroupId)}</span>
                </p>
                <p style={styles.cardLine}>
                  <strong>Groupes Cibles :</strong>{" "}
                  <span style={styles.highlightText}>
                    {rule.forwardToAllGroups 
                      ? (rule.targetGroupPattern ? `Tous les groupes contenant "${rule.targetGroupPattern}"` : "Tous les groupes du compte") 
                      : (rule.targetGroupIds || []).map(getGroupName).join(", ") || "Aucun"
                    }
                  </span>
                </p>
              </div>
              <div style={styles.cardFooterOptions}>
                <span><i className={`bi ${rule.includeMedia ? "bi-check-circle" : "bi-x-circle"}`} style={{ marginRight: 4, color: rule.includeMedia ? "#00a884" : "#ea4335" }}></i>Médias</span>
                <span><i className={`bi ${rule.forwardToMembers ? "bi-check-circle" : "bi-x-circle"}`} style={{ marginRight: 4, color: rule.forwardToMembers ? "#00a884" : "#ea4335" }}></i>Envoi privé aux membres</span>
              </div>
            </div>
          </div>
        ))}
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
    gap: 16
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerInfo: { display: "flex", flexDirection: "column", gap: 4 },
  pageTitle: { fontSize: 24, fontWeight: 700, color: "#111b21", margin: 0 },
  pageSubtitle: { fontSize: 13, color: "#667781" },
  btnAdd: { 
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
  formCard: { 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    padding: 24, 
    boxShadow: "0 1px 3px rgba(11,20,26,0.08)",
    border: "1px solid #e9edef",
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  formTitle: { 
    fontSize: 16, 
    fontWeight: 700, 
    color: "#111b21", 
    margin: 0,
    display: "flex",
    alignItems: "center"
  },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 600, color: "#54656f" },
  input: { 
    width: "100%", 
    padding: "11px 14px", 
    border: "1px solid #e9edef", 
    borderRadius: 8, 
    fontSize: 14, 
    outline: "none", 
    boxSizing: "border-box",
    backgroundColor: "#f8f9fa",
    transition: "border 0.2s"
  },
  patternBox: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #e9edef",
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  hint: { fontSize: 12, color: "#54656f", margin: 0 },
  hintSmall: { fontSize: 11, color: "#8696a0", margin: 0 },
  chipSection: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  chipList: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: { 
    padding: "6px 14px", 
    borderRadius: 16, 
    fontSize: 12, 
    fontWeight: 600, 
    cursor: "pointer", 
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center"
  },
  emptyChips: { fontSize: 12, color: "#8696a0", fontStyle: "italic", padding: "4px 0" },
  checkSection: {
    borderTop: "1px solid #f0f2f5",
    paddingTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#54656f",
    margin: 0,
    textTransform: "uppercase"
  },
  checkGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16
  },
  checkLabel: { 
    display: "flex", 
    alignItems: "flex-start", 
    gap: 10, 
    cursor: "pointer",
    padding: 12,
    border: "1px solid #e9edef",
    borderRadius: 8,
    backgroundColor: "#f8f9fa"
  },
  checkbox: { marginTop: 3 },
  checkTexts: { display: "flex", flexDirection: "column", gap: 2 },
  checkMain: { fontSize: 13, color: "#111b21" },
  checkDesc: { fontSize: 11, color: "#8696a0", lineHeight: 1.3 },
  formActions: { display: "flex", gap: 10, borderTop: "1px solid #f0f2f5", paddingTop: 16 },
  btnSave: { 
    padding: "11px 24px", 
    backgroundColor: "#00a884", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer",
    display: "flex",
    alignItems: "center"
  },
  btnCancel: { 
    padding: "11px 24px", 
    backgroundColor: "#f0f2f5", 
    color: "#54656f", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 13, 
    fontWeight: 600, 
    cursor: "pointer" 
  },
  list: { 
    display: "flex", 
    flexDirection: "column", 
    gap: 12,
    backgroundColor: "#fff",
    border: "1px solid #e9edef",
    borderRadius: 12,
    padding: 20
  },
  listHeader: {
    fontWeight: 700,
    fontSize: 14,
    color: "#54656f",
    textTransform: "uppercase",
    marginBottom: 8,
    letterSpacing: "0.2px"
  },
  empty: { textAlign: "center", color: "#8696a0", padding: 30, fontSize: 13, margin: 0 },
  card: { 
    backgroundColor: "#fff", 
    borderRadius: 8, 
    padding: 16, 
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
    border: "1px solid #e9edef",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  cardName: { fontSize: 14, fontWeight: 700, color: "#111b21" },
  masterBadge: { 
    fontSize: 10, 
    backgroundColor: "#fff9db", 
    color: "#fe9f06", 
    padding: "2px 8px", 
    borderRadius: 6,
    fontWeight: 700,
    border: "1px solid #ffe8cc"
  },
  adminBadge: { 
    fontSize: 10, 
    backgroundColor: "#e6f6f3", 
    color: "#00a884", 
    padding: "2px 8px", 
    borderRadius: 6,
    fontWeight: 700
  },
  statusBadge: { fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700 },
  cardActions: { display: "flex", gap: 6 },
  smallBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "4px 6px" },
  cardBody: { display: "flex", flexDirection: "column", gap: 10 },
  cardInfoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    fontSize: 13
  },
  cardLine: { margin: 0, color: "#54656f" },
  highlightText: { color: "#111b21", fontWeight: 600 },
  cardFooterOptions: {
    display: "flex",
    gap: 16,
    fontSize: 11,
    color: "#8696a0",
    borderTop: "1px solid #f8f9fa",
    paddingTop: 8
  },
  infoBox: { 
    backgroundColor: "#fde8e8", 
    borderRadius: 12, 
    padding: 20, 
    textAlign: "center", 
    border: "1px solid #fcd2d2",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 8
  },
  infoText: { fontSize: 13, color: "#ea4335", margin: 0, fontWeight: 500 },
  btnSync: { 
    padding: "8px 20px", 
    backgroundColor: "#ea4335", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 12, 
    fontWeight: 600, 
    cursor: "pointer" 
  },
};

export default Forwarding;
