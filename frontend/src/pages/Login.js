import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      if (mountedRef.current) navigate("/");
    } catch (err) {
      if (mountedRef.current) setError(err.response?.data?.error || "Erreur de connexion");
    }
    if (mountedRef.current) setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.title}>Connexion</h2>
      {error && <div style={styles.error}>{error}</div>}
      <input style={styles.input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input style={styles.input} type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button style={styles.btn} type="submit" disabled={loading}>{loading ? "Connexion..." : "Se connecter"}</button>
      <p style={styles.text}>Pas encore de compte ? <Link to="/register" style={styles.link}>S'inscrire</Link></p>
    </form>
  );
};

const styles = {
  form: { display: "flex", flexDirection: "column", gap: 16 },
  title: { fontSize: 18, fontWeight: 600, color: "#111b21", textAlign: "center" },
  error: { padding: 10, backgroundColor: "#fce4e4", color: "#c62828", borderRadius: 6, fontSize: 13, textAlign: "center" },
  input: { padding: "12px 16px", border: "1px solid #e0e0e0", borderRadius: 8, fontSize: 14, outline: "none" },
  btn: { padding: "12px", backgroundColor: "#075e54", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  text: { fontSize: 13, color: "#667781", textAlign: "center" },
  link: { color: "#075e54", fontWeight: 500 },
};

export default Login;
