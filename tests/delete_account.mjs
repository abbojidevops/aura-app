import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const B = process.env.BASE_URL || 'http://localhost:3000';
const uploadsDir = path.join(__dirname, '..', 'uploads');

const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => {
  log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fails++;
};

async function j(pathUrl, { token, method = 'GET', body, form } = {}) {
  const headers = { 'X-Forwarded-For': '192.0.2.77' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(B + pathUrl, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Log in demo user to interact with
const demoLogin = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: 'demo', password: 'demo1234' },
});
check('demo login succeeds', demoLogin.status === 200 && demoLogin.data.token);
const demoToken = demoLogin.data.token;

// Get a post from home feed for liking/commenting/saving
const homeFeed = await j('/api/feed?mode=home', { token: demoToken });
const targetPost = homeFeed.data.items[0];
check('target post available', !!targetPost);
const initialLikes = targetPost.likeCount;

// 2. Register a new user for account deletion test
const uname = 'deluser' + Math.floor(Math.random() * 1e6);
const password = 'password123';
const reg = await j('/api/auth/register', {
  method: 'POST',
  body: {
    username: uname,
    email: `${uname}@test.dev`,
    password,
    displayName: 'Delete Tester',
  },
});
check('register user for deletion', reg.status === 201 && reg.data.token);
const userToken = reg.data.token;
const userId = reg.data.user.id;

// 3. User creates a post with uploaded media
const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(tinyPngBase64, 'base64');
const imgForm = new FormData();
imgForm.append('media', new Blob([pngBuffer], { type: 'image/png' }), 'test.png');
imgForm.append('caption', 'Post to be deleted #media #test');
imgForm.append('visibility', 'public');

const uploadRes = await j('/api/posts', { token: userToken, method: 'POST', form: imgForm });
check('media upload accepted (202 processing)', uploadRes.status === 202);
let userPost = uploadRes.data.post;

// Wait for post to be processed into published
for (let i = 0; i < 30 && userPost.status === 'processing'; i++) {
  await sleep(300);
  userPost = (await j(`/api/posts/${userPost.id}`, { token: userToken })).data.post;
}
check('post processed to published', userPost.status === 'published');
const postStorageDir = path.join(uploadsDir, 'posts', String(userPost.id));
check('post storage directory exists on disk', fs.existsSync(postStorageDir));

// 4. User likes, comments, saves, and follows
const likeRes = await j(`/api/posts/${targetPost.id}/like`, { token: userToken, method: 'POST' });
check('user likes demo post', likeRes.status === 200 && likeRes.data.liked === true);

const commentRes = await j(`/api/posts/${targetPost.id}/comments`, {
  token: userToken,
  method: 'POST',
  body: { body: 'Great post!' },
});
check('user comments on demo post', commentRes.status === 201);

const saveRes = await j(`/api/posts/${targetPost.id}/save`, { token: userToken, method: 'POST' });
check('user saves demo post', saveRes.status === 200 && saveRes.data.saved === true);

const followRes = await j('/api/users/demo/follow', { token: userToken, method: 'POST' });
check('user follows demo', followRes.status === 200 && followRes.data.followed === true);

// 5. User starts conversation with demo and sends message; demo sends reply
const chatStart = await j('/api/messages/start', {
  token: userToken,
  method: 'POST',
  body: { username: 'demo' },
});
check('user starts conversation with demo', chatStart.status === 200 || chatStart.status === 201);
const convoId = chatStart.data.id;

const msg1 = await j(`/api/messages/${convoId}`, {
  token: userToken,
  method: 'POST',
  body: { body: 'Hello demo from deluser' },
});
check('user sends message', msg1.status === 201);

const msg2 = await j(`/api/messages/${convoId}`, {
  token: demoToken,
  method: 'POST',
  body: { body: 'Hello deluser from demo' },
});
check('demo replies to conversation', msg2.status === 201);

// 6. Test wrong password for account deletion
const badDelete = await j('/api/me', {
  token: userToken,
  method: 'DELETE',
  body: { password: 'wrongpassword' },
});
check('DELETE /api/me with wrong password rejected with 401', badDelete.status === 401);

// 7. Delete account with correct password
const goodDelete = await j('/api/me', {
  token: userToken,
  method: 'DELETE',
  body: { password },
});
check('DELETE /api/me with correct password succeeds', goodDelete.status === 200 && goodDelete.data.ok === true);

// 8. Verify acceptance criteria

// Acceptance 8a: after deletion, login fails
const loginAfter = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: uname, password },
});
check('login fails after account deletion (401)', loginAfter.status === 401);

// Acceptance 8b: username is free to reuse
const reReg = await j('/api/auth/register', {
  method: 'POST',
  body: {
    username: uname,
    email: `re_${uname}@test.dev`,
    password: 'newpassword123',
    displayName: 'Reused Username',
  },
});
check('username is free to reuse (201)', reReg.status === 201 && reReg.data.token);

// Acceptance 8c: export endpoint no longer finds the account
const exportAfter = await j('/api/me/export', { token: userToken });
check('export endpoint returns 401 for deleted account', exportAfter.status === 401);

// Acceptance 8d: post storage objects are removed
check('post media storage directory is deleted', !fs.existsSync(postStorageDir));

// Acceptance 8e: post is unavailable
const postAfter = await j(`/api/posts/${userPost.id}`, { token: demoToken });
check('deleted user post returns 404', postAfter.status === 404);

// Acceptance 8f: conversations with other people are kept, but deleted user is removed from membership
const convoAfter = await j(`/api/messages/${convoId}`, { token: demoToken });
check('conversation still accessible to demo', convoAfter.status === 200);
const remainingMsgs = convoAfter.data.messages || [];
check('demo message preserved in conversation', remainingMsgs.some((m) => m.body === 'Hello deluser from demo'));
check('messages sent by deleted user were removed', !remainingMsgs.some((m) => m.body === 'Hello demo from deluser'));

// Acceptance 8g: target post like_count is restored
const targetAfter = (await j(`/api/posts/${targetPost.id}`, { token: demoToken })).data.post;
check('target post like count properly updated', targetAfter.likeCount === initialLikes);

log(fails === 0 ? '\nACCOUNT DELETION CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
