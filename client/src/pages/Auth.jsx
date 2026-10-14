// Sign in / create account. One screen, two modes, plus a one-click demo account.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/context.jsx';

export default function Auth() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ identifier: '', password: '', username: '', email: '', displayName: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e, credentials) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = credentials
        ? await api('/auth/login', { method: 'POST', body: credentials })
        : mode === 'login'
          ? await api('/auth/login', { method: 'POST', body: { identifier: form.identifier, password: form.password } })
          : await api('/auth/register', { method: 'POST', body: { username: form.username, email: form.email, password: form.password, displayName: form.displayName } });
      signIn(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth__hero" aria-hidden="true">
        <div className="auth__brand">AURA</div>
        <h1>Content you value.<br />Creators who get paid.<br />A feed you control.</h1>
        <p>Tune your feed with sliders, see why every post appears, and take your data with you anytime.</p>
      </section>

      <section className="auth__panel">
        <div className="card auth__card fade-up">
          <div className="segmented" role="tablist" aria-label="Account">
            <button role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
            <button role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
          </div>

          <form onSubmit={(e) => submit(e)} className="stack">
            {mode === 'login' ? (
              <>
                <label className="field">
                  <span>Username or email</span>
                  <input className="input" value={form.identifier} onChange={update('identifier')} autoComplete="username" required />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input className="input" type="password" value={form.password} onChange={update('password')} autoComplete="current-password" required />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>Display name</span>
                  <input className="input" value={form.displayName} onChange={update('displayName')} maxLength={40} />
                </label>
                <label className="field">
                  <span>Username</span>
                  <input className="input" value={form.username} onChange={update('username')} autoComplete="username" placeholder="letters, numbers, . and _" required />
                </label>
                <label className="field">
                  <span>Email</span>
                  <input className="input" type="email" value={form.email} onChange={update('email')} autoComplete="email" required />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input className="input" type="password" value={form.password} onChange={update('password')} autoComplete="new-password" minLength={8} required />
                  <small className="muted">At least 8 characters.</small>
                </label>
              </>
            )}

            {error && <p className="form-error" role="alert">{error}</p>}

            <button className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="divider"><span>or</span></div>
          <button className="btn btn--block" disabled={busy} onClick={(e) => submit(e, { identifier: 'demo', password: 'demo1234' })}>
            Explore with the demo account
          </button>
        </div>
      </section>
    </div>
  );
}
