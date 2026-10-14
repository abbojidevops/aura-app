const WebSocket = require('ws');
const B = process.env.BASE_URL || 'http://localhost:3000';
const post = (p, body, t) => fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, d: await r.json() }));
let fails = 0; const check = (n, ok, x = '') => { console.log(ok ? 'PASS' : 'FAIL', n, x); if (!ok) fails++; };
const open = (token) => new Promise((resolve) => {
  const ws = new WebSocket(B.replace(/^http/, 'ws') + '/ws'); const events = []; let ready = false;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'ready') { ready = true; resolve({ ws, events, ready: true }); } else events.push(m); });
  ws.on('close', (code) => { if (!ready) resolve({ ws, events, ready: false, code }); else ws.closeCode = code; ws.closed = code; });
  ws.on('error', () => {});
});
(async () => {
  const demo = (await post('/api/auth/login', { identifier: 'demo', password: 'demo1234' })).d.token;
  const maya = (await post('/api/auth/login', { identifier: 'maya.draws', password: 'demo1234' })).d.token;
  const bad = await open('nope');
  await new Promise((r) => setTimeout(r, 300));
  check('invalid token rejected', !bad.ready && bad.code === 4401, `code ${bad.code}`);

  const mayaSock = await open(maya);
  check('valid token gets ready', mayaSock.ready);
  // Make a conversation between demo and maya (or reuse)
  const conv = (await post('/api/messages/start', { username: 'maya.draws' }, demo)).d.id;
  await new Promise((r) => setTimeout(r, 200));
  const before = mayaSock.events.length;
  const sent = await post(`/api/messages/${conv}`, { body: 'realtime check' }, demo);
  check('message sent', sent.s === 201);
  await new Promise((r) => setTimeout(r, 500));
  const got = mayaSock.events.find((e) => e.type === 'message' && String(e.conversationId) === String(conv));
  check('recipient receives message event', !!got, JSON.stringify(mayaSock.events.slice(before)));
  check('event carries no message body', got && !JSON.stringify(got).includes('realtime check'));

  // Logout closes the socket
  await fetch(B + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + maya } });
  await new Promise((r) => setTimeout(r, 500));
  check('logout closes socket (4401)', mayaSock.ws.closed === 4401, `code ${mayaSock.ws.closed}`);

  // Unrelated user should not get the event
  const demoSock = await open(demo);
  const eve = await post('/api/auth/login', { identifier: 'pixel.pete', password: 'demo1234' });
  const peteSock = await open(eve.d.token);
  await post(`/api/messages/${conv}`, { body: 'private' }, demo);
  await new Promise((r) => setTimeout(r, 500));
  check('non-member gets no event', !peteSock.events.some((e) => String(e.conversationId) === String(conv)));
  check('member sender gets own event', demoSock.events.some((e) => String(e.conversationId) === String(conv)));
  demoSock.ws.close(); peteSock.ws.close();
  console.log(fails ? `${fails} FAILED` : 'WS CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
