import React, { createContext, useState, useEffect, useCallback } from "react";
import api, { setToken, setRefreshToken, clearToken, getRefreshToken } from "../services/api";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const headers = {};
      const rt = getRefreshToken();
      if (rt) headers["x-refresh-token"] = rt;
      const { data } = await api.post("/auth/refresh", {}, { headers });
      setToken(data.token);
      const me = await api.get("/auth/me");
      setUser(me.data.user);
    } catch {
      clearToken();
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    setToken(data.token);
    setRefreshToken(data.refreshToken);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
