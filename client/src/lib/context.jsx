// App-wide state: authentication, theme (light/dark/system), and toast notifications.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthCtx = createContext(null);
const ThemeCtx = createContext(null);
const ToastCtx = createContext(null);

export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('aura-theme') || 'system');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = useCallback((t) => {
    localStorage.setItem('aura-theme', t);
    setThemeState(t);
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const show = useCallback((message) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 2800);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((i) => <div key={i.id} className="toast">{i.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

function AuthProvider({ children }) {
  const [state, setState] = useState({ status: getToken() ? 'loading' : 'anon', user: null, counts: null });

  const refresh = useCallback(async () => {
    try {
      const data = await api('/me');
      setState({ status: 'in', user: data.user, counts: data.counts });
    } catch {
      setToken(null);
      setState({ status: 'anon', user: null, counts: null });
    }
  }, []);

  useEffect(() => {
    if (getToken()) refresh();
    const onOut = () => setState({ status: 'anon', user: null, counts: null });
    window.addEventListener('aura:signed-out', onOut);
    return () => window.removeEventListener('aura:signed-out', onOut);
  }, [refresh]);

  const signIn = useCallback((token, user) => {
    setToken(token);
    setState({ status: 'in', user, counts: null });
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* token may already be gone */ }
    setToken(null);
    setState({ status: 'anon', user: null, counts: null });
  }, []);

  const value = useMemo(() => ({ ...state, refresh, signIn, signOut }), [state, refresh, signIn, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const useTheme = () => useContext(ThemeCtx);
export const useToast = () => useContext(ToastCtx);
