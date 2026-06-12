import React, { useState, useEffect } from "react";
import api from "../services/api";
import { formatDate } from "../utils/helpers";
import { useMediaQuery } from "../hooks/useMediaQuery";

const Logs = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);

  useEffect(() => {
    const params = { limit: 50, page };
    if (filter) params.type = filter;
    api.get("/logs", { params }).then(({ data }) => {
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    }).catch(() => {});
  }, [filter, page]);

  const typeColors = { info: "#667781", warn: "#ffc107", error: "#ef5350", moderation: "#075e54", broadcast: "#25d366", message: "#128c7e", system: "#8696a0" };

  return (
    <div>
      <h2 style={styles.pageTitle}>Logs</h2>
      <div style={styles.toolbar(isMobile)}>
        <select style={styles.select} value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          <option value="">Tous les types</option>
          <option value="info">Info</option>
          <option value="warn">Warning</option>
          <option value="error">Error</option>
          <option value="moderation">Moderation</option>
          <option value="broadcast">Broadcast</option>
          <option value="message">Message</option>
          <option value="system">System</option>
        </select>
        <span style={styles.count}><i className="bi bi-journal-text" style={{ marginRight: 6 }}></i>{total} entrées</span>
      </div>
      <div style={styles.list}>
        {logs.map((log) => (
          <div key={log._id} style={styles.item(isMobile)}>
            <span style={{ ...styles.type, color: typeColors[log.type] || "#667781" }}>{log.type}</span>
            <span style={styles.action}>{log.action}</span>
            <span style={styles.details}>{log.details ? JSON.stringify(log.details) : ""}</span>
            <span style={styles.date}>{formatDate(log.createdAt)}</span>
          </div>
        ))}
        {logs.length === 0 && <p style={styles.empty}>Aucun log</p>}
      </div>
      {pages > 1 && (
        <div style={styles.pagination(isMobile)}>
          <button style={styles.pageBtn} disabled={page <= 1} onClick={() => setPage(page - 1)}><i className="bi bi-chevron-left" style={{ marginRight: 4 }}></i>Précédent</button>
          <span style={styles.pageInfo}>Page {page} / {pages}</span>
          <button style={styles.pageBtn} disabled={page >= pages} onClick={() => setPage(page + 1)}>Suivant<i className="bi bi-chevron-right" style={{ marginLeft: 4 }}></i></button>
        </div>
      )}
    </div>
  );
};

const styles = {
  pageTitle: { fontSize: 22, fontWeight: 700, color: "#111b21", marginBottom: 16 },
  toolbar: (isMobile) => ({ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }),
  select: { padding: "8px 14px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none", backgroundColor: "#fff" },
  count: { fontSize: 13, color: "#667781" },
  list: { backgroundColor: "#fff", borderRadius: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  item: (isMobile) => ({ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid #f0f2f5", fontSize: 13, flexWrap: "wrap" }),
  type: { fontWeight: 600, fontSize: 11, textTransform: "uppercase", minWidth: 70 },
  action: { color: "#111b21", fontWeight: 500, minWidth: 120 },
  details: { color: "#667781", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  date: { color: "#8696a0", fontSize: 12, whiteSpace: "nowrap" },
  empty: { textAlign: "center", color: "#8696a0", padding: 40, fontSize: 14 },
  pagination: (isMobile) => ({ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 16, flexWrap: "wrap" }),
  pageBtn: { padding: "8px 16px", backgroundColor: "#075e54", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center" },
  pageInfo: { fontSize: 13, color: "#667781" },
};

export default Logs;
