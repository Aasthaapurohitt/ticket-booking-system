import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="empty-state">
        <h3>Access restricted</h3>
        <p>This page is only available to {roles.join(" or ")} accounts.</p>
      </div>
    );
  }
  return children;
}
