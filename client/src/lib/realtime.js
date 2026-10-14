// Realtime connection to /ws. One shared socket for the app, with automatic reconnect.
// Pages subscribe to events and fall back to slower polling while the socket is down.
import { useEffect, useState } from 'react';
import { getToken } from './api';

let ws = null;
let timer = null;
let retries = 0;
let live = false;
const listeners = new Set();
const statusListeners = new Set();

function setLive(next) {
  if (live === next) return;
  live = next;
  statusListeners.forEach((fn) => fn(next));
}

function connect() {
  const token = getToken();
  if (!token || ws || listeners.size === 0) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sock = new WebSocket(`${proto}//${location.host}/ws`);
  ws = sock;

  sock.onopen = () => sock.send(JSON.stringify({ type: 'auth', token }));
  sock.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === 'ready') {
      retries = 0;
      setLive(true);
      return;
    }
    listeners.forEach((fn) => fn(msg));
  };
  sock.onclose = (e) => {
    if (ws === sock) ws = null;
    setLive(false);
    // 4401 means the session is gone. Don't keep retrying.
    if (e.code === 4401 || listeners.size === 0) return;
    const delay = Math.min(30000, 1000 * 2 ** retries);
    retries += 1;
    timer = setTimeout(connect, delay);
  };
  sock.onerror = () => sock.close();
}

// Subscribe to server events. Returns an unsubscribe function.
export function subscribeRealtime(fn) {
  listeners.add(fn);
  if (!ws && !timer) connect();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      clearTimeout(timer);
      timer = null;
      if (ws) ws.close();
      ws = null;
      setLive(false);
    }
  };
}

// True while the socket is authenticated and open.
export function useRealtimeLive() {
  const [value, setValue] = useState(live);
  useEffect(() => {
    statusListeners.add(setValue);
    return () => statusListeners.delete(setValue);
  }, []);
  return value;
}
