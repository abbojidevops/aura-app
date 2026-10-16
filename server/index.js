// AURA API + static server. One process serves the API (/api), uploaded media (/uploads),
// and the built React app (client/dist). Run: npm run build && npm start
// Requires DATABASE_URL (PostgreSQL). See README.
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const realtime = require('./realtime');
const { mediaUrl, MEDIA_BASE } = require('./urls');
const multer = require('multer');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const db = require('./db');
const { hashPassword, verifyPassword, createSession, requireAuth } = require('./auth');
const media = require('./media');
const storage = require('./storage');
const { POST_SELECT, VISIBLE, attachTags, serializePost, getVisiblePost, feedFor, extractTags, MOODS, getFeedSettings, saveFeedSettings } = require('./feed');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
const TMP = path.join(media.UPLOADS, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

const bad = (res, error) => res.status(400).json({ error });
const notFound = (res, what = 'Not found') => res.status(404).json({ error: what });

// Wrap async route handlers so rejections reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function userPublic(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, bio: u.bio, avatarHue: u.avatar_hue, isPrivate: !!u.is_private, isAdmin: !!u.is_admin, createdAt: u.created_at };
}

async function counts(userId) {
  return db.get(`SELECT
      (SELECT COUNT(*) FROM posts WHERE user_id = @id AND status = 'published') AS posts,
      (SELECT COUNT(*) FROM follows WHERE following_id = @id) AS followers,
      (SELECT COUNT(*) FROM follows WHERE follower_id = @id) AS following`, { id: userId });
}

async function notify(recipientId, actorId, type, postId, conn = db) {
  if (recipientId === actorId) return;
  await conn.run('INSERT INTO notifications (user_id, actor_id, type, post_id) VALUES (?, ?, ?, ?)', [recipientId, actorId, type, postId ?? null]);
  realtime.publish([recipientId], { type: 'notification' });
}

function findUserByUsername(username) {
  return db.get('SELECT * FROM users WHERE username = lower(?)', [String(username)]);
}

const upload = multer({
  dest: TMP,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB ceiling; per-type limits are checked after upload
});

const app = express();
app.set('trust proxy', 1);

const mediaSources = ["'self'", 'data:', 'blob:'];
if (MEDIA_BASE) {
  try {
    const origin = new URL(MEDIA_BASE).origin;
    if (!mediaSources.includes(origin)) mediaSources.push(origin);
  } catch {
    if (!mediaSources.includes(MEDIA_BASE)) mediaSources.push(MEDIA_BASE);
  }
}

app.use(
  helmet({
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' },
    xFrameOptions: { action: 'deny' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: mediaSources,
        mediaSrc: mediaSources,
        connectSrc: ["'self'", 'ws:', 'wss:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(express.json({ limit: '100kb' }));
// Media files are named by post ID, and IDs are never reused, so they can be cached for a long time.
// A CDN in front of this path caches them at the edge.
app.use('/uploads', express.static(media.UPLOADS, { maxAge: '30d', immutable: true, etag: true }));
app.get('/healthz', wrap(async (req, res) => {
  await db.get('SELECT 1 AS ok');
  // ready: seeding finished and no media jobs are pending. Test harnesses and deploy checks wait for this.
  const ready = require('./seed').state.done && media.idle();
  res.json({ ok: true, ready, realtime: '/ws', media: MEDIA_BASE || 'local' });
}));

// ---------- Auth (public) ----------
const auth = express.Router();

const createAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (req, res) => res.status(429).json({ error: 'Too many attempts. Try again later.' }),
  });

const registerLimiter = createAuthLimiter();
const loginLimiter = createAuthLimiter();

auth.post('/register', registerLimiter, wrap(async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || '').trim().slice(0, 40) || username;
  if (!/^[a-z0-9._]{3,24}$/.test(username)) return bad(res, 'Username must be 3–24 characters: letters, numbers, dots or underscores.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Please enter a valid email address.');
  if (password.length < 8) return bad(res, 'Password must be at least 8 characters.');
  try {
    const user = await db.get(
      'INSERT INTO users (username, display_name, email, password_hash, avatar_hue) VALUES (?, ?, ?, ?, ?) RETURNING *',
      [username, displayName, email, hashPassword(password), Math.floor(Math.random() * 360)]
    );
    res.status(201).json({ token: await createSession(user.id), user: userPublic(user) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That username or email is already taken.' });
    throw err;
  }
}));

auth.post('/login', loginLimiter, wrap(async (req, res) => {
  const identifier = String(req.body?.identifier || '').trim();
  const password = String(req.body?.password || '');
  const user = await db.get('SELECT * FROM users WHERE username = lower(?) OR lower(email) = lower(?)', [identifier, identifier]);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username/email or password.' });
  }
  if (user.suspended_at) {
    return res.status(403).json({ error: 'Your account has been suspended.' });
  }
  res.json({ token: await createSession(user.id), user: userPublic(user) });
}));

// ---------- Everything below requires a session ----------
const api = express.Router();
api.use(requireAuth);
const me = (req) => req.user.id;

api.post('/auth/logout', wrap(async (req, res) => {
  await db.run('DELETE FROM sessions WHERE token = ?', [req.token]);
  realtime.closeSession(req.token);
  res.json({ ok: true });
}));

api.get('/me', wrap(async (req, res) => {
  res.json({ user: userPublic(req.user), counts: await counts(me(req)) });
}));

api.patch('/me', wrap(async (req, res) => {
  const current = req.user;
  const displayName = req.body?.displayName !== undefined ? String(req.body.displayName).trim().slice(0, 40) : current.display_name;
  const bio = req.body?.bio !== undefined ? String(req.body.bio).slice(0, 160) : current.bio;
  const isPrivate = req.body?.isPrivate !== undefined ? (req.body.isPrivate ? 1 : 0) : current.is_private;
  if (!displayName) return bad(res, 'Display name cannot be empty.');
  const updated = await db.get(
    'UPDATE users SET display_name = ?, bio = ?, is_private = ? WHERE id = ? RETURNING *',
    [displayName, bio, isPrivate, current.id]
  );
  res.json({ user: userPublic(updated) });
}));

api.delete('/me', wrap(async (req, res) => {
  const password = String(req.body?.password || '');
  if (!password || !verifyPassword(password, req.user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  const userId = me(req);

  // Collect the user's post IDs first (media files deleted only AFTER db.tx commit)
  const userPosts = await db.all('SELECT id FROM posts WHERE user_id = ?', [userId]);
  const postIds = userPosts.map((p) => p.id);

  // Collect active sessions to close after commit
  const sessions = await db.all('SELECT token FROM sessions WHERE user_id = ?', [userId]);

  // Database cleanup in transaction
  await db.tx(async (t) => {
    // Test hook: simulated DB failure during deletion to verify storage & user are untouched
    if (req.headers['x-test-fail-db'] === '1' || req.body?.simulateDbError) {
      throw new Error('Simulated DB failure during deletion');
    }

    // Keep like_count accurate on posts liked by this user
    await t.run(`
      UPDATE posts p
      SET like_count = GREATEST(like_count - 1, 0)
      WHERE p.user_id != ? AND p.id IN (SELECT post_id FROM likes WHERE user_id = ?)
    `, [userId, userId]);

    // Keep comment_count accurate on posts commented on by this user
    await t.run(`
      UPDATE posts p
      SET comment_count = (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.user_id != ?)
      WHERE p.user_id != ? AND p.id IN (SELECT post_id FROM comments WHERE user_id = ?)
    `, [userId, userId, userId]);

    // Delete messages sent by this user
    await t.run('DELETE FROM messages WHERE sender_id = ?', [userId]);

    // Select the conversation IDs this user belongs to before removing membership
    const userConvos = await t.all('SELECT conversation_id FROM conversation_members WHERE user_id = ?', [userId]);
    const userConvoIds = userConvos.map((c) => c.conversation_id);

    // Remove user from conversation membership (keeps conversations for other participants)
    await t.run('DELETE FROM conversation_members WHERE user_id = ?', [userId]);

    // Clean up empty conversations where no members remain, scoped ONLY to the deleting user's conversations
    if (userConvoIds.length > 0) {
      const placeholders = userConvoIds.map(() => '?').join(',');
      await t.run(
        `DELETE FROM conversations WHERE id IN (${placeholders}) AND id NOT IN (SELECT conversation_id FROM conversation_members)`,
        userConvoIds
      );
    }

    // Delete the user record (cascades to posts, post_tags, likes, comments, follows, saves, notifications, sessions, follow_requests, user_feed_settings, reports, admin_actions)
    await t.run('DELETE FROM users WHERE id = ?', [userId]);
  });

  // Realtime: close all active websocket sessions for this user (after commit)
  for (const s of sessions) {
    realtime.closeSession(s.token);
  }

  // Storage cleanup: delete media files for all user's posts ONLY after db.tx commit
  for (const postId of postIds) {
    try {
      if (req.headers['x-test-fail-storage'] === '1' || req.headers['x-test-fail-storage'] === String(postId) || req.body?.simulateStorageError) {
        throw new Error(`Simulated storage delete failure for post ${postId}`);
      }
      await storage.deletePost(postId);
    } catch (err) {
      console.error(`[storage] delete post ${postId}:`, err.message);
      try {
        await db.run(
          'INSERT INTO storage_cleanup (post_id, created_at) VALUES (?, ?) ON CONFLICT (post_id) DO NOTHING',
          [String(postId), new Date().toISOString()]
        );
      } catch (insertErr) {
        console.error(`[storage] record cleanup failure for post ${postId}:`, insertErr.message);
      }
    }
  }

  res.json({ ok: true });
}));

api.get('/me/follow-requests', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT fr.created_at, u.id, u.username, u.display_name, u.avatar_hue, u.bio
    FROM follow_requests fr
    JOIN users u ON u.id = fr.requester_id
    WHERE fr.target_id = ?
    ORDER BY fr.created_at DESC`, [me(req)]);
  const requests = rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    avatarHue: r.avatar_hue,
    bio: r.bio,
    createdAt: r.created_at,
    user: {
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarHue: r.avatar_hue,
      bio: r.bio,
    },
  }));
  res.json({ requests, items: requests });
}));

api.post('/me/follow-requests/:username/accept', wrap(async (req, res) => {
  const requester = await findUserByUsername(req.params.username);
  if (!requester) return notFound(res, 'Account not found.');
  const fr = await db.get('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?', [requester.id, me(req)]);
  if (!fr) return notFound(res, 'Follow request not found.');
  await db.tx(async (t) => {
    await t.run('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?', [requester.id, me(req)]);
    await t.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [requester.id, me(req)]);
    await t.run("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND actor_id = ? AND type = 'follow_request'", [me(req), requester.id]);
  });
  res.json({ ok: true, followed: true });
}));

api.post('/me/follow-requests/:username/decline', wrap(async (req, res) => {
  const requester = await findUserByUsername(req.params.username);
  if (!requester) return notFound(res, 'Account not found.');
  const r = await db.run('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?', [requester.id, me(req)]);
  if (!r.changes) return notFound(res, 'Follow request not found.');
  await db.run("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND actor_id = ? AND type = 'follow_request'", [me(req), requester.id]);
  res.json({ ok: true });
}));

api.get('/me/export', wrap(async (req, res) => {
  const uid = me(req);
  const data = {
    exportedAt: new Date().toISOString(),
    account: { ...userPublic(req.user), email: req.user.email },
    posts: await db.all('SELECT id, caption, media_type, visibility, status, created_at FROM posts WHERE user_id = ?', [uid]),
    comments: await db.all('SELECT post_id, body, created_at FROM comments WHERE user_id = ?', [uid]),
    likes: await db.all('SELECT post_id, created_at FROM likes WHERE user_id = ?', [uid]),
    saves: await db.all('SELECT post_id, created_at FROM saves WHERE user_id = ?', [uid]),
    following: await db.all('SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ?', [uid]),
    followers: await db.all('SELECT u.username, f.created_at FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ?', [uid]),
    messagesSent: await db.all('SELECT conversation_id, body, created_at FROM messages WHERE sender_id = ?', [uid]),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="aura-export.json"');
  res.json(data);
}));

api.post('/me/password', wrap(async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!currentPassword || !verifyPassword(currentPassword, req.user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (newPassword.length < 8) {
    return bad(res, 'New password must be at least 8 characters.');
  }
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(newPassword), me(req)]);
  res.json({ ok: true });
}));

api.get('/me/sessions', wrap(async (req, res) => {
  const currentToken = req.token;
  const rows = await db.all(
    'SELECT created_at, (token = ?) AS is_current FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
    [currentToken, me(req)]
  );
  res.json({ sessions: rows, count: rows.length });
}));

api.post('/me/sessions/revoke-others', wrap(async (req, res) => {
  const currentToken = req.token;
  const otherSessions = await db.all(
    'SELECT token FROM sessions WHERE user_id = ? AND token != ?',
    [me(req), currentToken]
  );
  for (const s of otherSessions) {
    realtime.closeSession(s.token);
  }
  await db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [me(req), currentToken]);
  res.json({ ok: true, revoked: otherSessions.length });
}));

api.get('/me/saved', wrap(async (req, res) => {
  const viewerId = me(req);
  const rows = await db.all(`${POST_SELECT}
    JOIN saves s ON s.post_id = p.id AND s.user_id = @me
    WHERE p.status = 'published' AND ${VISIBLE}
    ORDER BY s.created_at DESC LIMIT 60`, { me: viewerId });
  await attachTags(rows);
  res.json({ posts: rows.map(serializePost) });
}));

// ----- Feed settings: mood mode and transparent slider weights -----
api.get('/me/feed-settings', wrap(async (req, res) => {
  res.json({ settings: await getFeedSettings(me(req)), moods: Object.entries(MOODS).map(([id, m]) => ({ id, label: m.label })) });
}));

api.patch('/me/feed-settings', wrap(async (req, res) => {
  const current = await getFeedSettings(me(req));
  const mood = req.body?.mood ?? current.mood;
  if (!MOODS[mood]) return bad(res, 'Unknown mood.');
  const pick = (key) => {
    if (req.body?.[key] === undefined) return current[key];
    const n = Number(req.body[key]);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
  };
  const next = { mood, friends: pick('friends'), newCreators: pick('newCreators'), controversial: pick('controversial') };
  if ([next.friends, next.newCreators, next.controversial].includes(null)) return bad(res, 'Slider values must be numbers from 0 to 100.');
  res.json({ settings: await saveFeedSettings(me(req), next) });
}));

// ----- Feed & discovery -----
api.get('/feed', wrap(async (req, res) => {
  const mode = ['home', 'following', 'reels', 'explore'].includes(req.query.mode) ? req.query.mode : 'home';
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  const limit = Math.min(30, parseInt(req.query.limit, 10) || 12);
  res.json(await feedFor(me(req), mode, { limit, offset }));
}));

api.get('/explore', wrap(async (req, res) => {
  const raw = String(req.query.q || '').trim().slice(0, 60);
  if (!raw) {
    const trending = (await feedFor(me(req), 'explore', { limit: 30 })).items;
    const tags = await db.all(`
      SELECT pt.tag AS tag, COUNT(*) AS count FROM post_tags pt JOIN posts p ON p.id = pt.post_id
      WHERE p.status = 'published' AND p.created_at >= now() - interval '7 days'
      GROUP BY pt.tag ORDER BY count DESC, pt.tag LIMIT 12`);
    const suggested = await db.all(`
      SELECT u.id, u.username, u.display_name, u.avatar_hue, u.bio,
        (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS followers
      FROM users u
      WHERE u.id != @me
        AND u.suspended_at IS NULL
        AND u.id NOT IN (SELECT following_id FROM follows WHERE follower_id = @me)
      ORDER BY followers DESC, u.id DESC
      LIMIT 8`, { me: me(req) });
    const suggestedUsers = suggested.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.display_name,
      avatarHue: u.avatar_hue,
      bio: u.bio,
      followers: u.followers,
    }));
    return res.json({ users: [], posts: trending, tags, suggestedUsers });
  }
  const like = `%${raw.replace(/[%_]/g, '')}%`;
  const tag = raw.replace(/^#/, '').toLowerCase();
  const users = (await db.all(`SELECT id, username, display_name, avatar_hue, bio FROM users
    WHERE username ILIKE ? OR display_name ILIKE ? ORDER BY username LIMIT 12`, [like, like]))
    .map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, avatarHue: u.avatar_hue, bio: u.bio }));
  const rows = await db.all(`${POST_SELECT}
    WHERE p.status = 'published' AND ${VISIBLE}
      AND (p.caption ILIKE @like OR p.id IN (SELECT post_id FROM post_tags WHERE tag = @tag))
    ORDER BY p.like_count DESC, p.created_at DESC LIMIT 60`, { me: me(req), like, tag });
  await attachTags(rows);
  res.json({ users, posts: rows.map(serializePost), tags: [] });
}));

// ----- Posts -----
api.post('/posts', upload.single('media'), wrap(async (req, res) => {
  const file = req.file;
  const cleanup = () => file && fs.rm(file.path, { force: true }, () => {});
  if (!file) return bad(res, 'Choose a photo or video to share.');
  const isImage = IMAGE_TYPES.includes(file.mimetype);
  const isVideo = VIDEO_TYPES.includes(file.mimetype);
  if (!isImage && !isVideo) { cleanup(); return bad(res, 'Unsupported file. Use JPG, PNG, WebP, GIF, MP4, MOV or WebM.'); }
  if (isImage && file.size > 20 * 1024 * 1024) { cleanup(); return bad(res, 'Photos must be 20 MB or smaller.'); }
  const visibility = ['public', 'followers', 'private'].includes(req.body?.visibility) ? req.body.visibility : 'public';
  const caption = String(req.body?.caption || '').slice(0, 2200);
  const mediaType = isVideo ? 'video' : 'image';

  const postId = await db.tx(async (t) => {
    const row = await t.get(
      'INSERT INTO posts (user_id, caption, media_type, visibility, status) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [me(req), caption, mediaType, visibility, 'processing']
    );
    for (const tag of extractTags(caption)) {
      await t.run('INSERT INTO post_tags (post_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING', [row.id, tag]);
    }
    return row.id;
  });

  media.enqueueProcessing(postId, file.path, mediaType);
  res.status(202).json({ post: serializePost(await getVisiblePost(me(req), postId)) });
}));

api.get('/posts/:id', wrap(async (req, res) => {
  const post = await getVisiblePost(me(req), Number(req.params.id));
  if (!post) return notFound(res, 'This post is unavailable.');
  res.json({ post: serializePost(post) });
}));

api.delete('/posts/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.get('SELECT user_id FROM posts WHERE id = ?', [id]);
  if (!row) return notFound(res, 'Post not found.');
  if (row.user_id !== me(req)) return res.status(403).json({ error: 'You can only delete your own posts.' });
  await db.run('DELETE FROM posts WHERE id = ?', [id]);
  await storage.deletePost(id).catch((err) => console.error(`[storage] delete post ${id}: ${err.message}`));
  res.json({ ok: true });
}));

api.patch('/posts/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const row = await db.get('SELECT user_id FROM posts WHERE id = ?', [id]);
  if (!row) return notFound(res, 'Post not found.');
  if (row.user_id !== me(req)) return res.status(403).json({ error: 'You can only edit your own posts.' });
  const caption = String(req.body?.caption ?? '').slice(0, 2200);

  await db.tx(async (t) => {
    await t.run('UPDATE posts SET caption = ? WHERE id = ?', [caption, id]);
    await t.run('DELETE FROM post_tags WHERE post_id = ?', [id]);
    for (const tag of extractTags(caption)) {
      await t.run('INSERT INTO post_tags (post_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING', [id, tag]);
    }
  });

  const post = await getVisiblePost(me(req), id);
  res.json({ post: serializePost(post) });
}));

api.post('/posts/:id/like', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const post = await getVisiblePost(me(req), id);
  if (!post) return notFound(res, 'This post is unavailable.');
  await db.tx(async (t) => {
    const r = await t.run('INSERT INTO likes (user_id, post_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [me(req), id]);
    if (r.changes) {
      await t.run('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [id]);
      await notify(post.user_id, me(req), 'like', id, t);
    }
  });
  const row = await db.get('SELECT like_count FROM posts WHERE id = ?', [id]);
  res.json({ liked: true, likeCount: row.like_count });
}));

api.delete('/posts/:id/like', wrap(async (req, res) => {
  const id = Number(req.params.id);
  await db.tx(async (t) => {
    const r = await t.run('DELETE FROM likes WHERE user_id = ? AND post_id = ?', [me(req), id]);
    if (r.changes) {
      await t.run('UPDATE posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [id]);
      await t.run("DELETE FROM notifications WHERE type = 'like' AND actor_id = ? AND post_id = ?", [me(req), id]);
    }
  });
  const row = await db.get('SELECT like_count FROM posts WHERE id = ?', [id]);
  res.json({ liked: false, likeCount: row?.like_count ?? 0 });
}));

api.post('/posts/:id/save', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await getVisiblePost(me(req), id))) return notFound(res, 'This post is unavailable.');
  await db.run('INSERT INTO saves (user_id, post_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [me(req), id]);
  res.json({ saved: true });
}));

api.delete('/posts/:id/save', wrap(async (req, res) => {
  await db.run('DELETE FROM saves WHERE user_id = ? AND post_id = ?', [me(req), Number(req.params.id)]);
  res.json({ saved: false });
}));

api.get('/posts/:id/comments', wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await getVisiblePost(me(req), id))) return notFound(res, 'This post is unavailable.');
  const rows = await db.all(`SELECT c.id, c.body, c.created_at, u.id AS uid, u.username, u.display_name, u.avatar_hue
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 200`, [id]);
  res.json({ comments: rows.map((c) => ({
    id: c.id, body: c.body, createdAt: c.created_at,
    author: { id: c.uid, username: c.username, displayName: c.display_name, avatarHue: c.avatar_hue },
  })) });
}));

api.post('/posts/:id/comments', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const post = await getVisiblePost(me(req), id);
  if (!post) return notFound(res, 'This post is unavailable.');
  const body = String(req.body?.body || '').trim();
  if (!body) return bad(res, 'Write something before posting.');
  if (body.length > 500) return bad(res, 'Comments can be up to 500 characters.');
  await db.tx(async (t) => {
    await t.run('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)', [id, me(req), body]);
    await t.run('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [id]);
    await notify(post.user_id, me(req), 'comment', id, t);
  });
  res.status(201).json({ ok: true });
}));

api.delete('/posts/:id/comments/:commentId', wrap(async (req, res) => {
  const postId = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const comment = await db.get('SELECT id, user_id, post_id FROM comments WHERE id = ? AND post_id = ?', [commentId, postId]);
  if (!comment) return notFound(res, 'Comment not found.');
  const post = await db.get('SELECT user_id FROM posts WHERE id = ?', [postId]);
  if (!post) return notFound(res, 'Post not found.');

  if (comment.user_id !== me(req) && post.user_id !== me(req)) {
    return res.status(403).json({ error: 'You cannot delete this comment.' });
  }

  await db.tx(async (t) => {
    await t.run('DELETE FROM comments WHERE id = ?', [commentId]);
    await t.run('UPDATE posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?', [postId]);
  });

  res.json({ ok: true });
}));

// Reports: three distinct reports automatically hide a post pending human review.
api.post('/posts/:id/report', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const post = await getVisiblePost(me(req), id);
  if (!post) return notFound(res, 'This post is unavailable.');
  if (post.user_id === me(req)) return bad(res, 'You cannot report your own post.');
  const reason = String(req.body?.reason || 'other').slice(0, 40);
  await db.run('INSERT INTO reports (reporter_id, post_id, reason) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [me(req), id, reason]);
  const { n } = await db.get('SELECT COUNT(*) AS n FROM reports WHERE post_id = ?', [id]);
  if (n >= 3) await db.run("UPDATE posts SET status = 'hidden' WHERE id = ? AND status = 'published'", [id]);
  res.json({ ok: true, message: 'Thanks. We will review this post.' });
}));

// ----- Users, profiles, follows -----
api.get('/users/:username', wrap(async (req, res) => {
  const user = await findUserByUsername(req.params.username);
  if (!user) return notFound(res, 'This account doesn’t exist.');
  const viewer = me(req);
  const isMe = user.id === viewer;
  const followed = !!(await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewer, user.id]));
  const locked = !!user.is_private && !isMe && !followed;
  const requested = !followed && !!(await db.get('SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?', [viewer, user.id]));
  let posts = [];
  if (!locked) {
    const statuses = isMe ? "('published','processing','hidden')" : "('published')";
    const rows = await db.all(`${POST_SELECT}
      WHERE p.user_id = @uid AND p.status IN ${statuses} AND ${VISIBLE}
      ORDER BY p.created_at DESC LIMIT 60`, { me: viewer, uid: user.id });
    await attachTags(rows);
    posts = rows.map(serializePost);
  }
  res.json({
    user: { ...userPublic(user), ...(await counts(user.id)) },
    isMe, followed, locked, requested, posts,
  });
}));

api.post('/users/:username/follow', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target) return notFound(res, 'Account not found.');
  if (target.id === me(req)) return bad(res, 'You cannot follow yourself.');

  if (target.is_private) {
    const already = await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [me(req), target.id]);
    if (already) {
      return res.json({ followed: true, requested: false, followers: (await counts(target.id)).followers });
    }
    const r = await db.run('INSERT INTO follow_requests (requester_id, target_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [me(req), target.id]);
    if (r.changes) await notify(target.id, me(req), 'follow_request', null);
    return res.json({ followed: false, requested: true, followers: (await counts(target.id)).followers });
  }

  const r = await db.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [me(req), target.id]);
  if (r.changes) await notify(target.id, me(req), 'follow', null);
  res.json({ followed: true, requested: false, followers: (await counts(target.id)).followers });
}));

api.delete('/users/:username/follow', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target) return notFound(res, 'Account not found.');
  await db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [me(req), target.id]);
  await db.run('DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?', [me(req), target.id]);
  res.json({ followed: false, requested: false, followers: (await counts(target.id)).followers });
}));

api.get('/users/:username/followers', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target || target.suspended_at) return notFound(res, 'Account not found.');
  const viewerId = me(req);
  if (target.is_private && target.id !== viewerId) {
    const isFollowing = await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewerId, target.id]);
    if (!isFollowing) return res.status(403).json({ error: 'This account is private.' });
  }
  const rows = await db.all(`
    SELECT u.id, u.username, u.display_name, u.avatar_hue, u.bio,
      EXISTS(SELECT 1 FROM follows WHERE follower_id = @me AND following_id = u.id) AS followed,
      EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = @me AND target_id = u.id) AS requested
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    WHERE f.following_id = @targetId AND u.suspended_at IS NULL
    ORDER BY f.created_at DESC LIMIT 100`, { me: viewerId, targetId: target.id });
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarHue: r.avatar_hue,
      bio: r.bio,
      followed: !!r.followed,
      requested: !!r.requested,
      isMe: r.id === viewerId,
    })),
  });
}));

api.get('/users/:username/following', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target || target.suspended_at) return notFound(res, 'Account not found.');
  const viewerId = me(req);
  if (target.is_private && target.id !== viewerId) {
    const isFollowing = await db.get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', [viewerId, target.id]);
    if (!isFollowing) return res.status(403).json({ error: 'This account is private.' });
  }
  const rows = await db.all(`
    SELECT u.id, u.username, u.display_name, u.avatar_hue, u.bio,
      EXISTS(SELECT 1 FROM follows WHERE follower_id = @me AND following_id = u.id) AS followed,
      EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = @me AND target_id = u.id) AS requested
    FROM follows f
    JOIN users u ON u.id = f.following_id
    WHERE f.follower_id = @targetId AND u.suspended_at IS NULL
    ORDER BY f.created_at DESC LIMIT 100`, { me: viewerId, targetId: target.id });
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarHue: r.avatar_hue,
      bio: r.bio,
      followed: !!r.followed,
      requested: !!r.requested,
      isMe: r.id === viewerId,
    })),
  });
}));

// ----- Notifications -----
api.get('/notifications', wrap(async (req, res) => {
  const rows = await db.all(`SELECT n.id, n.type, n.is_read, n.created_at, n.post_id,
      u.id AS uid, u.username, u.display_name, u.avatar_hue, p.thumb_url
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN posts p ON p.id = n.post_id
    WHERE n.user_id = ? ORDER BY n.id DESC LIMIT 50`, [me(req)]);
  const { n: unread } = await db.get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0', [me(req)]);
  res.json({
    unread,
    items: rows.map((r) => ({
      id: r.id, type: r.type, read: !!r.is_read, createdAt: r.created_at, postId: r.post_id, thumbUrl: mediaUrl(r.thumb_url),
      actor: { id: r.uid, username: r.username, displayName: r.display_name, avatarHue: r.avatar_hue },
    })),
  });
}));

api.post('/notifications/read', wrap(async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [me(req)]);
  res.json({ ok: true });
}));

// ----- Direct messages (polled every few seconds; WebSockets are the next step) -----
api.get('/messages', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT c.id, u.id AS uid, u.username, u.display_name, u.avatar_hue,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.id > cm.last_read_id AND m.sender_id != @me) AS unread
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    LEFT JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id != @me
    LEFT JOIN users u ON u.id = cm2.user_id
    WHERE cm.user_id = @me
    ORDER BY last_at DESC NULLS LAST`, { me: me(req) });
  res.json({
    conversations: rows.map((r) => ({
      id: r.id, lastBody: r.last_body, lastAt: r.last_at, unread: r.unread,
      user: r.uid
        ? { id: r.uid, username: r.username, displayName: r.display_name, avatarHue: r.avatar_hue }
        : { id: null, username: 'deleted', displayName: 'Deleted account', avatarHue: 260 },
    })),
  });
}));

api.post('/messages/start', wrap(async (req, res) => {
  const target = await findUserByUsername(String(req.body?.username || ''));
  if (!target) return notFound(res, 'Account not found.');
  if (target.id === me(req)) return bad(res, 'You cannot message yourself.');
  const existing = await db.get(`SELECT c.id FROM conversations c
    JOIN conversation_members a ON a.conversation_id = c.id AND a.user_id = ?
    JOIN conversation_members b ON b.conversation_id = c.id AND b.user_id = ?
    LIMIT 1`, [me(req), target.id]);
  if (existing) return res.json({ id: existing.id });
  const id = await db.tx(async (t) => {
    const c = await t.get('INSERT INTO conversations DEFAULT VALUES RETURNING id');
    await t.run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)', [c.id, me(req), c.id, target.id]);
    return c.id;
  });
  res.status(201).json({ id });
}));

async function assertMember(req, res) {
  const id = Number(req.params.id);
  const ok = await db.get('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [id, me(req)]);
  if (!ok) { notFound(res, 'Conversation not found.'); return null; }
  return id;
}

api.get('/messages/:id', wrap(async (req, res) => {
  const id = await assertMember(req, res);
  if (!id) return;
  const after = Number(req.query.after || 0);
  const msgs = await db.all('SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT 200', [id, after]);
  if (msgs.length) {
    const last = msgs[msgs.length - 1].id;
    await db.run('UPDATE conversation_members SET last_read_id = GREATEST(last_read_id, ?) WHERE conversation_id = ? AND user_id = ?', [last, id, me(req)]);
  }
  res.json({ messages: msgs.map((m) => ({ id: m.id, mine: m.sender_id === me(req), body: m.body, createdAt: m.created_at })) });
}));

api.post('/messages/:id', wrap(async (req, res) => {
  const id = await assertMember(req, res);
  if (!id) return;
  const body = String(req.body?.body || '').trim();
  if (!body) return bad(res, 'Message cannot be empty.');
  if (body.length > 1000) return bad(res, 'Messages can be up to 1000 characters.');
  const row = await db.get('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?) RETURNING id', [id, me(req), body]);
  // Tell both members to refetch. The event carries IDs only, never message text.
  const members = await db.all('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [id]);
  realtime.publish(members.map((m) => m.user_id), { type: 'message', conversationId: id });
  res.status(201).json({ id: row.id });
}));

// ----- Admin moderation tools -----
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

const admin = express.Router();
admin.use(requireAdmin);

admin.get('/reports', wrap(async (req, res) => {
  const rows = await db.all(`
    SELECT p.*, u.username, u.display_name, u.avatar_hue,
      COUNT(r.reporter_id) AS report_count,
      array_agg(r.reason ORDER BY r.created_at DESC) AS reasons,
      MAX(r.created_at) AS latest_report_at
    FROM posts p
    JOIN users u ON u.id = p.user_id
    JOIN reports r ON r.post_id = p.id
    GROUP BY p.id, u.id
    ORDER BY latest_report_at DESC, p.created_at DESC
  `);
  const reportsList = rows.map((r) => ({
    id: r.id,
    caption: r.caption,
    mediaType: r.media_type,
    mediaUrl: mediaUrl(r.media_url),
    thumbUrl: mediaUrl(r.thumb_url),
    status: r.status,
    createdAt: r.created_at,
    reportCount: Number(r.report_count),
    reasons: Array.isArray(r.reasons) ? r.reasons : (r.reasons ? [r.reasons] : []),
    author: {
      id: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarHue: r.avatar_hue,
    },
    post: {
      id: r.id,
      caption: r.caption,
      mediaType: r.media_type,
      mediaUrl: mediaUrl(r.media_url),
      thumbUrl: mediaUrl(r.thumb_url),
      status: r.status,
      createdAt: r.created_at,
    },
  }));
  res.json({ reports: reportsList, posts: reportsList, items: reportsList });
}));

admin.post('/posts/:id/restore', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const post = await db.get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return notFound(res, 'Post not found.');
  await db.run("UPDATE posts SET status = 'published' WHERE id = ?", [id]);
  await db.run('INSERT INTO admin_actions (admin_id, action, target) VALUES (?, ?, ?)', [me(req), 'restore', String(id)]);
  res.json({ ok: true, status: 'published' });
}));

admin.post('/posts/:id/remove', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const post = await db.get('SELECT * FROM posts WHERE id = ?', [id]);
  if (!post) return notFound(res, 'Post not found.');
  await db.run("UPDATE posts SET status = 'hidden' WHERE id = ?", [id]);
  await db.run('INSERT INTO admin_actions (admin_id, action, target) VALUES (?, ?, ?)', [me(req), 'remove', String(id)]);
  res.json({ ok: true, status: 'hidden' });
}));

admin.post('/users/:username/suspend', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target) return notFound(res, 'User not found.');
  await db.run('UPDATE users SET suspended_at = now() WHERE id = ?', [target.id]);
  await db.run('INSERT INTO admin_actions (admin_id, action, target) VALUES (?, ?, ?)', [me(req), 'suspend', target.username]);
  res.json({ ok: true, suspended: true });
}));

admin.post('/users/:username/unsuspend', wrap(async (req, res) => {
  const target = await findUserByUsername(req.params.username);
  if (!target) return notFound(res, 'User not found.');
  await db.run('UPDATE users SET suspended_at = NULL WHERE id = ?', [target.id]);
  await db.run('INSERT INTO admin_actions (admin_id, action, target) VALUES (?, ?, ?)', [me(req), 'unsuspend', target.username]);
  res.json({ ok: true, suspended: false });
}));

api.use('/admin', admin);

app.use('/api/auth', auth);
app.use('/api', api);
app.use('/api', (req, res) => notFound(res, 'Unknown API route'));

// ----- Serve the built frontend (single-page app fallback) -----
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
}

// ----- Errors -----
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : err.message });
  }
  if (err.type === 'entity.parse.failed') return bad(res, 'Invalid request body.');
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const PORT = Number(process.env.PORT) || 3000;

(async () => {
  await db.init();
  await media.recoverStale();
  await storage.retryCleanup();
  const server = http.createServer(app);
  realtime.attach(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AURA running on http://0.0.0.0:${PORT}  (ffmpeg: ${media.hasFfmpeg ? 'yes' : 'no'}, database: postgres, realtime: /ws)`);
    require('./seed').seedIfEmpty().catch((e) => console.error('[seed]', e));
  });
})().catch((err) => {
  console.error('[startup] could not start:', err.message);
  process.exit(1);
});
