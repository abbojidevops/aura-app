import { WebSocket } from 'ws';

const B = process.env.BASE_URL || 'http://localhost:3000';
const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => {
  log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fails++;
};

async function j(pathUrl, { token, method = 'GET', body, headers: customHeaders } = {}) {
  const headers = { 'X-Forwarded-For': '192.0.2.77', ...(customHeaders || {}) };
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

const openWs = (token) => new Promise((resolve) => {
  const ws = new WebSocket(B.replace(/^http/, 'ws') + '/ws');
  const events = [];
  let ready = false;
  ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.type === 'ready') {
      ready = true;
      resolve({ ws, events, ready: true });
    } else {
      events.push(m);
    }
  });
  ws.on('close', (code) => {
    if (!ready) resolve({ ws, events, ready: false, code });
  });
  ws.on('error', () => {});
});

(async () => {
  // 1. Setup users: demo (seeded) and 2 new users
  const demoLogin = await j('/api/auth/login', { method: 'POST', body: { identifier: 'demo', password: 'demo1234' } });
  check('login demo user', demoLogin.status === 200 && !!demoLogin.data.token);
  const demoToken = demoLogin.data.token;
  const demoUser = demoLogin.data.user;

  const u2Name = 'soc2_' + Math.floor(Math.random() * 1e6);
  const u2Reg = await j('/api/auth/register', {
    method: 'POST',
    body: { username: u2Name, email: `${u2Name}@test.dev`, password: 'password123', displayName: 'User Two' },
  });
  check('register user 2', u2Reg.status === 201 && !!u2Reg.data.token);
  const u2Token = u2Reg.data.token;
  const u2User = u2Reg.data.user;

  const u3Name = 'soc3_' + Math.floor(Math.random() * 1e6);
  const u3Reg = await j('/api/auth/register', {
    method: 'POST',
    body: { username: u3Name, email: `${u3Name}@test.dev`, password: 'password123', displayName: 'User Three' },
  });
  check('register user 3', u3Reg.status === 201 && !!u3Reg.data.token);
  const u3Token = u3Reg.data.token;

  // 2. Find demo's post and test PATCH /api/posts/:id (Edit caption)
  const myPostsRes = await j(`/api/users/demo`, { token: demoToken });
  const demoPost = myPostsRes.data.posts[0];
  check('demo has existing post', !!demoPost);

  const nonAuthorEdit = await j(`/api/posts/${demoPost.id}`, {
    token: u2Token,
    method: 'PATCH',
    body: { caption: 'Hacked caption!' },
  });
  check('non-author cannot edit post (403)', nonAuthorEdit.status === 403);

  const authorEdit = await j(`/api/posts/${demoPost.id}`, {
    token: demoToken,
    method: 'PATCH',
    body: { caption: 'Fresh morning vibes with #sunshine and #vibes' },
  });
  check('author can edit caption (200)', authorEdit.status === 200 && authorEdit.data.post.caption.includes('Fresh morning vibes'));
  check('edited post tags updated in response', authorEdit.data.post.tags.includes('sunshine') && authorEdit.data.post.tags.includes('vibes'));

  const verifyPost = await j(`/api/posts/${demoPost.id}`, { token: demoToken });
  check('verify edited post has updated caption and tags', verifyPost.data.post.caption.includes('Fresh morning vibes') && verifyPost.data.post.tags.includes('sunshine'));

  // 3. Test DELETE /api/posts/:id/comments/:commentId
  const commentAdd = await j(`/api/posts/${demoPost.id}/comments`, {
    token: u2Token,
    method: 'POST',
    body: { body: 'This is a test comment from user 2' },
  });
  check('user 2 adds comment', commentAdd.status === 201);

  const commentsList = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  const u2Comment = commentsList.data.comments.find((c) => c.body.includes('test comment from user 2'));
  check('comment exists in post comments', !!u2Comment);

  const u3DeleteComment = await j(`/api/posts/${demoPost.id}/comments/${u2Comment.id}`, {
    token: u3Token,
    method: 'DELETE',
  });
  check('unauthorized user cannot delete comment (403)', u3DeleteComment.status === 403);

  const u2DeleteOwn = await j(`/api/posts/${demoPost.id}/comments/${u2Comment.id}`, {
    token: u2Token,
    method: 'DELETE',
  });
  check('comment author can delete own comment (200)', u2DeleteOwn.status === 200 && u2DeleteOwn.data.ok === true);

  // Add another comment and let the post author (demo) delete it
  await j(`/api/posts/${demoPost.id}/comments`, {
    token: u2Token,
    method: 'POST',
    body: { body: 'Post author should be able to delete this' },
  });
  const commentsList2 = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  const u2Comment2 = commentsList2.data.comments.find((c) => c.body.includes('Post author should be able to delete'));
  check('second comment created', !!u2Comment2);

  const demoDeleteComment = await j(`/api/posts/${demoPost.id}/comments/${u2Comment2.id}`, {
    token: demoToken,
    method: 'DELETE',
  });
  check('post owner can delete comment on their post (200)', demoDeleteComment.status === 200 && demoDeleteComment.data.ok === true);

  // 4. Test GET /api/users/:username/followers and /following
  // User 2 follows demo
  await j(`/api/users/demo/follow`, { token: u2Token, method: 'POST' });

  const demoFollowers = await j(`/api/users/demo/followers`, { token: demoToken });
  check('GET /users/demo/followers returns 200', demoFollowers.status === 200 && Array.isArray(demoFollowers.data.users));
  check('demo followers contains user 2', demoFollowers.data.users.some((u) => u.username === u2Name));

  const u2Following = await j(`/api/users/${u2Name}/following`, { token: u2Token });
  check('GET /users/:u2/following returns 200', u2Following.status === 200 && Array.isArray(u2Following.data.users));
  check('user 2 following list contains demo', u2Following.data.users.some((u) => u.username === 'demo'));

  // Test privacy protection on followers / following
  await j(`/api/me`, { token: u2Token, method: 'PATCH', body: { isPrivate: true } });
  const strangerFollowers = await j(`/api/users/${u2Name}/followers`, { token: u3Token });
  check('non-follower gets 403 on private user followers list', strangerFollowers.status === 403);
  const strangerFollowing = await j(`/api/users/${u2Name}/following`, { token: u3Token });
  check('non-follower gets 403 on private user following list', strangerFollowing.status === 403);

  const ownerFollowers = await j(`/api/users/${u2Name}/followers`, { token: u2Token });
  check('owner can view own followers on private account', ownerFollowers.status === 200);

  // 5. Test Suggested Creators on GET /api/explore
  const exploreRes = await j(`/api/explore`, { token: u3Token });
  check('explore returns suggestedUsers', Array.isArray(exploreRes.data.suggestedUsers) && exploreRes.data.suggestedUsers.length > 0);
  check('suggested users does not include self', !exploreRes.data.suggestedUsers.some((u) => u.username === u3Name));

  // 6. Test Realtime WebSocket typing indicator and notification events
  const demoWs = await openWs(demoToken);
  check('demo WS connected and authenticated', demoWs.ready);

  const u2Ws = await openWs(u2Token);
  check('u2 WS connected and authenticated', u2Ws.ready);

  // Start chat between demo and u2
  const chatRes = await j(`/api/messages/start`, { token: demoToken, method: 'POST', body: { username: u2Name } });
  const convoId = chatRes.data.id;
  check('chat started between demo and u2', !!convoId);

  // Demo sends typing event
  demoWs.ws.send(JSON.stringify({ type: 'typing', conversationId: convoId }));
  await new Promise((r) => setTimeout(r, 400));
  const gotTyping = u2Ws.events.find((e) => e.type === 'typing' && Number(e.conversationId) === Number(convoId));
  check('u2 receives typing event from demo', !!gotTyping && gotTyping.userId === demoUser.id);

  // Realtime notification: u2 likes demo's post -> demo receives notification event
  const eventsBefore = demoWs.events.length;
  await j(`/api/posts/${demoPost.id}/like`, { token: u2Token, method: 'POST' });
  await new Promise((r) => setTimeout(r, 400));
  const gotNotif = demoWs.events.slice(eventsBefore).find((e) => e.type === 'notification');
  check('demo receives realtime notification event on like', !!gotNotif);

  // 7. Test GET /api/posts/:id/likes (Likers list)
  const likersAsDemo = await j(`/api/posts/${demoPost.id}/likes`, { token: demoToken });
  check('GET /posts/:id/likes returns 200', likersAsDemo.status === 200);
  const u2InLikers = likersAsDemo.data.users?.find((u) => u.id === u2User.id);
  check('u2 found in likers list', !!u2InLikers && u2InLikers.username === u2Name);
  check('isMe false for other user in likers list', u2InLikers?.isMe === false);

  const likersAsU2 = await j(`/api/posts/${demoPost.id}/likes`, { token: u2Token });
  const u2Self = likersAsU2.data.users?.find((u) => u.id === u2User.id);
  check('isMe true for self in likers list', u2Self?.isMe === true);

  // 8. Test Comment Likes (POST/DELETE /api/comments/:id/like)
  const cRes = await j(`/api/posts/${demoPost.id}/comments`, {
    token: demoToken,
    method: 'POST',
    body: { body: 'A comment to test liking' },
  });
  check('create comment for like test', cRes.status === 201);
  const postComments = await j(`/api/posts/${demoPost.id}/comments`, { token: u2Token });
  const targetComment = postComments.data.comments?.find((c) => c.body === 'A comment to test liking');
  check('target comment found in list', !!targetComment);

  const likeCRes = await j(`/api/comments/${targetComment.id}/like`, { token: u2Token, method: 'POST' });
  check('like comment returns 200 and liked=true', likeCRes.status === 200 && likeCRes.data.liked === true && likeCRes.data.likeCount === 1);

  const checkAfterLike = await j(`/api/posts/${demoPost.id}/comments`, { token: u2Token });
  const cAfterLike = checkAfterLike.data.comments?.find((c) => c.id === targetComment.id);
  check('comment reflects liked=true for liker', cAfterLike?.liked === true && cAfterLike?.likeCount === 1);

  const checkAsOther = await j(`/api/posts/${demoPost.id}/comments`, { token: u3Token });
  const cAsOther = checkAsOther.data.comments?.find((c) => c.id === targetComment.id);
  check('comment reflects liked=false for non-liker with count=1', cAsOther?.liked === false && cAsOther?.likeCount === 1);

  const unlikeCRes = await j(`/api/comments/${targetComment.id}/like`, { token: u2Token, method: 'DELETE' });
  check('unlike comment returns 200 and liked=false', unlikeCRes.status === 200 && unlikeCRes.data.liked === false && unlikeCRes.data.likeCount === 0);

  // 9. Test Pinned Posts (POST/DELETE /api/posts/:id/pin)
  const nonAuthorPin = await j(`/api/posts/${demoPost.id}/pin`, { token: u2Token, method: 'POST' });
  check('non-author cannot pin post (403)', nonAuthorPin.status === 403);

  const authorPin = await j(`/api/posts/${demoPost.id}/pin`, { token: demoToken, method: 'POST' });
  check('author can pin post (200)', authorPin.status === 200 && authorPin.data.isPinned === true);

  const demoProfileAfterPin = await j('/api/users/demo', { token: u2Token });
  const firstPost = demoProfileAfterPin.data.posts?.[0];
  check('pinned post is first on profile', firstPost?.id === demoPost.id && firstPost?.isPinned === true);

  const authorUnpin = await j(`/api/posts/${demoPost.id}/pin`, { token: demoToken, method: 'DELETE' });
  check('author can unpin post (200)', authorUnpin.status === 200 && authorUnpin.data.isPinned === false);

  const demoProfileAfterUnpin = await j('/api/users/demo', { token: u2Token });
  const unpinnedItem = demoProfileAfterUnpin.data.posts?.find((p) => p.id === demoPost.id);
  check('post is no longer pinned on profile', unpinnedItem?.isPinned === false);

  demoWs.ws.close();
  u2Ws.ws.close();

  log(fails ? `${fails} FAILED` : 'ALL SOCIAL FEATURES CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
