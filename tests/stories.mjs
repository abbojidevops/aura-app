const B = process.env.BASE_URL || 'http://localhost:3000';
const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => {
  log(cond ? 'PASS' : 'FAIL', name, extra);
  if (!cond) fails++;
};

async function j(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const r = await fetch(B + path, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

(async () => {
  // 1. Setup two test accounts: author and viewer
  const rnd = Math.floor(Math.random() * 1e6);
  const authorName = `st_auth_${rnd}`;
  const viewerName = `st_view_${rnd}`;

  const regAuthor = await j('/api/auth/register', {
    method: 'POST',
    body: { username: authorName, email: `${authorName}@test.dev`, password: 'password123', displayName: 'Story Author' },
  });
  check('register story author', regAuthor.status === 201 && !!regAuthor.data.token);
  const authTok = regAuthor.data.token;
  const authorUser = regAuthor.data.user;

  const regViewer = await j('/api/auth/register', {
    method: 'POST',
    body: { username: viewerName, email: `${viewerName}@test.dev`, password: 'password123', displayName: 'Story Viewer' },
  });
  check('register story viewer', regViewer.status === 201 && !!regViewer.data.token);
  const viewTok = regViewer.data.token;
  const viewerUser = regViewer.data.user;

  // 2. Reject missing or invalid uploads
  const emptyForm = new FormData();
  const badReq = await j('/api/stories', { token: authTok, method: 'POST', form: emptyForm });
  check('missing media rejected', badReq.status === 400);

  const txtForm = new FormData();
  txtForm.append('media', new Blob(['hello'], { type: 'text/plain' }), 'note.txt');
  const badType = await j('/api/stories', { token: authTok, method: 'POST', form: txtForm });
  check('invalid media type rejected', badType.status === 400);

  // 3. Post a valid image story
  const pngBuf = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  const storyForm = new FormData();
  storyForm.append('media', new Blob([pngBuf], { type: 'image/png' }), 'snap.png');
  storyForm.append('caption', 'Golden hour reflections ✨');

  const createRes = await j('/api/stories', { token: authTok, method: 'POST', form: storyForm });
  check('story posted successfully', createRes.status === 201 && !!createRes.data.story?.id);
  const story = createRes.data.story;
  check('story mediaType is image', story?.mediaType === 'image');
  check('story caption saved', story?.caption === 'Golden hour reflections ✨');
  check('story mediaUrl exists', !!story?.mediaUrl && story.mediaUrl.includes('/uploads/stories/'));

  // 4. Author feed contains own story
  const authorFeed = await j('/api/stories/feed', { token: authTok });
  check('author story feed status 200', authorFeed.status === 200);
  const myGroup = authorFeed.data.groups?.find((g) => g.author.isMe);
  check('author sees own story group pinned', !!myGroup && myGroup.author.username === authorName);
  check('author story list contains story', myGroup?.stories?.some((s) => s.id === story.id));

  // 5. Viewer feed before following does not show story
  const viewerFeedBefore = await j('/api/stories/feed', { token: viewTok });
  check('non-follower does not see story in feed', !viewerFeedBefore.data.groups?.some((g) => g.author.id === authorUser.id));

  // 6. Viewer follows author and checks feed
  const followRes = await j(`/api/users/${authorName}/follow`, { token: viewTok, method: 'POST' });
  check('viewer follows author', followRes.status === 200 && followRes.data.followed === true);

  const viewerFeedAfter = await j('/api/stories/feed', { token: viewTok });
  const authorGroup = viewerFeedAfter.data.groups?.find((g) => g.author.id === authorUser.id);
  check('follower sees author story group', !!authorGroup);
  check('author story hasUnseen is true', authorGroup?.hasUnseen === true);
  const targetStory = authorGroup?.stories?.find((s) => s.id === story.id);
  check('story viewed is false for follower', targetStory?.viewed === false);

  // 7. Viewer views the story
  const viewRes = await j(`/api/stories/${story.id}/view`, { token: viewTok, method: 'POST' });
  check('story view recorded', viewRes.status === 200 && viewRes.data.ok === true);

  const viewerFeedSeen = await j('/api/stories/feed', { token: viewTok });
  const authorGroupSeen = viewerFeedSeen.data.groups?.find((g) => g.author.id === authorUser.id);
  check('author story hasUnseen is false after viewing', authorGroupSeen?.hasUnseen === false);
  const targetStorySeen = authorGroupSeen?.stories?.find((s) => s.id === story.id);
  check('story viewed is true after viewing', targetStorySeen?.viewed === true);

  // 8. Views list authorization
  const viewerForbiddenViews = await j(`/api/stories/${story.id}/views`, { token: viewTok });
  check('non-author forbidden from viewing story views list', viewerForbiddenViews.status === 403);

  const authorViews = await j(`/api/stories/${story.id}/views`, { token: authTok });
  check('author can access views list', authorViews.status === 200 && Array.isArray(authorViews.data.viewers));
  check(
    'author sees viewer in views list',
    authorViews.data.viewers?.some((v) => v.id === viewerUser.id && v.username === viewerName)
  );

  // 9. Delete story authorization & removal
  const nonAuthorDelete = await j(`/api/stories/${story.id}`, { token: viewTok, method: 'DELETE' });
  check('non-author cannot delete story', nonAuthorDelete.status === 403);

  const authorDelete = await j(`/api/stories/${story.id}`, { token: authTok, method: 'DELETE' });
  check('author can delete story', authorDelete.status === 200 && authorDelete.data.ok === true);

  const authorFeedAfterDel = await j('/api/stories/feed', { token: authTok });
  check('deleted story no longer in feed', !authorFeedAfterDel.data.groups?.some((g) => g.stories?.some((s) => s.id === story.id)));

  // 10. Avatar Hue customization
  const updateHue = await j('/api/me', { token: authTok, method: 'PATCH', body: { avatarHue: 195 } });
  check('avatar hue updated via PATCH /me', updateHue.status === 200 && updateHue.data.user.avatarHue === 195);

  const getMe = await j('/api/me', { token: authTok });
  check('GET /api/me reflects updated avatarHue', getMe.status === 200 && getMe.data.user.avatarHue === 195);

  const clampHue = await j('/api/me', { token: authTok, method: 'PATCH', body: { avatarHue: 750 } });
  check('avatar hue clamped to 360', clampHue.status === 200 && clampHue.data.user.avatarHue === 360);

  log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails === 0 ? 0 : 1);
})();
