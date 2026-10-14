// Demo data so the app is explorable on first run. Runs only when the database is empty.
// Posts go through the same media pipeline as real uploads.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const db = require('./db');
const { hashPassword } = require('./auth');
const media = require('./media');

const TMP = path.join(media.UPLOADS, 'tmp');
const FFMPEG = media.FFMPEG;

const USERS = [
  { username: 'demo', displayName: 'Demo Creator', bio: 'Trying AURA out. Ask me anything about design. ✨', hue: 262 },
  { username: 'maya.draws', displayName: 'Maya Chen', bio: 'Illustrator. Watercolor, ink, and slow mornings.', hue: 330 },
  { username: 'learn.ravi', displayName: 'Ravi Kumar', bio: 'One-minute explainers on science and everyday things.', hue: 200 },
  { username: 'pixel.pete', displayName: 'Pete Alvarez', bio: 'Pets, chaos, and occasional jokes.', hue: 30 },
  { username: 'calm.corner', displayName: 'Calm Corner', bio: 'Slow content for fast days. Breathe.', hue: 160 },
  { username: 'typeology', displayName: 'Typeology Studio', bio: 'Type, layout and visual style, explained simply.', hue: 300 },
];

const FOLLOWS = [
  ['demo', 'maya.draws'], ['demo', 'learn.ravi'], ['demo', 'calm.corner'], ['demo', 'typeology'],
  ['maya.draws', 'demo'], ['pixel.pete', 'demo'], ['learn.ravi', 'demo'], ['typeology', 'maya.draws'],
];

const STYLES = ['Minimalism', 'Maximalism', 'Futuristic', 'Vector art', 'Collage art', 'Retro', 'Cyberpunk',
  'Pop art', 'Glass morphism', 'Clay style', 'Pixel art', 'Editorial', 'Y2K', 'Swiss design', 'Surreal design',
  'Bohemian', 'Victorian style', 'Graffiti', 'Aurora', 'Handwritten'];

function posterStyles() {
  const rows = STYLES.map((s, i) => {
    const col = i < 10 ? 0 : 1;
    const row = i % 10;
    const x = 110 + col * 470;
    const y = 250 + row * 92;
    return `<text x="${x}" y="${y}" font-size="46" font-weight="700" fill="#111">${i + 1}. ${s}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <rect width="1080" height="1350" fill="#f3f1ec"/>
    <text x="110" y="150" font-size="64" font-weight="800" fill="#111" font-family="DejaVu Sans, Arial, sans-serif">Graphic design styles</text>
    <g font-family="DejaVu Sans, Arial, sans-serif">${rows}</g>
    <text x="110" y="1260" font-size="30" fill="#777" font-family="DejaVu Sans, Arial, sans-serif">typeology · save this for your next project</text>
  </svg>`;
}

function handwritingPoster() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <rect width="1080" height="1350" fill="#9b2c2c"/>
    <rect x="150" y="330" width="780" height="200" rx="18" fill="#f6ecd9" transform="rotate(-2 540 430)"/>
    <text x="540" y="478" font-size="140" text-anchor="middle" fill="#9b2c2c" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700">Prickly pear.</text>
    <rect x="260" y="640" width="560" height="140" rx="16" fill="#f6ecd9" transform="rotate(1.5 540 710)"/>
    <text x="540" y="732" font-size="72" text-anchor="middle" fill="#9b2c2c" font-family="DejaVu Sans, Arial, sans-serif">a delightfully offbeat</text>
    <text x="540" y="950" font-size="64" text-anchor="middle" fill="#f6ecd9" font-family="DejaVu Sans, Arial, sans-serif">handwriting font.</text>
    <text x="540" y="1200" font-size="34" text-anchor="middle" fill="#f6ecd9" opacity="0.7" font-family="DejaVu Sans, Arial, sans-serif">TYPEHEIST · specimen</text>
  </svg>`;
}

function gradientPoster(c1, c2, title, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#g)"/>
    <text x="90" y="1080" font-size="110" font-weight="800" fill="#fff" font-family="DejaVu Sans, Arial, sans-serif">${title}</text>
    <text x="90" y="1160" font-size="48" fill="#fff" opacity="0.85" font-family="DejaVu Sans, Arial, sans-serif">${sub}</text>
  </svg>`;
}

// Each entry: author, media, caption, hours ago, visibility.
const POSTS = [
  { author: 'demo', kind: 'svg', svg: () => gradientPoster('#7c3aed', '#ec4899', 'Hello, AURA.', 'Tune your feed. Own your data.'), caption: 'First post on AURA. Try the sliders in For you and tap “Why am I seeing this?” #welcome #aura', hours: 1 },
  { author: 'typeology', kind: 'svg', svg: posterStyles, caption: '20 graphic design styles worth knowing. Which one is your favorite? #design #graphicdesign #styles #typography', hours: 2 },
  { author: 'typeology', kind: 'svg', svg: handwritingPoster, caption: 'A handwriting font that feels like a note from a friend. #typography #design #handwriting', hours: 6 },
  { author: 'maya.draws', kind: 'svg', svg: () => gradientPoster('#7c3aed', '#f472b6', 'Watercolor', 'First landscape of the week'), caption: 'Sketching my first watercolor landscape of the week. #art #watercolor #illustration', hours: 3 },
  { author: 'maya.draws', kind: 'svg', svg: () => gradientPoster('#1f2937', '#9ca3af', 'Less, but better.', 'Minimalism moodboard'), caption: 'Minimalism moodboard. Fewer colors, more air. #design #minimalism #art', hours: 30 },
  { author: 'calm.corner', kind: 'svg', svg: () => gradientPoster('#0e7490', '#86efac', 'Morning light', 'Lake, 6:12 am'), caption: 'Morning light over the lake. Take the slow route today. #nature #calm', hours: 10 },
  { author: 'learn.ravi', kind: 'video', color: ['0x7c3aed', '0x0ea5e9'], caption: 'Why is the sky blue? Here it is in 60 seconds. #education #science #explainer', hours: 1 },
  { author: 'calm.corner', kind: 'video', color: ['0x0e7490', '0x34d399'], caption: 'Ten minutes of slow breathing. Put the phone down after. #calm #wellbeing #nature', hours: 4 },
  { author: 'pixel.pete', kind: 'video', color: ['0xf59e0b', '0xef4444'], caption: 'My cat tried to file a complaint with the landlord. #comedy #pets #funny', hours: 5 },
  { author: 'typeology', kind: 'video', color: ['0xec4899', '0x6366f1'], caption: 'Glass morphism in 15 seconds. Blur, border, light. #design #glassmorphism #uidesign', hours: 8 },
];

// Set to true once seeding has finished (or was skipped because data already exists).
const state = { done: false };

async function seedIfEmpty() {
  const { n } = await db.get('SELECT COUNT(*) AS n FROM users');
  if (n > 0) { state.done = true; return; }
  console.log('[seed] creating demo data…');
  fs.mkdirSync(TMP, { recursive: true });

  const ids = {};
  const password = hashPassword('demo1234');
  for (const u of USERS) {
    const row = await db.get(
      'INSERT INTO users (username, display_name, email, password_hash, bio, avatar_hue) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [u.username, u.displayName, `${u.username.replace('.', '_')}@aura.demo`, password, u.bio, u.hue]
    );
    ids[u.username] = row.id;
  }
  for (const [a, b] of FOLLOWS) {
    await db.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [ids[a], ids[b]]);
  }

  const hasVideoGen = media.hasFfmpeg;
  for (let i = 0; i < POSTS.length; i++) {
    const p = POSTS[i];
    const mediaType = p.kind === 'video' ? 'video' : 'image';
    if (mediaType === 'video' && !hasVideoGen) continue; // skip reels when ffmpeg is unavailable
    const createdAt = new Date(Date.now() - p.hours * 3600e3);
    const row = await db.get(
      `INSERT INTO posts (user_id, caption, media_type, status, created_at)
      VALUES (?, ?, ?, 'processing', ?) RETURNING id`,
      [ids[p.author], p.caption, mediaType, createdAt]
    );
    const postId = row.id;
    for (const tag of new Set([...p.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((m) => m[1].toLowerCase()))) {
      await db.run('INSERT INTO post_tags (post_id, tag) VALUES (?, ?) ON CONFLICT DO NOTHING', [postId, tag]);
    }

    let src;
    if (mediaType === 'image') {
      src = path.join(TMP, `seed-${i}.svg`);
      fs.writeFileSync(src, p.svg());
    } else {
      src = path.join(TMP, `seed-${i}.mp4`);
      spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi',
        '-i', `gradients=s=720x1280:d=8:speed=0.04:c0=${p.color[0]}:c1=${p.color[1]}:c2=${p.color[0]}`,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', src]);
    }
    media.enqueueProcessing(postId, src, mediaType);
  }

  // Likes so the ranking has signal to work with.
  const somePosts = await db.all('SELECT id FROM posts ORDER BY id');
  for (const post of somePosts.slice(0, 5)) {
    for (const u of ['maya.draws', 'learn.ravi', 'pixel.pete']) {
      await db.run('INSERT INTO likes (user_id, post_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [ids[u], post.id]);
    }
    await db.run('UPDATE posts SET like_count = (SELECT COUNT(*) FROM likes WHERE post_id = ?) WHERE id = ?', [post.id, post.id]);
  }
  state.done = true;
  console.log('[seed] done. Sign in with username "demo" and password "demo1234".');
}

module.exports = { seedIfEmpty, state };
