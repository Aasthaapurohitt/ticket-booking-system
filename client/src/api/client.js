import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("tb_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalizes error responses so components can just read err.message
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || "Something went wrong";
    return Promise.reject(new Error(message));
  }
);

export default client;
