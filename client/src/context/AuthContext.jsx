import { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "../api/index.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("tb_token");
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => localStorage.removeItem("tb_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { token, user } = await authApi.login({ email, password });
    localStorage.setItem("tb_token", token);
    setUser(user);
    return user;
  }

  async function register(payload) {
    const { token, user } = await authApi.register(payload);
    localStorage.setItem("tb_token", token);
    setUser(user);
    return user;
  }

  function logout() {
    localStorage.removeItem("tb_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
