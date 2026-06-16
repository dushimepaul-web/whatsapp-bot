import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { SidebarProvider } from "./context/SidebarContext";
import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Groups = lazy(() => import("./pages/Groups"));
const Members = lazy(() => import("./pages/Members"));
const BroadcastCenter = lazy(() => import("./pages/BroadcastCenter"));
const Forwarding = lazy(() => import("./pages/Forwarding"));
const Logs = lazy(() => import("./pages/Logs"));
const Settings = lazy(() => import("./pages/Settings"));
const Console = lazy(() => import("./pages/Console"));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div style={styles.loading}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div>Une erreur est survenue. Rafraîchissez la page.</div>
          <button onClick={() => { this.setState({ hasError: false }); window.location.href = "/"; }}
            style={{ marginTop: 16, padding: "10px 24px", background: "#075e54", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            Retour à l'accueil
          </button>
        </div>
      </div>;
    }
    return this.props.children;
  }
}

const PrivateRoute = ({ children }) => {
  const auth = useAuth();
  if (!auth) return <div style={styles.loading}>Chargement...</div>;
  const { user, loading } = auth;
  if (loading) return <div style={styles.loading}>Chargement...</div>;
  return user ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ErrorBoundary>
      <SidebarProvider>
      <div style={styles.app}>
        <Suspense fallback={<div style={styles.loading}>Chargement...</div>}>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Route>
          <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/members" element={<Members />} />
            <Route path="/broadcast" element={<BroadcastCenter />} />
            <Route path="/forwarding" element={<Forwarding />} />
            <Route path="/logs" element={<Logs />} />
            <Route path="/console" element={<Console />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
        </Suspense>
      </div>
      </SidebarProvider>
    </ErrorBoundary>
  );
}

const styles = {
  app: { minHeight: "100vh", backgroundColor: "#f0f2f5" },
  loading: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18, color: "#667781" },
};

export default App;
