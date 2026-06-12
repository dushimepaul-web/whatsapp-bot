import React from "react";
import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMediaQuery } from "../hooks/useMediaQuery";

const AuthLayout = () => {
  const { user, loading } = useAuth();
  const isMobile = useMediaQuery("(max-width: 768px)");
  if (loading) return null;
  if (user) return <Navigate to="/" />;
  return (
    <div style={styles.container}>
      <div style={{ ...styles.card, padding: isMobile ? 24 : 40 }}>
        <div style={styles.header}>
          <div style={styles.logo}><i className="bi bi-chat-dots-fill"></i></div>
          <h1 style={styles.title}>WhatsApp Bot</h1>
          <p style={styles.subtitle}>Plateforme de gestion</p>
        </div>
        <Outlet />
      </div>
    </div>
  );
};

const styles = {
  container: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#075e54", padding: 16 },
  card: { backgroundColor: "#fff", borderRadius: 12, width: 420, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
  header: { textAlign: "center", marginBottom: 30 },
  logo: { fontSize: 48, color: "#075e54", marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 700, color: "#075e54", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#667781" },
};

export default AuthLayout;
