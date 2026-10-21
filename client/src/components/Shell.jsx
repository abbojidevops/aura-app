// App chrome. Desktop (≥ 900px): left sidebar. Mobile: top bar + bottom navigation.
import { useEffect, useState, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, Compass, PlusSquare, Clapperboard, MessageCircle, Bell, User, Settings, Search, Shield, Bookmark } from 'lucide-react';
import Avatar from './Avatar.jsx';
import { ErrorBoundary } from './Feedback.jsx';
import { useAuth, useToast } from '../lib/context.jsx';
import { api } from '../lib/api';
import { subscribeRealtime } from '../lib/realtime';

export default function Shell() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const immersive = location.pathname === '/reels';
  const toast = useToast();

  const loadNotifs = useCallback(() => {
    api('/notifications')
      .then((d) => setUnreadNotifs(d.unread || 0))
      .catch(() => {});
  }, []);

  const loadMessages = useCallback(() => {
    api('/messages')
      .then((d) => {
        const sum = (d.conversations || []).reduce((acc, c) => acc + (c.unread || 0), 0);
        setUnreadMessages(sum);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifs();
    loadMessages();
    const id = setInterval(() => {
      loadNotifs();
      loadMessages();
    }, 20000);
    return () => clearInterval(id);
  }, [location.pathname, loadNotifs, loadMessages]);

  useEffect(() => {
    return subscribeRealtime((msg) => {
      if (msg.type === 'message') loadMessages();
      if (msg.type === 'notification') {
        loadNotifs();
        if (msg.notification && location.pathname !== '/notifications') {
          const act = msg.notification.actor;
          const t = msg.notification.type;
          const actionText =
            t === 'like' ? 'liked your post' :
            t === 'comment' ? 'commented on your post' :
            t === 'reply' ? 'replied to your comment' :
            t === 'follow' ? 'started following you' :
            t === 'follow_request' ? 'requested to follow you' :
            t === 'mention' ? 'mentioned you' : 'sent an update';
          toast.show(`${act?.displayName || 'Someone'} ${actionText}`);
        }
      }
    });
  }, [loadMessages, loadNotifs]);

  const navItems = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/explore', label: 'Explore', icon: Compass },
    { to: '/reels', label: 'Reels', icon: Clapperboard },
    { to: '/messages', label: 'Messages', icon: MessageCircle, count: unreadMessages },
    { to: '/notifications', label: 'Notifications', icon: Bell, count: unreadNotifs },
    { to: '/create', label: 'Create', icon: PlusSquare },
  ];

  return (
    <div className={`shell${immersive ? ' shell--immersive' : ''}`}>
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink to="/" className="brand" aria-label="AURA home">AURA</NavLink>
        <nav className="sidebar__nav">
          {navItems.map(({ to, label, icon: Icon, end, count }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <span className="nav-link__icon">
                <Icon size={22} />
                {count > 0 && <span className="badge" aria-label={`${count} unread`}>{count > 9 ? '9+' : count}</span>}
              </span>
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to={user ? `/u/${user.username}` : '/'} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-link__icon"><User size={22} /></span>
            <span>Profile</span>
          </NavLink>
          <NavLink to="/saved" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-link__icon"><Bookmark size={22} /></span>
            <span>Saved</span>
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-link__icon"><Settings size={22} /></span>
            <span>Settings</span>
          </NavLink>
          {user?.isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <span className="nav-link__icon"><Shield size={22} /></span>
              <span>Admin</span>
            </NavLink>
          )}
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
          <NavLink to="/notifications" className="icon-btn" aria-label={unreadNotifs ? `Notifications, ${unreadNotifs} unread` : 'Notifications'}>
            <Bell size={22} />
            {unreadNotifs > 0 && <span className="dot" aria-hidden="true" />}
          </NavLink>
          <NavLink to="/messages" className="icon-btn" aria-label={unreadMessages ? `Messages, ${unreadMessages} unread` : 'Messages'}>
            <MessageCircle size={22} />
            {unreadMessages > 0 && <span className="dot" aria-hidden="true" />}
          </NavLink>
        </div>
      </header>

      <main className="main" id="main">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
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
    const key = `aura-break-shown-${new Date().toISOString().slice(0, 10)}`;
    if (sessionStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      setShow(true);
      sessionStorage.setItem(key, '1');
    }, minutes * 60 * 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;
  return (
    <div className="break-banner fade-up" role="status">
      <div>
        <p className="strong">Time for a breath?</p>
        <p className="muted small">You’ve been here a while. Step away, stretch, or look at something far away.</p>
      </div>
      <div className="row">
        <button className="btn btn--sm" onClick={() => setShow(false)}>Dismiss</button>
        <button className="btn btn--sm btn--primary" onClick={() => { setShow(false); navigate('/settings'); }}>Adjust timer</button>
      </div>
    </div>
  );
}
