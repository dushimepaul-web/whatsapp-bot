import React, { createContext, useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../hooks/useAuth";

export const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const { user } = useAuth();
  const tokenRef = useRef(null);
  const socketRef = useRef(null);

  const getToken = () => localStorage.getItem("token");

  const connectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    const token = getToken();
    if (!token) {
      setSocket(null);
      setConnected(false);
      return;
    }

    tokenRef.current = token;

    const s = io("/", {
      auth: { token },
      path: "/api/socket.io",
      transports: ["polling", "websocket"],
    });

    s.on("connect", () => { console.log("[Socket] Connecté"); setConnected(true); });
    s.on("disconnect", (reason) => { console.log("[Socket] Déconnecté:", reason); setConnected(false); });
    s.on("connect_error", (err) => { console.log("[Socket] Erreur:", err.message); setConnected(false); });

    socketRef.current = s;
    setSocket(s);
  };

  useEffect(() => {
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    connectSocket();

    const handleStorage = (e) => {
      if (e.key === "token" && e.newValue !== e.oldValue) {
        connectSocket();
      }
    };
    window.addEventListener("storage", handleStorage);

    const interval = setInterval(() => {
      const current = getToken();
      if (current && current !== tokenRef.current) {
        connectSocket();
      }
    }, 10000);

    return () => {
      window.removeEventListener("storage", handleStorage);
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
