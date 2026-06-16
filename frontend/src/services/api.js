import axios from "axios";

const STORAGE_KEY = "wa_tokens";

let _token = null;
let _refreshToken = null;

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ t: _token, rt: _refreshToken })); } catch {}
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { t, rt } = JSON.parse(raw);
      if (t) setToken(t);
      _refreshToken = rt || null;
    }
  } catch {}
}

export const setToken = (token) => {
  _token = token;
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
  persist();
};

export const getToken = () => _token;

export const setRefreshToken = (rt) => {
  _refreshToken = rt;
  persist();
};
export const getRefreshToken = () => _refreshToken;

export const clearToken = () => {
  setToken(null);
  _refreshToken = null;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

restore();

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && err.response?.data?.code === "TOKEN_EXPIRED" && !original._retry) {
      original._retry = true;
      try {
        const headers = { "Content-Type": "application/json" };
        if (_refreshToken) headers["x-refresh-token"] = _refreshToken;
        const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {}, { headers, withCredentials: true });
        setToken(data.token);
        original.headers["Authorization"] = `Bearer ${data.token}`;
        return api(original);
      } catch {
        clearToken();
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
