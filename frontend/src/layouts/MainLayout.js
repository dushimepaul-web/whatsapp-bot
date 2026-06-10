import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

const MainLayout = () => {
  return (
    <div style={styles.layout}>
      <Sidebar />
      <div style={styles.main}>
        <Header />
        <div style={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
};

const styles = {
  layout: { display: "flex", height: "100vh" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  content: { flex: 1, overflow: "auto", padding: 24, backgroundColor: "#f0f2f5" },
};

export default MainLayout;
