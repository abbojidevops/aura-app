const B = process.env.BASE_URL || 'http://localhost:3000';
const TMP = (await import('node:os')).tmpdir();
const log = (...a) => console.log(...a);
let fails = 0;
const check = (name, cond, extra = '') => { log(cond ? 'PASS' : 'FAIL', name, extra); if (!cond) fails++; };
async function j(path, { token, method = 'GET', body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(B + path, { method, headers, body: payload });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const demo = await j('/api/auth/login', { method: 'POST', body: { identifier: 'demo', password: 'demo1234' } });
check('demo login', demo.status === 200 && demo.data.token);
const T = demo.data.token;

const bad = await j('/api/auth/login', { method: 'POST', body: { identifier: 'demo', password: 'wrong' } });
check('wrong password rejected', bad.status === 401);
const noauth = await j('/api/feed');
check('feed requires auth', noauth.status === 401);

const home = await j('/api/feed?mode=home', { token: T });
check('home feed returns posts', home.data.items?.length > 0, `(${home.data.items?.length} items)`);
check('feed items carry reasons', home.data.items?.every((p) => Array.isArray(p.reasons) && p.reasons.length > 0));
const following = await j('/api/feed?mode=following', { token: T });
check('following feed only followed authors', following.data.items?.every((p) => p.author.followed));
const reels = await j('/api/feed?mode=reels', { token: T });
check('reels are videos only', reels.data.items?.every((p) => p.mediaType === 'video'));
check('reels exist after seed processing', reels.data.items?.length >= 3, `(${reels.data.items?.length})`);
const p1 = home.data.items.find((p) => p.mediaType === 'image') || home.data.items[0];
check('published media has URLs', !!p1.mediaUrl && p1.status === 'published');
const media = await fetch(p1.mediaUrl.startsWith("http") ? p1.mediaUrl : B + p1.mediaUrl);
check('media is served from /uploads', media.status === 200 && (media.headers.get('content-type') || '').includes('image'));

// Register a new user
const uname = 'e2e' + Math.floor(Math.random() * 1e6);
const reg = await j('/api/auth/register', { method: 'POST', body: { username: uname, email: `${uname}@test.dev`, password: 'password123', displayName: 'E2E Tester' } });
check('register new user', reg.status === 201 && reg.data.token, reg.data.error || '');
const T2 = reg.data.token;
const dup = await j('/api/auth/register', { method: 'POST', body: { username: uname, email: `${uname}b@test.dev`, password: 'password123' } });
check('duplicate username rejected', dup.status === 409);
const weak = await j('/api/auth/register', { method: 'POST', body: { username: uname + 'x', email: 'x@test.dev', password: 'short' } });
check('weak password rejected', weak.status === 400);

// Follow & profile
const f = await j(`/api/users/demo/follow`, { token: T2, method: 'POST' });
check('follow demo', f.status === 200 && f.data.followed === true);
const prof = await j('/api/users/demo', { token: T2 });
check('profile shows followed=true', prof.data.followed === true && prof.data.user.followers >= 1);
check('profile includes posts', prof.data.posts.length > 0);

// Like / unlike / save
const like = await j(`/api/posts/${p1.id}/like`, { token: T2, method: 'POST' });
check('like post', like.data.liked === true && like.data.likeCount >= 1);
const unlike = await j(`/api/posts/${p1.id}/like`, { token: T2, method: 'DELETE' });
check('unlike post', unlike.data.liked === false);
await j(`/api/posts/${p1.id}/like`, { token: T2, method: 'POST' });
const save = await j(`/api/posts/${p1.id}/save`, { token: T2, method: 'POST' });
check('save post', save.data.saved === true);
const saved = await j('/api/me/saved', { token: T2 });
check('saved list contains post', saved.data.posts.some((p) => p.id === p1.id));

// Comments
const c = await j(`/api/posts/${p1.id}/comments`, { token: T2, method: 'POST', body: { body: 'Love this! #design' } });
check('comment created', c.status === 201);
const cl = await j(`/api/posts/${p1.id}/comments`, { token: T2 });
check('comments listed', cl.data.comments.some((x) => x.body.startsWith('Love this')));
const empty = await j(`/api/posts/${p1.id}/comments`, { token: T2, method: 'POST', body: { body: '   ' } });
check('empty comment rejected', empty.status === 400);

// Notifications for demo
const notifs = await j('/api/notifications', { token: T });
check('demo has notifications (like/comment)', notifs.data.items.length > 0, `(${notifs.data.items.map((n) => n.type).join(',')})`);

// Upload a real video (3 seconds) and an image; poll until processed
const ffmpeg = process.env.FFMPEG || "ffmpeg";
const { execFileSync } = await import('node:child_process');
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', TMP + '/aura-e2e.mp4']);
const vform = new FormData();
vform.append('media', new Blob([(await import('node:fs')).readFileSync(TMP + '/aura-e2e.mp4')], { type: 'video/mp4' }), 'clip.mp4');
vform.append('caption', 'My first reel #test #e2e');
vform.append('visibility', 'public');
const up = await j('/api/posts', { token: T2, method: 'POST', form: vform });
check('video upload accepted (202 processing)', up.status === 202 && up.data.post.status === 'processing', up.data.error || '');
let vpost = up.data.post;
for (let i = 0; i < 40 && vpost.status === 'processing'; i++) { await sleep(1000); vpost = (await j(`/api/posts/${vpost.id}`, { token: T2 })).data.post; }
check('video processed to published', vpost.status === 'published', vpost.status);
check('video has mp4 + poster', vpost.mediaUrl?.endsWith('video.mp4') && !!vpost.thumbUrl);
check('video dims/duration detected', vpost.width === 640 && Math.round(vpost.duration) === 3, `${vpost.width}x${vpost.height} ${vpost.duration}s`);
const vfile = await fetch(vpost.mediaUrl.startsWith("http") ? vpost.mediaUrl : B + vpost.mediaUrl);
check('mp4 served with video type', vfile.status === 200 && (vfile.headers.get('content-type') || '').includes('video'));
check('tags extracted', vpost.tags.includes('test') && vpost.tags.includes('e2e'));

const ipng = new FormData();
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x7c3aed:s=800x600', '-frames:v', '1', TMP + '/aura-e2e.png']);
ipng.append('media', new Blob([(await import('node:fs')).readFileSync(TMP + '/aura-e2e.png')], { type: 'image/png' }), 'a.png');
ipng.append('caption', 'private note');
ipng.append('visibility', 'private');
const pimg = await j('/api/posts', { token: T2, method: 'POST', form: ipng });
check('image upload accepted', pimg.status === 202);
let ip = pimg.data.post;
for (let i = 0; i < 20 && ip.status === 'processing'; i++) { await sleep(500); ip = (await j(`/api/posts/${ip.id}`, { token: T2 })).data.post; }
check('image published', ip.status === 'published');
const hidden = await j(`/api/posts/${ip.id}`, { token: T });
check('private post hidden from others', hidden.status === 404);
const badType = new FormData();
badType.append('media', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
const bt = await j('/api/posts', { token: T2, method: 'POST', form: badType });
check('unsupported file type rejected', bt.status === 400);

// Explore & search
const ex = await j('/api/explore?q=design', { token: T });
check('search by caption/tag finds posts', ex.data.posts.length > 0, `(${ex.data.posts.length})`);
const exu = await j(`/api/explore?q=${uname.slice(0, 6)}`, { token: T });
check('search finds users', exu.data.users.some((u) => u.username === uname));
const trend = await j('/api/explore', { token: T });
check('explore shows trending tags', trend.data.tags.length > 0);

// Messages
const start = await j('/api/messages/start', { token: T, method: 'POST', body: { username: uname } });
check('start conversation', start.status === 201 || start.status === 200);
const cid = start.data.id;
const again = await j('/api/messages/start', { token: T2, method: 'POST', body: { username: 'demo' } });
check('conversation reused (no duplicates)', again.data.id === cid);
await j(`/api/messages/${cid}`, { token: T, method: 'POST', body: { body: 'hi from demo' } });
const inbox = await j('/api/messages', { token: T2 });
check('unread count shows for recipient', inbox.data.conversations[0].unread >= 1);
const thread = await j(`/api/messages/${cid}`, { token: T2 });
check('message delivered to recipient', thread.data.messages.some((m) => m.body === 'hi from demo' && !m.mine));
const stranger = await j(`/api/messages/${cid}`, { token: (await j('/api/auth/login', { method: 'POST', body: { identifier: 'calm.corner', password: 'demo1234' } })).data.token });
check('non-members cannot read thread', stranger.status === 404);

// Reports auto-hide after 3 distinct reporters
const rp = await j('/api/auth/login', { method: 'POST', body: { identifier: 'learn.ravi', password: 'demo1234' } });
const rr = await j(`/api/posts/${p1.id}/report`, { token: rp.data.token, method: 'POST', body: { reason: 'Spam' } });
check('report accepted', rr.status === 200);
const own = await j(`/api/posts/${vpost.id}/report`, { token: T2, method: 'POST', body: { reason: 'Spam' } });
check('cannot report own post', own.status === 400);

// Edit profile, export, logout
const patch = await j('/api/me', { token: T2, method: 'PATCH', body: { bio: 'Updated bio', isPrivate: true } });
check('profile edit saved', patch.data.user.bio === 'Updated bio' && patch.data.user.isPrivate === true);
const exp = await fetch(B + '/api/me/export', { headers: { Authorization: `Bearer ${T2}` } });
const expJson = await exp.json();
check('data export contains posts/comments/likes', expJson.posts.length >= 2 && expJson.comments.length >= 1 && expJson.likes.length >= 1);
check('export has attachment header', (exp.headers.get('content-disposition') || '').includes('attachment'));
const del = await j(`/api/posts/${ip.id}`, { token: T2, method: 'DELETE' });
check('owner can delete own post', del.data.ok === true);
const delOther = await j(`/api/posts/${p1.id}`, { token: T2, method: 'DELETE' });
check('cannot delete others\' posts', delOther.status === 403);
const out = await j('/api/auth/logout', { token: T2, method: 'POST' });
const after = await j('/api/me', { token: T2 });
check('logout invalidates session', out.data.ok && after.status === 401);

// SPA + 404s
const spa = await fetch(B + '/p/1');
check('SPA route serves index.html', spa.status === 200 && (await spa.text()).includes('id="root"'));
const apiMissing = await j('/api/nope', { token: T });
check('unknown API route returns 404 JSON', apiMissing.status === 404);

log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
