import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const links = [
  { to: "/", label: "Dashboard", icon: "bi bi-grid-1x2-fill" },
  { to: "/groups", label: "Groupes", icon: "bi bi-people-fill" },
  { to: "/members", label: "Membres", icon: "bi bi-person-circle" },
  { to: "/broadcast", label: "Broadcast", icon: "bi bi-send-fill" },
  { to: "/forwarding", label: "Diffusion", icon: "bi bi-arrow-left-right" },
  { to: "/logs", label: "Logs", icon: "bi bi-terminal-fill" },
  { to: "/settings", label: "Paramètres", icon: "bi bi-gear-wide-connected" },
];

const Sidebar = () => {
  const { user, logout } = useAuth();

  return (
    <div style={styles.sidebar}>
      <div style={styles.brand}>
        <span style={styles.brandIcon}><i className="bi bi-whatsapp"></i></span>
        <span style={styles.brandText}>WhatsApp Bot <span style={styles.brandBadge}>PRO</span></span>
      </div>
      <nav style={styles.nav}>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            style={({ isActive }) => ({
              ...styles.link,
              backgroundColor: isActive ? "#2a3942" : "transparent",
              color: isActive ? "#00a884" : "#aebac1",
              borderLeft: isActive ? "4px solid #00a884" : "4px solid transparent",
              paddingLeft: isActive ? 16 : 20,
            })}
          >
            <span style={styles.linkIcon}><i className={link.icon}></i></span>
            <span style={styles.linkLabel}>{link.label}</span>
          </NavLink>
        ))}
      </nav>
      <div style={styles.footer}>
        <div style={styles.userInfo}>
          <div style={styles.userAvatar}>{user?.name?.charAt(0)?.toUpperCase() || "?"}</div>
          <div style={styles.userDetail}>
            <div style={styles.userName}>{user?.name || "Utilisateur"}</div>
            <div style={styles.userRole}>Administrateur</div>
          </div>
        </div>
        <button onClick={logout} style={styles.logoutBtn}>
          <i className="bi bi-box-arrow-right" style={{ marginRight: 8 }}></i>Déconnexion
        </button>
      </div>
    </div>
  );
};

const styles = {
  sidebar: { 
    width: 260, 
    backgroundColor: "#111b21", 
    display: "flex", 
    flexDirection: "column", 
    height: "100vh",
    borderRight: "1px solid #222e35",
    boxShadow: "4px 0 15px rgba(0,0,0,0.1)",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },
  brand: { 
    padding: "24px 20px", 
    display: "flex", 
    alignItems: "center", 
    gap: 12, 
    borderBottom: "1px solid #222e35" 
  },
  brandIcon: { 
    fontSize: 28, 
    color: "#00a884",
    display: "flex",
    alignItems: "center"
  },
  brandText: { 
    fontSize: 16, 
    fontWeight: 700, 
    color: "#e9edef",
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  brandBadge: {
    fontSize: 9,
    backgroundColor: "#00a884",
    color: "#111b21",
    padding: "1px 5px",
    borderRadius: 4,
    fontWeight: 800
  },
  nav: { 
    flex: 1, 
    padding: "16px 0",
    display: "flex",
    flexDirection: "column",
    gap: 4
  },
  link: { 
    display: "flex", 
    alignItems: "center", 
    gap: 14, 
    padding: "14px 20px", 
    textDecoration: "none", 
    fontSize: 14, 
    fontWeight: 500, 
    transition: "all 0.2s ease-in-out",
    cursor: "pointer"
  },
  linkIcon: { 
    fontSize: 18, 
    width: 24, 
    textAlign: "center",
    display: "flex",
    justifyContent: "center"
  },
  linkLabel: {
    letterSpacing: "0.2px"
  },
  footer: { 
    padding: "20px 16px", 
    borderTop: "1px solid #222e35",
    backgroundColor: "#202c33"
  },
  userInfo: { 
    display: "flex", 
    alignItems: "center", 
    gap: 12, 
    marginBottom: 16 
  },
  userAvatar: { 
    width: 38, 
    height: 38, 
    borderRadius: "50%", 
    backgroundColor: "#00a884", 
    color: "#111b21", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center", 
    fontSize: 16, 
    fontWeight: 700 
  },
  userDetail: {
    display: "flex",
    flexDirection: "column"
  },
  userName: { 
    color: "#e9edef", 
    fontSize: 13,
    fontWeight: 600
  },
  userRole: {
    color: "#8696a0",
    fontSize: 11
  },
  logoutBtn: { 
    width: "100%", 
    padding: "10px 0", 
    backgroundColor: "transparent", 
    color: "#f15c6d", 
    border: "1px solid #f15c6d", 
    borderRadius: 8, 
    cursor: "pointer", 
    fontSize: 13, 
    fontWeight: 600,
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
};

export default Sidebar;
