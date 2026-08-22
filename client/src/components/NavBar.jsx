import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          MARQUEE
        </Link>
        <div className="nav-links">
          <Link className="nav-link" to="/">
            Browse
          </Link>
          {user && (
            <Link className="nav-link" to="/bookings">
              My bookings
            </Link>
          )}
          {(user?.role === "organiser" || user?.role === "admin") && (
            <Link className="nav-link" to="/organiser">
              Organiser
            </Link>
          )}
          {user?.role === "admin" && (
            <Link className="nav-link" to="/admin/venues">
              Venues
            </Link>
          )}
          {user ? (
            <>
              <span className="nav-role-badge">{user.role}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/register">
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
