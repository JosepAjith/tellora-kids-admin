import { SidebarNav } from '../components/SidebarNav';

export function CategoriesPage() {
  return (
    <div className="app-shell">
      <SidebarNav />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">Content</p>
            <h1>Categories</h1>
          </div>
        </header>

        <section className="panel-card">
          <div className="panel-header">
            <h3>Category manager</h3>
            <button className="secondary-btn" type="button">New category</button>
          </div>
          <p className="muted-text">Category management will be added after the authentication shell is complete.</p>
        </section>
      </main>
    </div>
  );
}
