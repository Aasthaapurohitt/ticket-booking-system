import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(form.email, form.password);
      navigate(location.state?.from || "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-shell">
      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Welcome back</h2>
        <p>Log in to hold seats and manage your bookings.</p>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="you@example.com"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: "0.85rem" }}>
          No account? <Link to="/register" style={{ color: "var(--amber)" }}>Sign up</Link>
        </p>
        <div className="hairline" />
        <p style={{ fontSize: "0.78rem" }}>
          Demo accounts (password: <code>password123</code>): admin@demo.com, organiser@demo.com, customer@demo.com
        </p>
      </div>
    </div>
  );
}
