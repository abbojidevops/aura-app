const B = process.env.BASE_URL || 'http://localhost:3000';
let fails = 0;
const check = (n, ok, x = '') => {
  console.log(ok ? 'PASS' : 'FAIL', n, x);
  if (!ok) fails++;
};

async function j(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
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

// 1. Create a private user A with a post
const randA = 'priv' + Math.floor(Math.random() * 1e6);
const regA = await j('/api/auth/register', {
  method: 'POST',
  body: { username: randA, email: `${randA}@test.dev`, password: 'password123', displayName: 'Private User' },
});
check('register private user', regA.status === 201 && regA.data.token);
const tokenA = regA.data.token;

const patchA = await j('/api/me', { token: tokenA, method: 'PATCH', body: { isPrivate: true } });
check('user set to private', patchA.data.user.isPrivate === true);

// Create a post for user A (using a 1x1 image or small payload)
const formA = new FormData();
formA.append('media', new Blob([Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')], { type: 'image/gif' }), 'pixel.gif');
formA.append('caption', 'Private secret post #private');
formA.append('visibility', 'public');
const postRes = await j('/api/posts', { token: tokenA, method: 'POST', form: formA });
check('private user created post', postRes.status === 202);
// wait a moment for post to publish
let postA = postRes.data.post;
for (let i = 0; i < 20 && postA?.status === 'processing'; i++) {
  await new Promise((r) => setTimeout(r, 300));
  postA = (await j(`/api/posts/${postA.id}`, { token: tokenA })).data.post;
}

// 2. Create requester user B
const randB = 'req' + Math.floor(Math.random() * 1e6);
const regB = await j('/api/auth/register', {
  method: 'POST',
  body: { username: randB, email: `${randB}@test.dev`, password: 'password123', displayName: 'Requester B' },
});
check('register requester user', regB.status === 201 && regB.data.token);
const tokenB = regB.data.token;

// 3. User B views User A's profile before requesting
const profBefore = await j(`/api/users/${randA}`, { token: tokenB });
check('profile is locked', profBefore.data.locked === true);
check('profile shows requested=false before requesting', profBefore.data.requested === false);
check('follower sees no posts before requesting', profBefore.data.posts.length === 0);

// 4. User B requests to follow User A
const reqFollow = await j(`/api/users/${randA}/follow`, { token: tokenB, method: 'POST' });
check('follow private account returns followed=false', reqFollow.data.followed === false);
check('follow private account returns requested=true', reqFollow.data.requested === true);
check('follower count has not increased', reqFollow.data.followers === 0);

// 5. User B still sees no posts while request is pending
const profPending = await j(`/api/users/${randA}`, { token: tokenB });
check('profile remains locked while pending', profPending.data.locked === true);
check('profile shows requested=true while pending', profPending.data.requested === true);
check('follower sees no posts before acceptance', profPending.data.posts.length === 0);

// 6. User A receives notification and sees pending request in /api/me/follow-requests
const notifsA = await j('/api/notifications', { token: tokenA });
check('target received follow_request notification', notifsA.data.items.some((n) => n.type === 'follow_request' && n.actor.username === randB));

const reqsA = await j('/api/me/follow-requests', { token: tokenA });
check('follow-requests endpoint lists pending request', reqsA.data.requests.some((r) => r.username === randB || r.user?.username === randB));

// 7. Test decline with User C
const randC = 'dec' + Math.floor(Math.random() * 1e6);
const regC = await j('/api/auth/register', {
  method: 'POST',
  body: { username: randC, email: `${randC}@test.dev`, password: 'password123', displayName: 'Declined C' },
});
const tokenC = regC.data.token;
await j(`/api/users/${randA}/follow`, { token: tokenC, method: 'POST' });

const declineRes = await j(`/api/me/follow-requests/${randC}/decline`, { token: tokenA, method: 'POST' });
check('decline follow request returns 200 ok', declineRes.status === 200 && declineRes.data.ok === true);

const reqsAfterDecline = await j('/api/me/follow-requests', { token: tokenA });
check('declined request removed from list', !reqsAfterDecline.data.requests.some((r) => r.username === randC || r.user?.username === randC));

const profC = await j(`/api/users/${randA}`, { token: tokenC });
check('declined user is not followed and not requested', profC.data.followed === false && profC.data.requested === false);

// 8. Test accept with User B
const acceptRes = await j(`/api/me/follow-requests/${randB}/accept`, { token: tokenA, method: 'POST' });
check('accept follow request returns 200 ok', acceptRes.status === 200 && acceptRes.data.ok === true);

const profAccepted = await j(`/api/users/${randA}`, { token: tokenB });
check('profile is unlocked after acceptance', profAccepted.data.locked === false);
check('user B is followed after acceptance', profAccepted.data.followed === true);
check('user B sees posts after acceptance', profAccepted.data.posts.length >= 1);
check('user A follower count incremented to 1', profAccepted.data.user.followers === 1);

const reqsAfterAccept = await j('/api/me/follow-requests', { token: tokenA });
check('accepted request removed from list', !reqsAfterAccept.data.requests.some((r) => r.username === randB || r.user?.username === randB));

console.log(fails === 0 ? '\nFOLLOW REQUEST CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails ? 1 : 0);
