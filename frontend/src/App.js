import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import AuthLayout from "./layouts/AuthLayout";
import MainLayout from "./layouts/MainLayout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Groups from "./pages/Groups";
import Members from "./pages/Members";
import BroadcastCenter from "./pages/BroadcastCenter";
import Forwarding from "./pages/Forwarding";
import Logs from "./pages/Logs";
import Settings from "./pages/Settings";

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
      return <div style={styles.loading}>Une erreur est survenue. Rafraîchissez la page.</div>;
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
      <div style={styles.app}>
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
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </div>
    </ErrorBoundary>
  );
}

const styles = {
  app: { minHeight: "100vh", backgroundColor: "#f0f2f5" },
  loading: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 18, color: "#667781" },
};

export default App;
