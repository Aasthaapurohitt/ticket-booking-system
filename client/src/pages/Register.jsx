import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "customer" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-shell">
      <div className="card">
        <h2 style={{ marginBottom: 6 }}>Create your account</h2>
        <p>Book seats, or set up an organiser/admin account to manage events.</p>
        {error && (
          <div className="badge badge-danger" style={{ marginBottom: 12 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Full name</label>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Account type</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="customer">Customer — book tickets</option>
              <option value="organiser">Organiser — create &amp; manage events</option>
              <option value="admin">Admin — manage venues</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: "0.85rem" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--amber)" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
}
