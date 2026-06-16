import React, { useState, useEffect, useCallback } from "react";

const Toast = ({ message, type = "success", onClose, duration = 3000 }) => {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: type === "success"
        ? "linear-gradient(135deg, #25d366, #128c7e)"
        : "linear-gradient(135deg, #ef5350, #c62828)",
      color: "#fff", borderRadius: 10, padding: "14px 22px",
      fontSize: 13, fontWeight: 600,
      boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
      maxWidth: 380, display: "flex", alignItems: "center", gap: 8,
      animation: "slideUp 0.3s ease-out",
    }}>
      <span style={{ fontSize: 16 }}>
        {type === "success" ? "\u2713" : "\u2715"}
      </span>
      {message}
    </div>
  );
};

export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const ToastComponent = toast ? (
    <Toast message={toast.msg} type={toast.type} onClose={hideToast} />
  ) : null;

  return { showToast, Toast: ToastComponent };
}

export default Toast;
