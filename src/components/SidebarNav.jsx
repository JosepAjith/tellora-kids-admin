import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/stories', label: 'Stories' },
  { to: '/categories', label: 'Categories' },
  { to: '/settings', label: 'Settings' },
];

export function SidebarNav() {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <div className="brand-mark">TK</div>
        <div>
          <p className="brand-title">Tellora Kids</p>
          <p className="brand-subtitle">Admin panel</p>
        </div>
      </div>

      <nav className="nav-links" aria-label="Sidebar navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
