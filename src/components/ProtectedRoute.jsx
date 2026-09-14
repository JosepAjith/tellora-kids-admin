import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function ProtectedRoute() {
  const { user, isAdmin, loading, error, logout } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-shell">
        <div className="loading-card">Loading your workspace…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!isAdmin) {
    return (
      <div className="loading-shell">
        <div className="loading-card unauthorized-card">
          <h2>Admin access required</h2>
          <p className="form-error">{error || 'This account is not an active administrator.'}</p>
          <button className="secondary-btn" type="button" onClick={() => logout()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
