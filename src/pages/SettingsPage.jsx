import { SidebarNav } from '../components/SidebarNav';
import { useAuth } from '../hooks/useAuth';

export function SettingsPage() {
  const { logout } = useAuth();

  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Settings</h1>
          </div>
        </header>

        <section className="panel-card">
          <div className="panel-header">
            <h3>Account</h3>
            <button className="secondary-btn" type="button" onClick={() => logout()}>
              Logout
            </button>
          </div>
          <p className="muted-text">Supabase auth is managed through the shared admin session context.</p>
        </section>
      </main>
    </div>
  );
}
