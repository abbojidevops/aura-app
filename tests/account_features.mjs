import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const B = process.env.BASE_URL || 'http://localhost:3000';

const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => {
  log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fails++;
};

async function j(pathUrl, { token, method = 'GET', body, headers: customHeaders } = {}) {
  const headers = { 'X-Forwarded-For': '192.0.2.88', ...(customHeaders || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(B + pathUrl, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

// 1. Register test user
const uname = 'feat_' + Math.floor(Math.random() * 1e6);
const password = 'initialPassword123';
const reg = await j('/api/auth/register', {
  method: 'POST',
  body: { username: uname, email: `${uname}@test.dev`, password, displayName: 'Features Tester' },
});
check('register user for account features test', reg.status === 201 && !!reg.data.token);
let token = reg.data.token;

// 2. Change password tests
const wrongCurrent = await j('/api/me/password', {
  token,
  method: 'POST',
  body: { currentPassword: 'wrongPassword', newPassword: 'newPassword123' },
});
check('wrong current password returns 401', wrongCurrent.status === 401);

const shortNew = await j('/api/me/password', {
  token,
  method: 'POST',
  body: { currentPassword: password, newPassword: 'short' },
});
check('too short new password returns 400', shortNew.status === 400);

const goodChange = await j('/api/me/password', {
  token,
  method: 'POST',
  body: { currentPassword: password, newPassword: 'newPassword123' },
});
check('valid password change returns 200', goodChange.status === 200 && goodChange.data.ok === true);

const oldLogin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: uname, password },
});
check('login with old password fails (401)', oldLogin.status === 401);

const newLogin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: uname, password: 'newPassword123' },
});
check('login with new password succeeds (200)', newLogin.status === 200 && !!newLogin.data.token);
const token2 = newLogin.data.token;

// 3. Active sessions tests
const sessionsRes = await j('/api/me/sessions', { token });
check('GET /api/me/sessions returns sessions list', sessionsRes.status === 200 && Array.isArray(sessionsRes.data.sessions));
check('sessions count is at least 2', sessionsRes.data.count >= 2);

const revokeRes = await j('/api/me/sessions/revoke-others', { token, method: 'POST' });
check('POST /api/me/sessions/revoke-others returns 200', revokeRes.status === 200 && revokeRes.data.ok === true);
check('revoked at least 1 session', revokeRes.data.revoked >= 1);

const token2Check = await j('/api/me', { token: token2 });
check('revoked second session returns 401', token2Check.status === 401);

const token1Check = await j('/api/me', { token });
check('current session remains valid (200)', token1Check.status === 200);

// 4. Saved posts tests
// Fetch home feed to get a target post to save
const feedRes = await j('/api/feed?mode=home', { token });
const targetPost = feedRes.data.items?.[0];
check('target post available to save', !!targetPost);

if (targetPost) {
  const saveRes = await j(`/api/posts/${targetPost.id}/save`, { token, method: 'POST' });
  check('save post returns 200', saveRes.status === 200 && saveRes.data.saved === true);

  const getSaved = await j('/api/me/saved', { token });
  check('GET /api/me/saved returns 200', getSaved.status === 200 && Array.isArray(getSaved.data.posts));
  check('saved post found in list', getSaved.data.posts.some((p) => p.id === targetPost.id));

  const unsaveRes = await j(`/api/posts/${targetPost.id}/save`, { token, method: 'DELETE' });
  check('unsave post returns 200', unsaveRes.status === 200 && unsaveRes.data.saved === false);

  const getSavedAfter = await j('/api/me/saved', { token });
  check('unsaved post no longer in saved list', !getSavedAfter.data.posts.some((p) => p.id === targetPost.id));
}

log(fails === 0 ? '\nACCOUNT FEATURES CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
