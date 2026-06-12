import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { useSidebar } from "../context/SidebarContext";
import { useMediaQuery } from "../hooks/useMediaQuery";

const MainLayout = () => {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { sidebarOpen, setSidebarOpen } = useSidebar();

  return (
    <div style={styles.layout}>
      {isMobile && sidebarOpen && (
        <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}
      {isMobile ? (
        <div style={{
          ...styles.sidebarBase,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
          position: "fixed",
        }}>
          <Sidebar />
        </div>
      ) : (
        <div style={styles.sidebarDesktop}>
          <Sidebar />
        </div>
      )}
      <div style={styles.main}>
        <Header />
        <div style={styles.content(isMobile)}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const styles = {
  layout: { display: "flex", height: "100vh", position: "relative" },
  overlay: {
    position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 999, transition: "opacity 0.3s ease",
  },
  sidebarBase: {
    left: 0, top: 0, bottom: 0, zIndex: 1000,
    transition: "transform 0.3s ease",
  },
  sidebarDesktop: { flexShrink: 0 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 },
  content: (isMobile) => ({ flex: 1, overflow: "auto", padding: isMobile ? 12 : 24, backgroundColor: "#f0f2f5" }),
};

export default MainLayout;
