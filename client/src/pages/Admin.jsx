// Admin Moderation Dashboard: review reported posts, remove/restore posts, suspend/unsuspend users.
import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Eye, EyeOff, UserX, UserCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useToast } from '../lib/context.jsx';
import { ErrorState, Spinner } from '../components/Feedback.jsx';
import Avatar from '../components/Avatar.jsx';
import { timeAgo } from '../lib/format';

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [suspendUsername, setSuspendUsername] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadReports = () => {
    setLoading(true);
    api('/admin/reports')
      .then((d) => setReports(d.reports || d.posts || d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.isAdmin) {
      loadReports();
    }
  }, [user]);

  if (!user?.isAdmin) {
    return (
      <div className="center-pad fade-up">
        <h1 className="page-title">Access Denied</h1>
        <p className="muted">You must be an administrator to access this page.</p>
      </div>
    );
  }

  const handleRemove = async (postId) => {
    try {
      await api(`/admin/posts/${postId}/remove`, { method: 'POST' });
      setReports((prev) =>
        prev.map((r) => (r.id === postId ? { ...r, status: 'hidden' } : r))
      );
      toast.show('Post removed and set to hidden');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const handleRestore = async (postId) => {
    try {
      await api(`/admin/posts/${postId}/restore`, { method: 'POST' });
      setReports((prev) =>
        prev.map((r) => (r.id === postId ? { ...r, status: 'published' } : r))
      );
      toast.show('Post restored to published');
    } catch (err) {
      toast.show(err.message);
    }
  };

  const handleSuspend = async (e) => {
    e.preventDefault();
    const uname = suspendUsername.trim().toLowerCase();
    if (!uname) return;
    setActionLoading(true);
    try {
      await api(`/admin/users/${uname}/suspend`, { method: 'POST' });
      toast.show(`@${uname} has been suspended`);
      setSuspendUsername('');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnsuspend = async () => {
    const uname = suspendUsername.trim().toLowerCase();
    if (!uname) return;
    setActionLoading(true);
    try {
      await api(`/admin/users/${uname}/unsuspend`, { method: 'POST' });
      toast.show(`@${uname} has been unsuspended`);
      setSuspendUsername('');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="admin-page fade-up" style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 60 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={26} color="var(--accent)" /> Moderation Dashboard
        </h1>
        <button className="btn btn--sm" onClick={loadReports} disabled={loading}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* User Suspension Control */}
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ fontSize: 16, marginBottom: 12 }}>
          User Account Moderation
        </h2>
        <form onSubmit={handleSuspend} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Username to moderate"
            value={suspendUsername}
            onChange={(e) => setSuspendUsername(e.target.value)}
          />
          <button type="submit" className="btn btn--danger" disabled={actionLoading || !suspendUsername.trim()}>
            <UserX size={15} /> Suspend
          </button>
          <button type="button" className="btn" disabled={actionLoading || !suspendUsername.trim()} onClick={handleUnsuspend}>
            <UserCheck size={15} /> Unsuspend
          </button>
        </form>
      </section>

      {/* Reported Posts */}
      <section>
        <h2 className="section-title" style={{ fontSize: 18, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} color="var(--danger)" /> Reported Posts
        </h2>

        {error && <ErrorState message={error} />}

        {loading ? (
          <div className="center-pad"><Spinner /></div>
        ) : !reports || reports.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <CheckCircle2 size={40} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
            <h3 className="strong" style={{ marginBottom: 4 }}>No reported posts</h3>
            <p className="muted small">All community reports have been resolved.</p>
          </div>
        ) : (
          <div className="stack" style={{ gap: 16 }}>
            {reports.map((item) => {
              const isHidden = item.status === 'hidden';
              return (
                <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar user={item.author || { username: item.username, avatarHue: item.avatar_hue }} size={38} />
                      <div>
                        <span className="strong">@{item.author?.username || item.username}</span>
                        <span className="muted small" style={{ marginLeft: 8 }}>{timeAgo(item.createdAt || item.created_at)}</span>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: isHidden ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 124, 102, 0.15)',
                        color: isHidden ? 'var(--danger)' : 'var(--accent)',
                      }}
                    >
                      {isHidden ? 'Hidden' : 'Published'}
                    </span>
                  </div>

                  {item.caption && <p style={{ margin: 0, fontSize: 15 }}>{item.caption}</p>}

                  {item.thumbUrl && (
                    <div style={{ maxWidth: 200, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                      <img src={item.thumbUrl} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </div>
                  )}

                  <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span className="strong">Reports ({item.reportCount}):</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--muted)' }}>
                      {(item.reasons || []).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    {isHidden ? (
                      <button className="btn btn--sm btn--primary" onClick={() => handleRestore(item.id)}>
                        <Eye size={14} /> Restore Post
                      </button>
                    ) : (
                      <button className="btn btn--sm btn--danger" onClick={() => handleRemove(item.id)}>
                        <EyeOff size={14} /> Remove Post
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
