// Route map. Signed-out users see only the sign-in screen; everything else lives inside the app shell.
import { Navigate, Route, Routes, Link } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import Auth from './pages/Auth.jsx';
import Home from './pages/Home.jsx';
import Reels from './pages/Reels.jsx';
import Explore from './pages/Explore.jsx';
import Create from './pages/Create.jsx';
import Profile from './pages/Profile.jsx';
import PostPage from './pages/PostPage.jsx';
import Messages from './pages/Messages.jsx';
import Notifications from './pages/Notifications.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import { useAuth } from './lib/context.jsx';

export default function App() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <div className="boot" role="status" aria-label="Loading AURA"><span className="brand brand--lg">AURA</span></div>;
  }

  return (
    <Routes>
      <Route path="/login" element={status === 'in' ? <Navigate to="/" replace /> : <Auth />} />
      <Route element={status === 'in' ? <Shell /> : <Navigate to="/login" replace />}>
        <Route index element={<Home />} />
        <Route path="explore" element={<Explore />} />
        <Route path="reels" element={<Reels />} />
        <Route path="create" element={<Create />} />
        <Route path="u/:username" element={<Profile />} />
        <Route path="p/:id" element={<PostPage />} />
        <Route path="messages" element={<Messages />} />
        <Route path="messages/:id" element={<Messages />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={
          <div className="center-pad fade-up">
            <h1 className="page-title">Page not found</h1>
            <p className="muted">That page doesn’t exist or has moved.</p>
            <Link className="btn btn--primary" to="/">Go home</Link>
          </div>
        } />
      </Route>
    </Routes>
  );
}
