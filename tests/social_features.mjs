import { WebSocket } from 'ws';

const B = process.env.BASE_URL || 'http://localhost:3000';
const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => {
  log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fails++;
};

const tinyPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const pngBuffer = Buffer.from(tinyPngBase64, 'base64');

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

  // 10. Test Saved Collections
  const createCol = await j('/api/me/collections', { token: demoToken, method: 'POST', body: { name: 'Inspiration' } });
  check('create collection (201)', createCol.status === 201 && createCol.data.collection?.name === 'Inspiration');
  const colId = createCol.data.collection.id;

  const listCols = await j('/api/me/collections', { token: demoToken });
  check('list collections returns created collection', listCols.status === 200 && listCols.data.collections?.some((c) => c.id === colId));

  const addPostToCol = await j(`/api/me/collections/${colId}/posts`, { token: demoToken, method: 'POST', body: { postId: demoPost.id } });
  check('add post to collection (200)', addPostToCol.status === 200 && addPostToCol.data.ok === true);

  const getCol = await j(`/api/me/collections/${colId}`, { token: demoToken });
  check('get collection includes added post', getCol.status === 200 && getCol.data.posts?.some((p) => p.id === demoPost.id));

  const removePostFromCol = await j(`/api/me/collections/${colId}/posts/${demoPost.id}`, { token: demoToken, method: 'DELETE' });
  check('remove post from collection (200)', removePostFromCol.status === 200 && removePostFromCol.data.ok === true);

  const getColAfterRemove = await j(`/api/me/collections/${colId}`, { token: demoToken });
  check('collection empty after post removed', getColAfterRemove.status === 200 && getColAfterRemove.data.posts?.length === 0);

  const deleteCol = await j(`/api/me/collections/${colId}`, { token: demoToken, method: 'DELETE' });
  check('delete collection (200)', deleteCol.status === 200 && deleteCol.data.ok === true);

  // 11. Test Message Reactions
  const sendMsg = await j(`/api/messages/${convoId}`, { token: demoToken, method: 'POST', body: { body: 'Testing reactions!' } });
  check('send message in chat (201)', sendMsg.status === 201 && !!sendMsg.data.id);
  const msgId = sendMsg.data.id;

  const reactHeart = await j(`/api/messages/${convoId}/react`, { token: u2Token, method: 'POST', body: { messageId: msgId, emoji: '❤️' } });
  check('react to message returns 200 and reacted=true', reactHeart.status === 200 && reactHeart.data.reacted === true);

  await new Promise((r) => setTimeout(r, 100));
  const reactionEvent = demoWs.events.find((e) => e.type === 'reaction' && e.messageId === msgId);
  check('demo receives realtime reaction event over ws', !!reactionEvent && reactionEvent.emoji === '❤️');

  const getMsgsWithReactions = await j(`/api/messages/${convoId}`, { token: demoToken });
  const reactedMsg = getMsgsWithReactions.data.messages?.find((m) => m.id === msgId);
  check('message reflects reaction count=1', reactedMsg?.reactions?.find((r) => r.emoji === '❤️')?.count === 1);

  const unreactHeart = await j(`/api/messages/${convoId}/react`, { token: u2Token, method: 'POST', body: { messageId: msgId, emoji: '❤️' } });
  check('toggle off reaction returns 200 and reacted=false', unreactHeart.status === 200 && unreactHeart.data.reacted === false);

  // 12. Test User Blocking & Safety Shield
  const blockRes = await j(`/api/users/${u3Name}/block`, { token: demoToken, method: 'POST' });
  check('demo blocks user 3 (200)', blockRes.status === 200 && blockRes.data.blocked === true);

  const blocksList = await j('/api/me/blocks', { token: demoToken });
  check('blocks list contains user 3', blocksList.status === 200 && blocksList.data.blocks?.some((b) => b.username === u3Name));

  const followBlocked = await j(`/api/users/${u3Name}/follow`, { token: demoToken, method: 'POST' });
  check('cannot follow blocked user (403)', followBlocked.status === 403);

  const blockedFollowsDemo = await j('/api/users/demo/follow', { token: u3Token, method: 'POST' });
  check('blocked user cannot follow blocker (403)', blockedFollowsDemo.status === 403);

  const u3ViewsDemoProfile = await j('/api/users/demo', { token: u3Token });
  check('blocked user cannot see demo profile posts', u3ViewsDemoProfile.status === 200 && u3ViewsDemoProfile.data.blocked === true && u3ViewsDemoProfile.data.posts.length === 0);

  const unblockRes = await j(`/api/users/${u3Name}/block`, { token: demoToken, method: 'DELETE' });
  check('unblock user 3 (200)', unblockRes.status === 200 && unblockRes.data.blocked === false);

  // 13. Test Interactive Polls
  const pollForm = new FormData();
  pollForm.append('media', new Blob([pngBuffer], { type: 'image/png' }), 'poll.png');
  pollForm.append('caption', 'Check out this poll #poll');
  pollForm.append('visibility', 'public');
  pollForm.append('poll', JSON.stringify({ question: 'Best framework?', options: ['React', 'Vue', 'Svelte'] }));

  const createPollPostRes = await j('/api/posts', { token: demoToken, method: 'POST', form: pollForm });
  check('create post with poll (202)', createPollPostRes.status === 202 && !!createPollPostRes.data.post);
  const pollPostId = createPollPostRes.data.post.id;

  let pollPost = createPollPostRes.data.post;
  for (let i = 0; i < 20 && pollPost?.status === 'processing'; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const pRes = await j(`/api/posts/${pollPostId}`, { token: demoToken });
    pollPost = pRes.data?.post;
  }
  check('poll post is published', pollPost?.status === 'published');

  const pollPostU2 = (await j(`/api/posts/${pollPostId}`, { token: u2Token })).data?.post;
  check('post contains poll data', !!pollPostU2?.poll && pollPostU2.poll.question === 'Best framework?' && pollPostU2.poll.options?.length === 3);
  check('poll totalVotes is 0 initially', pollPostU2.poll.totalVotes === 0 && pollPostU2.poll.myVote === null);

  const opt1 = pollPostU2.poll.options[0];
  const opt2 = pollPostU2.poll.options[1];

  // User 2 votes for Option 1
  const voteRes1 = await j(`/api/posts/${pollPostId}/poll/vote`, { token: u2Token, method: 'POST', body: { optionId: opt1.id } });
  check('user 2 votes for option 1 (200)', voteRes1.status === 200 && voteRes1.data.poll?.totalVotes === 1 && voteRes1.data.poll?.myVote === opt1.id);
  const u2Opt1 = voteRes1.data.poll?.options.find((o) => o.id === opt1.id);
  check('option 1 has 100% percent', u2Opt1?.percent === 100);

  // User 3 votes for Option 2
  const voteRes2 = await j(`/api/posts/${pollPostId}/poll/vote`, { token: u3Token, method: 'POST', body: { optionId: opt2.id } });
  check('user 3 votes for option 2 (200)', voteRes2.status === 200 && voteRes2.data.poll?.totalVotes === 2);
  const u3Opt1 = voteRes2.data.poll?.options.find((o) => o.id === opt1.id);
  const u3Opt2 = voteRes2.data.poll?.options.find((o) => o.id === opt2.id);
  check('options have split percentages 50/50', u3Opt1?.percent === 50 && u3Opt2?.percent === 50);

  // User 2 toggles vote off
  const unvoteRes = await j(`/api/posts/${pollPostId}/poll/vote`, { token: u2Token, method: 'POST', body: { optionId: opt1.id } });
  check('user 2 toggles vote off (200)', unvoteRes.status === 200 && unvoteRes.data.poll?.totalVotes === 1 && unvoteRes.data.poll?.myVote === null);

  // 14. Test User Mentions in Comments
  const notifsBefore = demoWs.events.length;
  const mentionCommentRes = await j(`/api/posts/${demoPost.id}/comments`, {
    token: u2Token,
    method: 'POST',
    body: { body: 'Hello @demo check this mention out!' },
  });
  check('create comment with mention (201)', mentionCommentRes.status === 201);

  await new Promise((r) => setTimeout(r, 400));
  const mentionEvent = demoWs.events.slice(notifsBefore).find((e) => e.type === 'notification' && e.notification?.type === 'mention');
  check('demo receives realtime mention notification over ws', !!mentionEvent);

  const demoNotifs = await j('/api/notifications', { token: demoToken });
  const mentionNotif = demoNotifs.data.items?.find((n) => n.type === 'mention' && n.postId === demoPost.id);
  check('demo notifications list includes mention', !!mentionNotif && mentionNotif.actor.username === u2Name);

  // 15. Test Threaded Comments & Replies
  const parentCommentRes = await j(`/api/posts/${demoPost.id}/comments`, {
    token: demoToken,
    method: 'POST',
    body: { body: 'Root discussion comment #architecture' },
  });
  check('create top-level parent comment (201)', parentCommentRes.status === 201 && !!parentCommentRes.data.commentId);
  const parentCommentId = parentCommentRes.data.commentId;

  const parentCommentsList = await j(`/api/posts/${demoPost.id}/comments`, { token: u2Token });
  const fetchedParent = parentCommentsList.data.comments?.find((c) => c.id === parentCommentId);
  check('fetched parent comment has 0 replies', fetchedParent?.replyCount === 0 && Array.isArray(fetchedParent?.replies) && fetchedParent.replies.length === 0);

  // User 2 replies to demo's comment
  const notifsBeforeReply = demoWs.events.length;
  const replyRes = await j(`/api/posts/${demoPost.id}/comments`, {
    token: u2Token,
    method: 'POST',
    body: { body: 'First reply to root comment', parentId: parentCommentId },
  });
  check('create reply to parent comment (201)', replyRes.status === 201 && !!replyRes.data.commentId);
  const replyId = replyRes.data.commentId;

  await new Promise((r) => setTimeout(r, 400));
  const replyEvent = demoWs.events.slice(notifsBeforeReply).find((e) => e.type === 'notification' && e.notification?.type === 'reply');
  check('demo receives realtime reply notification over ws', !!replyEvent);

  const demoReplyNotifs = await j('/api/notifications', { token: demoToken });
  const replyNotifItem = demoReplyNotifs.data.items?.find((n) => n.type === 'reply' && n.postId === demoPost.id);
  check('demo notifications list includes reply', !!replyNotifItem && replyNotifItem.actor.username === u2Name);

  // Verify parent comment now includes the reply
  const checkThreadRes = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  const updatedParent = checkThreadRes.data.comments?.find((c) => c.id === parentCommentId);
  check('parent comment has replyCount = 1', updatedParent?.replyCount === 1);
  check('parent comment replies contains user 2 reply', updatedParent?.replies?.[0]?.id === replyId && updatedParent.replies[0].author.username === u2Name);

  // User 3 adds second reply
  const reply2Res = await j(`/api/posts/${demoPost.id}/comments`, {
    token: u3Token,
    method: 'POST',
    body: { body: 'Second reply from user 3', parentId: parentCommentId },
  });
  check('create second reply (201)', reply2Res.status === 201);
  const reply2Id = reply2Res.data.commentId;

  const checkThreadRes2 = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  const updatedParent2 = checkThreadRes2.data.comments?.find((c) => c.id === parentCommentId);
  check('parent comment has replyCount = 2', updatedParent2?.replyCount === 2);

  // Delete user 3's reply
  const deleteReplyRes = await j(`/api/posts/${demoPost.id}/comments/${reply2Id}`, { token: u3Token, method: 'DELETE' });
  check('user 3 deletes own reply (200)', deleteReplyRes.status === 200);

  const checkThreadAfterDelete = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  const parentAfterDelete = checkThreadAfterDelete.data.comments?.find((c) => c.id === parentCommentId);
  check('parent comment has replyCount = 1 after deletion', parentAfterDelete?.replyCount === 1 && !parentAfterDelete.replies.some((r) => r.id === reply2Id));

  // Delete root parent comment (cascades to remaining reply)
  const deleteParentRes = await j(`/api/posts/${demoPost.id}/comments/${parentCommentId}`, { token: demoToken, method: 'DELETE' });
  check('author deletes root comment (200)', deleteParentRes.status === 200);

  const checkThreadAfterParentDelete = await j(`/api/posts/${demoPost.id}/comments`, { token: demoToken });
  check('root comment and replies are gone', !checkThreadAfterParentDelete.data.comments?.some((c) => c.id === parentCommentId));

  demoWs.ws.close();
  u2Ws.ws.close();

  log(fails ? `${fails} FAILED` : 'ALL SOCIAL FEATURES CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
