import axios from "axios";

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:3001/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === "TOKEN_EXPIRED" && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) throw new Error("No refresh token");
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
        localStorage.setItem("token", data.token);
        localStorage.setItem("refreshToken", data.refreshToken);
        api.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
        original.headers["Authorization"] = `Bearer ${data.token}`;
        return api(original);
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
