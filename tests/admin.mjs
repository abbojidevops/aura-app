import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const makeAdminScript = path.join(__dirname, '..', 'scripts', 'make-admin.js');

const B = process.env.BASE_URL || 'http://localhost:3000';
let fails = 0;
const check = (n, ok, x = '') => {
  console.log(ok ? 'PASS' : 'FAIL', n, x);
  if (!ok) fails++;
};

async function j(path, { token, method = 'GET', body, form } = {}) {
  const headers = { 'X-Forwarded-For': '192.0.2.77' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(B + path, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

// 1. Register a normal (non-admin) user
const randUser = 'usr' + Math.floor(Math.random() * 1e6);
const regUser = await j('/api/auth/register', {
  method: 'POST',
  body: { username: randUser, email: `${randUser}@test.dev`, password: 'password123', displayName: 'Regular User' },
});
check('register regular user', regUser.status === 201 && regUser.data.token);
const userToken = regUser.data.token;

// 2. Non-admin gets 403 on every admin route
const naReports = await j('/api/admin/reports', { token: userToken });
check('non-admin GET /api/admin/reports returns 403', naReports.status === 403);

const naRestore = await j('/api/admin/posts/1/restore', { token: userToken, method: 'POST' });
check('non-admin POST /api/admin/posts/:id/restore returns 403', naRestore.status === 403);

const naRemove = await j('/api/admin/posts/1/remove', { token: userToken, method: 'POST' });
check('non-admin POST /api/admin/posts/:id/remove returns 403', naRemove.status === 403);

const naSuspend = await j(`/api/admin/users/${randUser}/suspend`, { token: userToken, method: 'POST' });
check('non-admin POST /api/admin/users/:username/suspend returns 403', naSuspend.status === 403);

const naUnsuspend = await j(`/api/admin/users/${randUser}/unsuspend`, { token: userToken, method: 'POST' });
check('non-admin POST /api/admin/users/:username/unsuspend returns 403', naUnsuspend.status === 403);

// 3. Register and promote an admin via scripts/make-admin.js
const randAdmin = 'adm' + Math.floor(Math.random() * 1e6);
const regAdmin = await j('/api/auth/register', {
  method: 'POST',
  body: { username: randAdmin, email: `${randAdmin}@test.dev`, password: 'password123', displayName: 'Admin User' },
});
check('register admin candidate', regAdmin.status === 201);

const makeAdminOut = execSync(`node "${makeAdminScript}" ${randAdmin}`, {
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'postgres://aura:aura@localhost:5433/aura' },
  encoding: 'utf8',
});
check('make-admin script succeeds', makeAdminOut.includes('is now an admin'));

// Log in as admin to get token
const loginAdmin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: randAdmin, password: 'password123' },
});
check('login as admin', loginAdmin.status === 200 && loginAdmin.data.token);
const adminToken = loginAdmin.data.token;

// 4. Create a post and report it
const postForm = new FormData();
postForm.append('media', new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')], { type: 'image/gif' }), 'mod.gif');
postForm.append('caption', 'Post for admin moderation #modtest');
postForm.append('visibility', 'public');
const upRes = await j('/api/posts', { token: userToken, method: 'POST', form: postForm });
check('user created post', upRes.status === 202);
let modPost = upRes.data.post;
for (let i = 0; i < 20 && modPost?.status === 'processing'; i++) {
  await new Promise((r) => setTimeout(r, 300));
  modPost = (await j(`/api/posts/${modPost.id}`, { token: userToken })).data.post;
}

const reportRes = await j(`/api/posts/${modPost.id}/report`, {
  token: adminToken,
  method: 'POST',
  body: { reason: 'Inappropriate content' },
});
check('post reported', reportRes.status === 200);

// 5. Admin GET /api/admin/reports
const reportsRes = await j('/api/admin/reports', { token: adminToken });
check('admin GET /api/admin/reports returns 200', reportsRes.status === 200);
const repItems = reportsRes.data.reports || reportsRes.data.posts || reportsRes.data.items || [];
const foundRep = repItems.find((r) => r.id === modPost.id || r.post?.id === modPost.id);
check('reported post found in admin reports', !!foundRep);
check('report count is at least 1', (foundRep?.reportCount || 0) >= 1);
check('report reasons include submitted reason', foundRep?.reasons?.some((r) => r.includes('Inappropriate')));

// 6. Admin removes post (status -> hidden)
const removeRes = await j(`/api/admin/posts/${modPost.id}/remove`, { token: adminToken, method: 'POST' });
check('admin remove post returns 200', removeRes.status === 200 && removeRes.data.status === 'hidden');

// Check post is hidden from regular users
const hiddenCheck = await j(`/api/posts/${modPost.id}`, { token: userToken });
// For owner it might show with status hidden, or for others 404
check('removed post marked as hidden', hiddenCheck.data.post ? hiddenCheck.data.post.status === 'hidden' : hiddenCheck.status === 404);

// 7. Admin restores post (status -> published)
const restoreRes = await j(`/api/admin/posts/${modPost.id}/restore`, { token: adminToken, method: 'POST' });
check('admin restore post returns 200', restoreRes.status === 200 && restoreRes.data.status === 'published');

// 8. Admin suspends user
const suspendRes = await j(`/api/admin/users/${randUser}/suspend`, { token: adminToken, method: 'POST' });
check('admin suspend user returns 200', suspendRes.status === 200 && suspendRes.data.suspended === true);

// Suspended user's existing token gets 403 on authenticated route
const blockedAuth = await j('/api/me', { token: userToken });
check('suspended user gets 403 on authenticated route', blockedAuth.status === 403);

// Suspended user cannot log in
const blockedLogin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: randUser, password: 'password123' },
});
check('suspended user login blocked with 403', blockedLogin.status === 403);

// 9. Admin unsuspends user
const unsuspendRes = await j(`/api/admin/users/${randUser}/unsuspend`, { token: adminToken, method: 'POST' });
check('admin unsuspend user returns 200', unsuspendRes.status === 200 && unsuspendRes.data.suspended === false);

// Unsuspended user can log in again
const unblockedLogin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: randUser, password: 'password123' },
});
check('unsuspended user login succeeds', unblockedLogin.status === 200 && unblockedLogin.data.token);

console.log(fails === 0 ? '\nADMIN MODERATION CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails ? 1 : 0);
