// Realtime channel for direct messages. Clients connect to /ws, then send
// {"type":"auth","token":"..."} as their first message. The server answers {"type":"ready"}.
// Events carry only IDs. Clients refetch content over the authenticated REST API.
const { WebSocketServer } = require('ws');
const db = require('./db');

const AUTH_TIMEOUT_MS = 5000;
const HEARTBEAT_MS = 30000;
const clients = new Map(); // userId -> Set<{ ws, token }>

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    let entry = null;

    const authTimer = setTimeout(() => ws.close(4401, 'auth timeout'), AUTH_TIMEOUT_MS);

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      if (entry) return; // only auth messages are expected after connect
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return ws.close(4400, 'bad message'); }
      if (msg?.type !== 'auth' || typeof msg.token !== 'string') return ws.close(4400, 'auth required');
      try {
        const user = await db.get(
          'SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
          [msg.token]
        );
        if (!user) return ws.close(4401, 'unauthorized');
        clearTimeout(authTimer);
        entry = { ws, token: msg.token };
        if (!clients.has(user.id)) clients.set(user.id, new Set());
        clients.get(user.id).add(entry);
        ws.userId = user.id;
        ws.send(JSON.stringify({ type: 'ready' }));
      } catch {
        ws.close(1011, 'server error');
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimer);
      if (ws.userId && clients.has(ws.userId)) {
        clients.get(ws.userId).delete(entry);
        if (!clients.get(ws.userId).size) clients.delete(ws.userId);
      }
    });
  });

  // Drop connections that stopped answering pings.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

// Send a payload to every open socket belonging to these users.
function publish(userIds, payload) {
  const data = JSON.stringify(payload);
  for (const uid of userIds) {
    for (const c of clients.get(uid) || []) {
      if (c.ws.readyState === 1) c.ws.send(data);
    }
  }
}

// Used on logout so a signed-out session stops receiving events.
function closeSession(token) {
  for (const set of clients.values()) {
    for (const c of set) {
      if (c.token === token) c.ws.close(4401, 'signed out');
    }
  }
}

module.exports = { attach, publish, closeSession };
