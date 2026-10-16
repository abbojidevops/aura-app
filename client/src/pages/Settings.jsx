// Settings: appearance, profile, wellbeing, security, privacy, data export, and account deletion.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, Download, LogOut, KeyRound, Shield, Trash2, AlertTriangle } from 'lucide-react';
import { api, getToken } from '../lib/api';
import { useAuth, useTheme, useToast } from '../lib/context.jsx';
import Sheet from '../components/Sheet.jsx';
import Avatar from '../components/Avatar.jsx';

const THEMES = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

export default function Settings() {
  const { user, refresh, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();

  // Profile form state
  const [form, setForm] = useState({ displayName: '', bio: '', isPrivate: false, avatarHue: 260 });
  const [saving, setSaving] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(localStorage.getItem('aura-break-minutes') || '0');

  // Password form state
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPwd, setSavingPwd] = useState(false);

  // Sessions state
  const [sessionCount, setSessionCount] = useState(1);
  const [revoking, setRevoking] = useState(false);

  // Delete account modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        displayName: user.displayName,
        bio: user.bio || '',
        isPrivate: user.isPrivate,
        avatarHue: user.avatarHue ?? 260,
      });
    }
    api('/me/sessions')
      .then((d) => setSessionCount(d.count || 1))
      .catch(() => {});
  }, [user]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/me', { method: 'PATCH', body: form });
      await refresh();
      toast.show('Profile updated');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwdForm.newPassword !== pwdForm.confirmPassword) {
      return toast.show('New passwords do not match.');
    }
    if (pwdForm.newPassword.length < 8) {
      return toast.show('Password must be at least 8 characters.');
    }
    setSavingPwd(true);
    try {
      await api('/me/password', {
        method: 'POST',
        body: { currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword },
      });
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.show('Password updated successfully');
    } catch (err) {
      toast.show(err.message);
    } finally {
      setSavingPwd(false);
    }
  };

  const revokeOtherSessions = async () => {
    setRevoking(true);
    try {
      const res = await api('/me/sessions/revoke-others', { method: 'POST' });
      setSessionCount(1);
      toast.show(`Signed out of ${res.revoked || 0} other session(s)`);
    } catch (err) {
      toast.show(err.message);
    } finally {
      setRevoking(false);
    }
  };

  const exportData = async () => {
    const res = await fetch('/api/me/export', { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return toast.show('Export failed. Please try again.');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = 'aura-export.json';
    a.click();
    URL.revokeObjectURL(url);
    toast.show('Your data export is downloading');
  };

  const updateBreak = (value) => {
    setBreakMinutes(value);
    localStorage.setItem('aura-break-minutes', value);
    toast.show(Number(value) ? `Break reminder set for ${value} minutes` : 'Break reminders off');
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (!deletePassword) return toast.show('Enter your password to confirm.');
    setDeleting(true);
    try {
      await api('/me', { method: 'DELETE', body: { password: deletePassword } });
      toast.show('Your account has been deleted.');
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.show(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="settings fade-up">
      <h1 className="page-title">Settings</h1>

      {/* Appearance */}
      <section className="card settings__section" aria-labelledby="s-appearance">
        <h2 id="s-appearance" className="section-title">Appearance</h2>
        <div className="segmented segmented--wide" role="radiogroup" aria-label="Theme">
          {THEMES.map(({ id, label, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={theme === id} className={theme === id ? 'is-on' : ''} onClick={() => setTheme(id)}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* Profile */}
      <section className="card settings__section" aria-labelledby="s-profile">
        <h2 id="s-profile" className="section-title">Edit profile</h2>
        <form className="stack" onSubmit={saveProfile}>
          <label className="field">
            <span>Display name</span>
            <input className="input" value={form.displayName} maxLength={40} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
          </label>
          <label className="field">
            <span>Bio</span>
            <textarea className="input textarea" rows={3} maxLength={160} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            <small className="muted small">{form.bio.length}/160</small>
          </label>
          <label className="switch">
            <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} />
            <span>
              <span className="strong">Private account</span>
              <span className="muted small block">Only people who follow you can see your posts.</span>
            </span>
          </label>

          <div className="field">
            <span>Avatar gradient</span>
            <div className="row" style={{ alignItems: 'center', gap: 16, marginTop: 4 }}>
              <Avatar user={{ displayName: form.displayName || 'You', avatarHue: form.avatarHue }} size={56} />
              <div style={{ flex: 1 }}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="small muted">Color tone</span>
                  <span className="small strong">{form.avatarHue}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={form.avatarHue}
                  onChange={(e) => setForm({ ...form, avatarHue: Number(e.target.value) })}
                  style={{
                    width: '100%',
                    accentColor: `hsl(${form.avatarHue} 85% 55%)`,
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>
          </div>

          <div><button className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </section>

      {/* Security & Password */}
      <section className="card settings__section" aria-labelledby="s-security">
        <h2 id="s-security" className="section-title">Password & Security</h2>
        <form className="stack" onSubmit={changePassword}>
          <label className="field">
            <span>Current password</span>
            <input
              type="password"
              className="input"
              value={pwdForm.currentPassword}
              required
              onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
            />
          </label>
          <label className="field">
            <span>New password</span>
            <input
              type="password"
              className="input"
              value={pwdForm.newPassword}
              required
              minLength={8}
              onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
            />
            <small className="muted small">At least 8 characters</small>
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              type="password"
              className="input"
              value={pwdForm.confirmPassword}
              required
              minLength={8}
              onChange={(e) => setPwdForm({ ...pwdForm, confirmPassword: e.target.value })}
            />
          </label>
          <div>
            <button className="btn" disabled={savingPwd}>
              <KeyRound size={16} /> {savingPwd ? 'Updating…' : 'Change password'}
            </button>
          </div>
        </form>

        <div className="divider" />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span className="strong block">Active sessions</span>
            <span className="muted small">You are logged into {sessionCount} device{sessionCount === 1 ? '' : 's'}.</span>
          </div>
          {sessionCount > 1 && (
            <button className="btn btn--sm" disabled={revoking} onClick={revokeOtherSessions}>
              <Shield size={14} /> {revoking ? 'Signing out…' : 'Sign out other devices'}
            </button>
          )}
        </div>
      </section>

      {/* Wellbeing */}
      <section className="card settings__section" aria-labelledby="s-wellbeing">
        <h2 id="s-wellbeing" className="section-title">Wellbeing</h2>
        <label className="field">
          <span>Remind me to take a break after</span>
          <select className="input" value={breakMinutes} onChange={(e) => updateBreak(e.target.value)}>
            <option value="0">Never</option>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">90 minutes</option>
          </select>
        </label>
        <p className="muted small">The reminder appears once per visit. It’s a gentle nudge, not a lock.</p>
      </section>

      {/* Your Data */}
      <section className="card settings__section" aria-labelledby="s-data">
        <h2 id="s-data" className="section-title">Your data</h2>
        <p className="muted">Download everything AURA holds about you: profile, posts, comments, likes, follows, and messages you sent.</p>
        <button className="btn" onClick={exportData}><Download size={16} /> Export my data</button>
      </section>

      {/* Account & Danger Zone */}
      <section className="card settings__section" aria-labelledby="s-account">
        <h2 id="s-account" className="section-title">Account</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <button className="btn" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
          <div className="divider" />
          <div>
            <h3 className="strong text-danger" style={{ color: 'var(--danger)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={16} /> Danger zone
            </h3>
            <p className="muted small" style={{ marginBottom: 12 }}>
              Permanently delete your account and all associated posts, media, likes, comments, and messages.
            </p>
            <button className="btn btn--danger" onClick={() => setDeleteModalOpen(true)}>
              <Trash2 size={16} /> Delete my account
            </button>
          </div>
        </div>
      </section>

      {/* Delete Account Confirmation Sheet */}
      <Sheet open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} title="Delete Account">
        <form onSubmit={handleDeleteAccount} className="stack" style={{ gap: 14 }}>
          <p className="muted">
            This action cannot be undone. All of your photos, videos, posts, comments, likes, saves, and messages will be permanently deleted.
          </p>
          <label className="field">
            <span>Enter your password to confirm</span>
            <input
              type="password"
              className="input"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your current password"
              required
            />
          </label>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
            <button type="button" className="btn" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--danger btn--primary" style={{ background: 'var(--danger)' }} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Permanently Delete'}
            </button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
