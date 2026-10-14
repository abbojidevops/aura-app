// Feed queries, visibility rules, and the recommendation ranker.
// Ranking is explainable: every item carries the reasons it was shown ("Why am I seeing this?").
const db = require('./db');
const { mediaUrl } = require('./urls');

// A post is visible to the viewer if: they own it, or it's public and the author is public,
// or they follow the author and the post is public/followers-only. Private posts are owner-only.
const FOLLOWED = 'EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = @me AND f.following_id = p.user_id)';
const VISIBLE = `(p.user_id = @me OR (p.visibility IN ('public','followers') AND ((u.is_private = 0 AND p.visibility = 'public') OR ${FOLLOWED})))`;

const POST_SELECT = `
SELECT p.*, u.username, u.display_name, u.avatar_hue, u.is_private AS author_private,
  EXISTS(SELECT 1 FROM likes WHERE user_id = @me AND post_id = p.id) AS liked,
  EXISTS(SELECT 1 FROM saves WHERE user_id = @me AND post_id = p.id) AS saved,
  ${FOLLOWED} AS followed
FROM posts p JOIN users u ON u.id = p.user_id`;

async function attachTags(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const tagRows = await db.all(
    `SELECT post_id, tag FROM post_tags WHERE post_id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const byPost = new Map();
  for (const t of tagRows) {
    if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
    byPost.get(t.post_id).push(t.tag);
  }
  for (const r of rows) r.tags = byPost.get(r.id) || [];
  return rows;
}

function serializePost(r) {
  return {
    id: r.id,
    caption: r.caption,
    mediaType: r.media_type,
    mediaUrl: mediaUrl(r.media_url),
    thumbUrl: mediaUrl(r.thumb_url),
    width: r.width,
    height: r.height,
    duration: r.duration,
    visibility: r.visibility,
    status: r.status,
    likeCount: r.like_count,
    commentCount: r.comment_count,
    liked: !!r.liked,
    saved: !!r.saved,
    tags: r.tags || [],
    createdAt: r.created_at,
    author: {
      id: r.user_id,
      username: r.username,
      displayName: r.display_name,
      avatarHue: r.avatar_hue,
      isPrivate: !!r.author_private,
      followed: !!r.followed,
    },
  };
}

async function getVisiblePost(me, id) {
  const row = await db.get(
    `${POST_SELECT} WHERE p.id = @id AND (p.status = 'published' OR p.user_id = @me) AND ${VISIBLE}`,
    { me, id }
  );
  if (!row) return null;
  return (await attachTags([row]))[0];
}

async function interestMap(me) {
  const rows = await db.all(`
    SELECT pt.tag AS tag, COUNT(*) AS c
    FROM likes l JOIN post_tags pt ON pt.post_id = l.post_id
    WHERE l.user_id = ? AND l.created_at >= now() - interval '90 days'
    GROUP BY pt.tag`, [me]);
  return new Map(rows.map((r) => [r.tag, r.c]));
}

// Mood modes map to topic tags. Each mode boosts posts whose tags fit it.
const MOODS = {
  inspire: { label: 'Inspire', tags: ['inspiration', 'art', 'design', 'photo', 'illustration', 'watercolor'] },
  educate: { label: 'Educate', tags: ['education', 'science', 'typography', 'design', 'explainer', 'learn'] },
  entertain: { label: 'Entertain', tags: ['comedy', 'funny', 'pets', 'humor'] },
  calm: { label: 'Calm', tags: ['calm', 'nature', 'wellbeing', 'breathe'] },
  trending: { label: 'Trending', tags: [] },
  interests: { label: 'My interests', tags: [] },
  surprise: { label: 'Surprise me', tags: [] },
};

async function getFeedSettings(me) {
  const row = await db.get('SELECT * FROM user_feed_settings WHERE user_id = ?', [me]);
  return row
    ? { mood: row.mood, friends: row.friends, newCreators: row.new_creators, controversial: row.controversial }
    : { mood: 'inspire', friends: 80, newCreators: 60, controversial: 10 };
}

async function saveFeedSettings(me, next) {
  await db.run(
    `INSERT INTO user_feed_settings (user_id, mood, friends, new_creators, controversial) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET mood = excluded.mood, friends = excluded.friends,
      new_creators = excluded.new_creators, controversial = excluded.controversial`,
    [me, next.mood, next.friends, next.newCreators, next.controversial]
  );
  return next;
}

// Score = your chosen mood + your slider weights + popularity + freshness, minus a penalty for reported posts.
// Every term that moved a post up or down becomes a human-readable reason.
async function rank(rows, me, settings) {
  const interests = await interestMap(me);
  const now = Date.now();
  const hourSeed = Math.floor(now / 3.6e6);
  const mood = MOODS[settings.mood] || MOODS.inspire;

  const ids = rows.map((r) => r.user_id);
  const followerCounts = new Map();
  const reportCounts = new Map();
  if (rows.length) {
    const uniqueAuthors = [...new Set(ids)];
    const q1 = await db.all(
      `SELECT following_id AS id, COUNT(*) AS n FROM follows WHERE following_id IN (${uniqueAuthors.map(() => '?').join(',')}) GROUP BY following_id`,
      uniqueAuthors
    );
    q1.forEach((r) => followerCounts.set(r.id, r.n));
    const postIds = rows.map((r) => r.id);
    const q2 = await db.all(
      `SELECT post_id AS id, COUNT(*) AS n FROM reports WHERE post_id IN (${postIds.map(() => '?').join(',')}) GROUP BY post_id`,
      postIds
    );
    q2.forEach((r) => reportCounts.set(r.id, r.n));
  }

  const scored = rows.map((row) => {
    const ageHours = (now - Date.parse(row.created_at + 'Z')) / 3.6e6;
    const matched = row.tags.filter((t) => interests.has(t));
    const interest = Math.min(matched.reduce((sum, t) => sum + Math.min(interests.get(t), 5) / 5, 0), 2);
    const moodHits = row.tags.filter((t) => mood.tags.includes(t));
    const followers = followerCounts.get(row.user_id) || 0;
    const reports = reportCounts.get(row.id) || 0;

    let score = 0;
    const reasons = [];

    if (row.user_id === me) reasons.push('Your post');

    // Friends slider: how much followed creators count.
    if (row.followed) {
      score += (settings.friends / 100) * 3;
      reasons.push(`You follow @${row.username}`);
    }
    // New-creators slider: small accounts get a lift.
    if (!row.followed && followers < 20 && row.user_id !== me) {
      score += (settings.newCreators / 100) * 2.5;
      reasons.push('New creator you haven’t seen much');
    }
    // Mood: fit with the chosen mode.
    if (moodHits.length) {
      score += 2.5;
      reasons.push(`Fits your ${mood.label} mode`);
    }
    if (mood === MOODS.trending) score += Math.log10(1 + row.like_count) * 2;
    if (mood === MOODS.surprise) {
      // Deterministic "random" per post per hour, so the shuffle stays stable while you scroll.
      const jitter = ((row.id * 9301 + hourSeed * 49297) % 233280) / 233280;
      score += jitter * 3;
      if (jitter > 0.7) reasons.push('Picked for a surprise');
    }
    if (mood === MOODS.interests && matched.length) score += 2;
    // Interest from your likes (applies in every mode).
    if (matched.length) {
      score += interest * 1.5;
      reasons.push(`Matches your interest in #${matched[0]}`);
    }
    score += Math.log10(1 + row.like_count) * 1.5;
    if (row.like_count >= 10) reasons.push('Popular right now');
    score += 2 * Math.exp(-ageHours / 36);
    if (ageHours < 24) reasons.push('Recently posted');

    // Controversial slider: reported posts sink in proportion to the slider.
    if (reports > 0) {
      score -= (settings.controversial / 100) * 3 * Math.min(reports, 3);
      reasons.unshift('Reported by others. Shown less');
    }

    if (!reasons.length) reasons.push('Trending across AURA');
    return { row, score, reasons: reasons.slice(0, 2) };
  }).sort((a, b) => b.score - a.score);

  // Diversity: no creator more than twice in a row.
  const out = [];
  const pending = [...scored];
  while (pending.length) {
    const n = out.length;
    let idx = pending.findIndex((x) => !(n >= 2 && out[n - 1].row.user_id === x.row.user_id && out[n - 2].row.user_id === x.row.user_id));
    if (idx < 0) idx = 0;
    out.push(pending.splice(idx, 1)[0]);
  }
  return out;
}

// mode: 'home' (For you), 'following', 'reels' (video only), 'explore'
async function feedFor(me, mode = 'home', { limit = 12, offset = 0 } = {}) {
  const extra =
    mode === 'reels' ? "AND p.media_type = 'video'" :
    mode === 'following' ? `AND ${FOLLOWED}` : '';
  const rows = await db.all(`${POST_SELECT}
    WHERE p.status = 'published' AND p.created_at >= now() - interval '30 days' AND ${VISIBLE} ${extra}
    ORDER BY p.created_at DESC LIMIT 400`, { me });
  await attachTags(rows);
  const settings = await getFeedSettings(me);
  const ranked = await rank(rows, me, settings);
  const page = ranked.slice(offset, offset + limit);
  return {
    items: page.map((x) => ({ ...serializePost(x.row), reasons: x.reasons })),
    nextOffset: offset + limit < ranked.length ? offset + limit : null,
  };
}

function extractTags(caption) {
  const found = new Set();
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]{2,30})/gu)) found.add(m[1].toLowerCase());
  return [...found].slice(0, 15);
}

module.exports = { POST_SELECT, VISIBLE, FOLLOWED, attachTags, serializePost, getVisiblePost, feedFor, extractTags, rank, MOODS, getFeedSettings, saveFeedSettings };
