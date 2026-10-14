// Settings: appearance, profile, wellbeing, privacy and data export, and sign out.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, Download, LogOut } from 'lucide-react';
import { api, getToken } from '../lib/api';
import { useAuth, useTheme, useToast } from '../lib/context.jsx';

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
  const [form, setForm] = useState({ displayName: '', bio: '', isPrivate: false });
  const [saving, setSaving] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState(localStorage.getItem('aura-break-minutes') || '0');

  useEffect(() => {
    if (user) setForm({ displayName: user.displayName, bio: user.bio || '', isPrivate: user.isPrivate });
  }, [user]);

  const save = async (e) => {
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

  return (
    <div className="settings fade-up">
      <h1 className="page-title">Settings</h1>

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

      <section className="card settings__section" aria-labelledby="s-profile">
        <h2 id="s-profile" className="section-title">Edit profile</h2>
        <form className="stack" onSubmit={save}>
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
          <div><button className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </section>

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

      <section className="card settings__section" aria-labelledby="s-data">
        <h2 id="s-data" className="section-title">Your data</h2>
        <p className="muted">Download everything AURA holds about you: profile, posts, comments, likes, follows, and messages you sent.</p>
        <button className="btn" onClick={exportData}><Download size={16} /> Export my data</button>
      </section>

      <section className="card settings__section" aria-labelledby="s-account">
        <h2 id="s-account" className="section-title">Account</h2>
        <button className="btn btn--danger" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
          <LogOut size={16} /> Sign out
        </button>
      </section>
    </div>
  );
}
