// App chrome. Desktop (≥ 900px): left sidebar. Mobile: top bar + bottom navigation.
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, PlusSquare, Clapperboard, MessageCircle, Bell, User, Settings, Search } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { useAuth } from '../lib/context.jsx';
import { api } from '../lib/api';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/reels', label: 'Reels', icon: Clapperboard },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: true },
  { to: '/create', label: 'Create', icon: PlusSquare },
];

export default function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const immersive = location.pathname === '/reels';

  // Poll the unread-notifications count for the badge. Swap for a WebSocket push later.
  useEffect(() => {
    let alive = true;
    const load = () => api('/notifications').then((d) => alive && setUnread(d.unread)).catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => { alive = false; clearInterval(id); };
  }, [location.pathname]);

  return (
    <div className={`shell${immersive ? ' shell--immersive' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand" aria-label="AURA home">AURA</NavLink>
        <nav className="sidebar__nav">
          {NAV.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <span className="nav-link__icon"><Icon size={22} />{badge && unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread > 9 ? '9+' : unread}</span>}</span>
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to={user ? `/u/${user.username}` : '/'} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-link__icon"><User size={22} /></span>
            <span>Profile</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-link__icon"><Settings size={22} /></span>
            <span>Settings</span>
          </NavLink>
        </nav>
        {user && (
          <NavLink to={`/u/${user.username}`} className="sidebar__me">
            <Avatar user={user} size={36} />
            <span className="sidebar__names">
              <span className="strong">{user.displayName}</span>
              <span className="muted small">@{user.username}</span>
            </span>
          </NavLink>
        )}
      </aside>

      <header className="topbar" aria-label="Top bar">
        <NavLink to="/" className="brand brand--sm" aria-label="AURA home">AURA</NavLink>
        <div className="topbar__actions">
          <NavLink to="/explore" className="icon-btn" aria-label="Search"><Search size={22} /></NavLink>
          <NavLink to="/notifications" className="icon-btn" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
            <Bell size={22} />
            {unread > 0 && <span className="dot" aria-hidden="true" />}
          </NavLink>
          <NavLink to="/messages" className="icon-btn" aria-label="Messages"><MessageCircle size={22} /></NavLink>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <nav className="bottomnav" aria-label="Primary">
        <NavLink to="/" end className="bottomnav__item" aria-label="Home"><Home size={24} /></NavLink>
        <NavLink to="/explore" className="bottomnav__item" aria-label="Explore"><Compass size={24} /></NavLink>
        <NavLink to="/create" className="bottomnav__item bottomnav__item--create" aria-label="Create"><PlusSquare size={28} /></NavLink>
        <NavLink to="/reels" className="bottomnav__item" aria-label="Reels"><Clapperboard size={24} /></NavLink>
        <NavLink to={user ? `/u/${user.username}` : '/'} className="bottomnav__item" aria-label="Profile">
          {user ? <Avatar user={user} size={26} /> : <User size={24} />}
        </NavLink>
      </nav>

      <BreakReminder />
    </div>
  );
}

// Wellbeing: an optional gentle reminder after a set time in the app (Settings → Wellbeing).
function BreakReminder() {
  const [show, setShow] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const minutes = Number(localStorage.getItem('aura-break-minutes') || 0);
    if (!minutes) return;
    const id = setTimeout(() => setShow(true), minutes * 60_000);
    return () => clearTimeout(id);
  }, []);
  if (!show) return null;
  return (
    <div className="break-banner fade-up" role="status">
      <span>You’ve been here a while. Want a short break?</span>
      <div className="row">
        <button className="btn btn--sm" onClick={() => setShow(false)}>Keep going</button>
        <button className="btn btn--sm btn--primary" onClick={() => { setShow(false); navigate('/settings'); }}>Settings</button>
      </div>
    </div>
  );
}
