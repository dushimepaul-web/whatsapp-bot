import React, { useState, useEffect } from "react";
import api from "../services/api";
import { formatDate } from "../utils/helpers";
import { useMediaQuery } from "../hooks/useMediaQuery";

const Groups = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    const params = { limit: 50, page };
    if (search) params.search = search;
    api.get("/groups", { params }).then(({ data }) => {
      setGroups(data.groups);
      setTotal(data.total);
      setPages(data.pages);
      // Auto-select first group if none is selected
      if (data.groups.length > 0 && !selected) {
        viewMembers(data.groups[0]);
      }
    }).catch(() => {});
  }, [search, page]);

  const viewMembers = async (group) => {
    setSelected(group);
    setLoadingMembers(true);
    try {
      const { data } = await api.get(`/groups/${group.groupId}/members`);
      setMembers(data.members);
    } catch { 
      setMembers([]); 
    }
    setLoadingMembers(false);
  };

  const toggleVisibility = async (groupId, isVisible) => {
    try {
      await api.patch(`/groups/${groupId}/visibility`, { isVisible: !isVisible });
      const updatedVisible = !isVisible;
      setGroups((prev) => prev.map((g) => g.groupId === groupId ? { ...g, isVisible: updatedVisible } : g));
      setSelected((prev) => prev && prev.groupId === groupId ? { ...prev, isVisible: updatedVisible } : prev);
    } catch {}
  };

  const toggleRestrict = async (groupId, isRestricted) => {
    try {
      await api.patch(`/groups/${groupId}/restrict`, { isRestricted: !isRestricted });
      const updatedRestricted = !isRestricted;
      setGroups((prev) => prev.map((g) => g.groupId === groupId ? { ...g, isRestricted: updatedRestricted } : g));
      setSelected((prev) => prev && prev.groupId === groupId ? { ...prev, isRestricted: updatedRestricted } : prev);
    } catch {}
  };

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <h2 style={styles.pageTitle}>Groupes WhatsApp</h2>
        <span style={styles.pageSubtitle}>Gérer la visibilité des groupes et configurer les restrictions membres</span>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.searchContainer}>
          <i className="bi bi-search" style={styles.searchIcon}></i>
          <input 
            style={styles.search} 
            type="text" 
            placeholder="Rechercher un groupe..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
          />
        </div>
      </div>

      <div style={styles.split(isMobile)}>
        <div style={styles.listPanel(isMobile)}>
          <div style={styles.listHeader}>
            <span>Tous les groupes ({total})</span>
          </div>
          <div style={styles.listContent}>
            {groups.map((g) => (
              <div 
                key={g.groupId} 
                style={{ 
                  ...styles.card, 
                  backgroundColor: selected?.groupId === g.groupId ? "#eaeaea" : "#fff",
                  borderLeft: selected?.groupId === g.groupId ? "4px solid #00a884" : "4px solid transparent"
                }} 
                onClick={() => viewMembers(g)}
              >
                <div style={styles.cardHeader}>
                  <span style={styles.cardName}>{g.name}</span>
                  <div style={styles.badgeContainer}>
                    {g.isRestricted && <span style={styles.restrictBadge}><i className="bi bi-shield-lock-fill" style={{ marginRight: 3 }}></i>Restreint</span>}
                    <span style={{ ...styles.badge, backgroundColor: g.isVisible ? "#00a884" : "#8696a0" }}>
                      {g.isVisible ? "Visible" : "Masqué"}
                    </span>
                  </div>
                </div>
                <div style={styles.cardMeta}>
                  <span><i className="bi bi-people-fill" style={{ marginRight: 4 }}></i>{g.memberCount} membres</span>
                  <span><i className="bi bi-shield-check" style={{ marginRight: 4 }}></i>{g.adminCount} admins</span>
                  {g.botIsAdmin && <span style={styles.botAdminBadge}><i className="bi bi-robot" style={{ marginRight: 3 }}></i>Bot Admin</span>}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p style={styles.empty}>Aucun groupe trouvé</p>}
          </div>
          {pages > 1 && (
            <div style={styles.pagination}>
              <button style={{ ...styles.pageBtn, opacity: page <= 1 ? 0.5 : 1 }} disabled={page <= 1} onClick={() => setPage(page - 1)}><i className="bi bi-chevron-left"></i></button>
              <span style={styles.pageInfo}>{page} / {pages}</span>
              <button style={{ ...styles.pageBtn, opacity: page >= pages ? 0.5 : 1 }} disabled={page >= pages} onClick={() => setPage(page + 1)}><i className="bi bi-chevron-right"></i></button>
            </div>
          )}
        </div>

        <div style={styles.detailPanel(isMobile)}>
          {selected ? (
            <div style={styles.detailContainer}>
              <div style={styles.detailHeader}>
                <div style={styles.detailAvatar}>{selected.name?.charAt(0)?.toUpperCase() || "?"}</div>
                <div style={styles.detailHeaderInfo}>
                  <h3 style={styles.detailTitle}>{selected.name}</h3>
                  <span style={styles.detailJid}>{selected.groupId}</span>
                </div>
              </div>

              {selected.description && (
                <div style={styles.descBox}>
                  <span style={styles.descLabel}>Description du groupe</span>
                  <p style={styles.detailDesc}>{selected.description}</p>
                </div>
              )}

              <div style={styles.infoGrid(isMobile)}>
                <div style={styles.infoItem}>
                  <span style={styles.infoVal}>{selected.memberCount}</span>
                  <span style={styles.infoLbl}>Membres</span>
                </div>
                <div style={styles.infoItem}>
                  <span style={styles.infoVal}>{selected.adminCount}</span>
                  <span style={styles.infoLbl}>Administrateurs</span>
                </div>
                <div style={styles.infoItem}>
                  <span style={styles.infoVal}>{selected.botIsAdmin ? "Oui" : "Non"}</span>
                  <span style={styles.infoLbl}>Bot Admin</span>
                </div>
              </div>

              {!selected.botIsAdmin && (
                <div style={styles.warningBox}>
                  <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: 18, color: "#fe9f06" }}></i>
                  <div style={styles.warningText}>
                    <strong>Bot non-administrateur</strong>
                    <span>Le bot n'a pas les privilèges d'administrateur dans ce groupe. Les restrictions texte ne pourront pas être appliquées car le bot ne peut pas supprimer les messages des membres.</span>
                  </div>
                </div>
              )}

              <div style={styles.controlSection}>
                <h4 style={styles.sectionHeading}>Actions & Règles de Modération</h4>
                
                  <div style={styles.actionRow(isMobile)}>
                  <div style={styles.actionInfo}>
                    <span style={styles.actionTitle}>Visibilité dans le Dashboard</span>
                    <span style={styles.actionDesc}>Masquer ce groupe des listes de cibles si nécessaire.</span>
                  </div>
                  <button 
                    style={{ ...styles.btnAction, backgroundColor: selected.isVisible ? "#ea4335" : "#00a884" }} 
                    onClick={() => toggleVisibility(selected.groupId, selected.isVisible)}
                  >
                    {selected.isVisible ? "Masquer le groupe" : "Rendre visible"}
                  </button>
                </div>

                  <div style={styles.actionRow(isMobile)}>
                  <div style={styles.actionInfo}>
                    <span style={styles.actionTitle}>
                      Restriction "Texte uniquement" <span style={styles.betaLabel}>Sécurisé</span>
                    </span>
                    <span style={styles.actionDesc}>Interdire aux membres (non-admins) d'envoyer des photos, vidéos, audio/voix, documents, liens et sondages.</span>
                  </div>
                  <button 
                    style={{ ...styles.btnAction, backgroundColor: selected.isRestricted ? "#ea4335" : "#00a884" }} 
                    onClick={() => toggleRestrict(selected.groupId, selected.isRestricted)}
                  >
                    {selected.isRestricted ? "Désactiver la restriction" : "Activer la restriction"}
                  </button>
                </div>
              </div>

              <div style={styles.memberSection}>
                <h4 style={styles.sectionHeading}>Membres du groupe ({members.length})</h4>
                {loadingMembers ? (
                  <div style={styles.loader}><span style={styles.spinner} /> Chargement des membres...</div>
                ) : (
                  <div style={styles.memberList}>
                    {members.map((m) => (
                      <div key={m.jid} style={styles.memberItem}>
                        <div style={styles.memberAvatarSmall}>{m.name?.charAt(0)?.toUpperCase() || "?"}</div>
                        <div style={styles.memberInfo}>
                          <div style={styles.memberName}>{m.name || m.pushName || "Inconnu"}</div>
                          <div style={styles.memberJid}>{m.jid?.split("@")[0]}</div>
                        </div>
                        {m.isAdmin && <span style={styles.adminBadge}>Admin</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.emptyDetail}>
              <i className="bi bi-chat-left-dots" style={{ fontSize: 48, color: "#cfd8dc", marginBottom: 12 }}></i>
              <p>Sélectionnez un groupe dans la liste pour afficher ses détails et configurer les restrictions.</p>
            </div>
          )}
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
    gap: 16
  },
  headerRow: {
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  pageTitle: { fontSize: 24, fontWeight: 700, color: "#111b21", margin: 0 },
  pageSubtitle: { fontSize: 13, color: "#667781" },
  toolbar: { marginBottom: 4 },
  searchContainer: {
    position: "relative",
    display: "flex",
    alignItems: "center"
  },
  searchIcon: {
    position: "absolute",
    left: 14,
    color: "#8696a0",
    fontSize: 14
  },
  search: { 
    width: "100%", 
    padding: "12px 16px 12px 42px", 
    border: "1px solid #e9edef", 
    borderRadius: 8, 
    fontSize: 14, 
    outline: "none",
    backgroundColor: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.03)"
  },
  split: (isMobile) => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1.3fr", gap: 20 }),
  listPanel: (isMobile) => ({ 
    backgroundColor: "#fff",
    borderRadius: 12,
    border: "1px solid #e9edef",
    display: "flex", 
    flexDirection: "column", 
    height: isMobile ? "auto" : "calc(100vh - 200px)",
    maxHeight: isMobile ? "300px" : "none",
    overflow: "hidden" 
  }),
  listHeader: {
    padding: "16px 20px",
    borderBottom: "1px solid #e9edef",
    fontWeight: 700,
    fontSize: 14,
    color: "#54656f",
    backgroundColor: "#f8f9fa"
  },
  listContent: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column"
  },
  card: { 
    padding: "16px 20px", 
    cursor: "pointer", 
    borderBottom: "1px solid #f0f2f5",
    transition: "all 0.15s ease",
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardName: { fontSize: 14, fontWeight: 600, color: "#111b21" },
  badgeContainer: { display: "flex", gap: 6, alignItems: "center" },
  badge: { fontSize: 11, padding: "3px 8px", borderRadius: 10, color: "#fff", fontWeight: 600 },
  restrictBadge: { 
    fontSize: 11, 
    padding: "3px 8px", 
    borderRadius: 10, 
    color: "#ea4335", 
    backgroundColor: "#fce8e6", 
    fontWeight: 600 
  },
  cardMeta: { display: "flex", gap: 14, fontSize: 12, color: "#667781", alignItems: "center" },
  botAdminBadge: {
    fontSize: 11,
    color: "#00a884",
    backgroundColor: "#e6f6f3",
    padding: "1px 6px",
    borderRadius: 4,
    fontWeight: 600,
    marginLeft: "auto"
  },
  detailPanel: (isMobile) => ({ 
    backgroundColor: "#fff", 
    borderRadius: 12, 
    border: "1px solid #e9edef",
    height: isMobile ? "auto" : "calc(100vh - 200px)", 
    maxHeight: isMobile ? "none" : "none",
    overflowY: "auto",
    boxShadow: "0 1px 3px rgba(11,20,26,0.05)"
  }),
  detailContainer: {
    padding: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    paddingBottom: 16,
    borderBottom: "1px solid #f0f2f5"
  },
  detailAvatar: { 
    width: 54, 
    height: 54, 
    borderRadius: "50%", 
    backgroundColor: "#00a884", 
    color: "#fff", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    fontSize: 22, 
    fontWeight: 700 
  },
  detailHeaderInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  detailTitle: { fontSize: 18, fontWeight: 700, color: "#111b21", margin: 0 },
  detailJid: { fontSize: 12, color: "#8696a0" },
  descBox: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    border: "1px solid #e9edef"
  },
  descLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#8696a0",
    textTransform: "uppercase",
    display: "block",
    marginBottom: 4
  },
  detailDesc: { fontSize: 13, color: "#54656f", margin: 0, fontStyle: "italic", lineHeight: 1.4 },
  infoGrid: (isMobile) => ({
    display: "grid",
    gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(3, 1fr)",
    gap: 12,
    textAlign: "center"
  }),
  infoItem: {
    backgroundColor: "#f8f9fa",
    border: "1px solid #e9edef",
    borderRadius: 8,
    padding: "10px 6px",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  infoVal: {
    fontSize: 18,
    fontWeight: 700,
    color: "#111b21"
  },
  infoLbl: {
    fontSize: 11,
    color: "#8696a0"
  },
  warningBox: {
    display: "flex",
    gap: 12,
    backgroundColor: "#fff3cd",
    border: "1px solid #ffeeba",
    padding: 14,
    borderRadius: 8
  },
  warningText: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 12,
    color: "#856404",
    lineHeight: 1.4
  },
  controlSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "16px 0",
    borderTop: "1px solid #f0f2f5",
    borderBottom: "1px solid #f0f2f5"
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: "#54656f",
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.2px"
  },
  actionRow: (isMobile) => ({
    display: "flex",
    justifyContent: "space-between",
    alignItems: isMobile ? "stretch" : "center",
    gap: 12,
    flexDirection: isMobile ? "column" : "row"
  }),
  actionInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "#111b21"
  },
  actionDesc: {
    fontSize: 11,
    color: "#8696a0",
    lineHeight: 1.3
  },
  betaLabel: {
    fontSize: 9,
    backgroundColor: "#e6f6f3",
    color: "#00a884",
    padding: "1px 4px",
    borderRadius: 4,
    fontWeight: 700,
    marginLeft: 4
  },
  btnAction: { 
    padding: "8px 16px", 
    color: "#fff", 
    border: "none", 
    borderRadius: 8, 
    fontSize: 12, 
    fontWeight: 600, 
    cursor: "pointer",
    transition: "background 0.2s",
    minWidth: 150,
    textAlign: "center"
  },
  memberSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  memberList: { display: "flex", flexDirection: "column", gap: 8 },
  memberItem: { display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f2f5" },
  memberAvatarSmall: { 
    width: 30, 
    height: 30, 
    borderRadius: "50%", 
    backgroundColor: "#f0f2f5", 
    color: "#54656f", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    fontSize: 12, 
    fontWeight: 600, 
    flexShrink: 0 
  },
  memberInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 1
  },
  memberName: { fontSize: 13, fontWeight: 600, color: "#111b21" },
  memberJid: { fontSize: 11, color: "#8696a0" },
  adminBadge: { 
    fontSize: 10, 
    backgroundColor: "#e6f6f3", 
    color: "#00a884", 
    padding: "2px 8px", 
    borderRadius: 6, 
    fontWeight: 600,
    marginLeft: "auto" 
  },
  empty: { textAlign: "center", color: "#8696a0", padding: 40, fontSize: 14 },
  emptyDetail: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    padding: 40,
    color: "#8696a0",
    textAlign: "center",
    fontSize: 13,
    lineHeight: 1.5
  },
  pagination: { 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 12, 
    padding: "12px 0",
    borderTop: "1px solid #e9edef",
    backgroundColor: "#f8f9fa"
  },
  pageBtn: { 
    padding: "6px 12px", 
    backgroundColor: "#00a884", 
    color: "#fff", 
    border: "none", 
    borderRadius: 6, 
    fontSize: 12, 
    cursor: "pointer",
    fontWeight: 600
  },
  pageInfo: { fontSize: 12, color: "#667781", fontWeight: 600 },
  loader: {
    textAlign: "center",
    color: "#8696a0",
    padding: 20,
    fontSize: 13
  },
  spinner: {
    display: "inline-block",
    width: 12,
    height: 12,
    border: "2px solid rgba(0,0,0,0.1)",
    borderTopColor: "#00a884",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
    marginRight: 6,
    verticalAlign: "middle",
  },
};

export default Groups;
