import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const db = require('../server/db.js');
const storage = require('../server/storage.js');

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

async function j(pathUrl, { token, method = 'GET', body, form, headers: customHeaders } = {}) {
  const headers = { 'X-Forwarded-For': '192.0.2.77', ...(customHeaders || {}) };
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

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(tinyPngBase64, 'base64');

async function createPostWithMedia(token, caption = 'Post with media #test') {
  const imgForm = new FormData();
  imgForm.append('media', new Blob([pngBuffer], { type: 'image/png' }), 'test.png');
  imgForm.append('caption', caption);
  imgForm.append('visibility', 'public');

  const uploadRes = await j('/api/posts', { token, method: 'POST', form: imgForm });
  let userPost = uploadRes.data.post;

  for (let i = 0; i < 30 && userPost && userPost.status === 'processing'; i++) {
    await sleep(300);
    userPost = (await j(`/api/posts/${userPost.id}`, { token })).data.post;
  }
  const postStorageDir = path.join(uploadsDir, 'posts', String(userPost.id));
  return { post: userPost, dir: postStorageDir };
}

// -------------------------------------------------------------
// 1. Log in demo user to interact with
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Part A: Normal successful deletion flow
// -------------------------------------------------------------
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

const { post: userPost, dir: postStorageDir } = await createPostWithMedia(userToken, 'Post to be deleted #media #test');
check('post processed to published', userPost && userPost.status === 'published');
check('post storage directory exists on disk', fs.existsSync(postStorageDir));

// User likes, comments, saves, and follows
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

// User starts conversation with demo and sends message; demo sends reply
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

// Test wrong password for account deletion
const badDelete = await j('/api/me', {
  token: userToken,
  method: 'DELETE',
  body: { password: 'wrongpassword' },
});
check('DELETE /api/me with wrong password rejected with 401', badDelete.status === 401);

// Delete account with correct password
const goodDelete = await j('/api/me', {
  token: userToken,
  method: 'DELETE',
  body: { password },
});
check('DELETE /api/me with correct password succeeds', goodDelete.status === 200 && goodDelete.data.ok === true);

// Acceptance: after deletion, login fails
const loginAfter = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: uname, password },
});
check('login fails after account deletion (401)', loginAfter.status === 401);

// Acceptance: username is free to reuse
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

// Acceptance: export endpoint no longer finds the account
const exportAfter = await j('/api/me/export', { token: userToken });
check('export endpoint returns 401 for deleted account', exportAfter.status === 401);

// Acceptance: post storage objects are removed
check('post media storage directory is deleted', !fs.existsSync(postStorageDir));

// Acceptance: post is unavailable
const postAfter = await j(`/api/posts/${userPost.id}`, { token: demoToken });
check('deleted user post returns 404', postAfter.status === 404);

// Acceptance: conversations with other people are kept, but deleted user is removed from membership
const convoAfter = await j(`/api/messages/${convoId}`, { token: demoToken });
check('conversation still accessible to demo', convoAfter.status === 200);
const remainingMsgs = convoAfter.data.messages || [];
check('demo message preserved in conversation', remainingMsgs.some((m) => m.body === 'Hello deluser from demo'));
check('messages sent by deleted user were removed', !remainingMsgs.some((m) => m.body === 'Hello demo from deluser'));

// Acceptance: target post like_count is restored
const targetAfter = (await j(`/api/posts/${targetPost.id}`, { token: demoToken })).data.post;
check('target post like count properly updated', targetAfter.likeCount === initialLikes);

// -------------------------------------------------------------
// Part B: Transaction failure keeps media & user intact
// -------------------------------------------------------------
const txUname = 'txfail' + Math.floor(Math.random() * 1e6);
const txPassword = 'password123';
const txReg = await j('/api/auth/register', {
  method: 'POST',
  body: { username: txUname, email: `${txUname}@test.dev`, password: txPassword, displayName: 'Tx Fail Tester' },
});
check('register user for tx failure test', txReg.status === 201 && txReg.data.token);
const txToken = txReg.data.token;

const { post: txPost, dir: txPostDir } = await createPostWithMedia(txToken, 'Tx fail post #test');
check('tx fail post created and directory exists', fs.existsSync(txPostDir));

const txFailDelete = await j('/api/me', {
  token: txToken,
  method: 'DELETE',
  body: { password: txPassword, simulateDbError: true },
  headers: { 'x-test-fail-db': '1' },
});
check('simulated DB failure during deletion returns 500', txFailDelete.status === 500);
check('post media directory still exists after tx failure', fs.existsSync(txPostDir));

const txLoginAfter = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: txUname, password: txPassword },
});
check('user still exists and can login after tx failure', txLoginAfter.status === 200 && !!txLoginAfter.data.token);

const txPostAfter = await j(`/api/posts/${txPost.id}`, { token: txLoginAfter.data.token });
check('user post still exists after tx failure', txPostAfter.status === 200);

// Clean up tx failure user
await j('/api/me', { token: txLoginAfter.data.token, method: 'DELETE', body: { password: txPassword } });
check('tx failure user deleted cleanly afterwards', !fs.existsSync(txPostDir));

// -------------------------------------------------------------
// Part C: Storage failure is recorded in storage_cleanup and retried on startup
// -------------------------------------------------------------
const sfUname = 'sfail' + Math.floor(Math.random() * 1e6);
const sfPassword = 'password123';
const sfReg = await j('/api/auth/register', {
  method: 'POST',
  body: { username: sfUname, email: `${sfUname}@test.dev`, password: sfPassword, displayName: 'Storage Fail Tester' },
});
check('register user for storage failure test', sfReg.status === 201 && sfReg.data.token);
const sfToken = sfReg.data.token;

const { post: sfPost, dir: sfPostDir } = await createPostWithMedia(sfToken, 'Storage fail post #test');
check('storage fail post created and directory exists', fs.existsSync(sfPostDir));

const sfDelete = await j('/api/me', {
  token: sfToken,
  method: 'DELETE',
  body: { password: sfPassword, simulateStorageError: true },
  headers: { 'x-test-fail-storage': '1' },
});
check('DELETE /api/me with storage failure succeeds (200)', sfDelete.status === 200 && sfDelete.data.ok === true);

const sfLoginAfter = await j('/api/auth/login', {
  method: 'POST',
  body: { identifier: sfUname, password: sfPassword },
});
check('user is deleted despite storage error', sfLoginAfter.status === 401);
check('post media directory still exists before cleanup retry', fs.existsSync(sfPostDir));

const cleanupRow = await db.get('SELECT * FROM storage_cleanup WHERE post_id = ?', [String(sfPost.id)]);
check('row exists in storage_cleanup for failed post', !!cleanupRow);

// Test wrapping/replacing storage.deletePost: if deletePost fails during retry, the row remains
const originalDeletePost = storage.deletePost;
storage.deletePost = async () => {
  throw new Error('Simulated failure during retryCleanup');
};
await storage.retryCleanup();
const cleanupRowStill = await db.get('SELECT * FROM storage_cleanup WHERE post_id = ?', [String(sfPost.id)]);
check('row remains in storage_cleanup if deletePost throws during retry', !!cleanupRowStill);

// Restore original storage.deletePost
storage.deletePost = originalDeletePost;

// Retry queued post deletions (simulates startup retry) - now succeeds
await storage.retryCleanup();

const cleanupRowAfter = await db.get('SELECT * FROM storage_cleanup WHERE post_id = ?', [String(sfPost.id)]);
check('row is removed from storage_cleanup after retry', !cleanupRowAfter);
check('post media directory is removed after retry cleanup', !fs.existsSync(sfPostDir));

// -------------------------------------------------------------
// Part D: Conversation scope: empty conversations not removed
// -------------------------------------------------------------
// Create an empty conversation directly in the database
const emptyConvo = await db.get('INSERT INTO conversations DEFAULT VALUES RETURNING id');
check('created standalone empty conversation', !!emptyConvo && emptyConvo.id > 0);

// Create conversation between two other users
const other1Uname = 'oth1_' + Math.floor(Math.random() * 1e6);
const other2Uname = 'oth2_' + Math.floor(Math.random() * 1e6);
const regO1 = await j('/api/auth/register', {
  method: 'POST',
  body: { username: other1Uname, email: `${other1Uname}@test.dev`, password: 'password123', displayName: 'Other 1' },
});
const regO2 = await j('/api/auth/register', {
  method: 'POST',
  body: { username: other2Uname, email: `${other2Uname}@test.dev`, password: 'password123', displayName: 'Other 2' },
});
const o1Token = regO1.data.token;
const o2Token = regO2.data.token;

const convoOtherRes = await j('/api/messages/start', {
  token: o1Token,
  method: 'POST',
  body: { username: other2Uname },
});
const convoOtherId = convoOtherRes.data.id;
check('conversation between other users created', !!convoOtherId);

// Register an unrelated user and delete them
const unrelatedUname = 'unrel_' + Math.floor(Math.random() * 1e6);
const regUnrel = await j('/api/auth/register', {
  method: 'POST',
  body: { username: unrelatedUname, email: `${unrelatedUname}@test.dev`, password: 'password123', displayName: 'Unrelated' },
});
const unrelToken = regUnrel.data.token;

const delUnrel = await j('/api/me', {
  token: unrelToken,
  method: 'DELETE',
  body: { password: 'password123' },
});
check('unrelated user deletion succeeds', delUnrel.status === 200 && delUnrel.data.ok === true);

// Verify empty conversation was NOT removed by deleting unrelated user
const checkEmpty = await db.get('SELECT id FROM conversations WHERE id = ?', [emptyConvo.id]);
check('empty conversation of other users was not removed', !!checkEmpty);

// Verify conversation of other users was NOT removed
const checkOtherConvo = await db.get('SELECT id FROM conversations WHERE id = ?', [convoOtherId]);
check('conversation between other users was not removed', !!checkOtherConvo);

// Cleanup
await db.run('DELETE FROM conversations WHERE id = ?', [emptyConvo.id]);
await j('/api/me', { token: o1Token, method: 'DELETE', body: { password: 'password123' } });
await j('/api/me', { token: o2Token, method: 'DELETE', body: { password: 'password123' } });

await db.close();

log(fails === 0 ? '\nACCOUNT DELETION CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
