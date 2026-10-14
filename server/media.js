// Media pipeline: validate -> store original -> process in a background queue -> publish.
// Images: resized WebP feed + thumbnail (sharp). Videos: H.264 MP4 at max 720p + poster frame (ffmpeg).
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const sharp = require('sharp');
sharp.cache(false);
const db = require('./db');
const storage = require('./storage');

const UPLOADS = path.join(__dirname, '..', 'uploads');
const MAX_VIDEO_SECONDS = 180; // matches the MVP spec (3-minute cap)

// Find an ffmpeg binary: explicit env var, system PATH, or the one bundled with the imageio-ffmpeg Python package.
function resolveFfmpeg() {
  const works = (bin) => { try { return spawnSync(bin, ['-version']).status === 0; } catch { return false; } };
  if (process.env.FFMPEG && works(process.env.FFMPEG)) return process.env.FFMPEG;
  if (process.env.FFMPEG_PATH && works(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  if (works('ffmpeg')) return 'ffmpeg';
  try {
    const r = spawnSync('python3', ['-c', 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())']);
    const bin = String(r.stdout || '').trim();
    if (bin && works(bin)) return bin;
  } catch { /* no python */ }
  return null;
}
const FFMPEG = resolveFfmpeg() || 'ffmpeg';
const hasFfmpeg = resolveFfmpeg() !== null;

// Single in-process worker. In production this becomes BullMQ/SQS workers, one job per message.
const queue = [];
let running = false;
function enqueue(job) { queue.push(job); drain(); }
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    try { await job(); } catch (err) { console.error('[media] job failed:', err.message); }
  }
  running = false;
}

function ffmpeg(args) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, args);
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => resolve({ code, stderr }));
    p.on('error', (e) => resolve({ code: -1, stderr: e.message }));
  });
}

function probe(stderr) {
  const dur = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const size = stderr.match(/Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/);
  return {
    duration: dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3]) : 0,
    width: size ? +size[1] : null,
    height: size ? +size[2] : null,
  };
}

async function processImage(postId, src) {
  const dir = path.join(UPLOADS, 'posts', String(postId));
  fs.mkdirSync(dir, { recursive: true });
  const feedPath = path.join(dir, 'feed.webp');
  const thumbPath = path.join(dir, 'thumb.webp');
  const meta = await sharp(src).rotate().resize({ width: 1080, withoutEnlargement: true }).webp({ quality: 82 }).toFile(feedPath);
  await sharp(src).rotate().resize({ width: 480, height: 480, fit: 'cover' }).webp({ quality: 75 }).toFile(thumbPath);
  return {
    mediaUrl: `/uploads/posts/${postId}/feed.webp`,
    thumbUrl: `/uploads/posts/${postId}/thumb.webp`,
    width: meta.width, height: meta.height, duration: null,
  };
}

async function processVideo(postId, src) {
  const dir = path.join(UPLOADS, 'posts', String(postId));
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'video.mp4');
  const poster = path.join(dir, 'poster.jpg');

  if (!hasFfmpeg) {
    // Degraded mode: store the original without transcoding.
    fs.copyFileSync(src, out);
    return { mediaUrl: `/uploads/posts/${postId}/video.mp4`, thumbUrl: null, width: null, height: null, duration: null };
  }

  const info = probe((await ffmpeg(['-hide_banner', '-i', src])).stderr);
  if (info.duration > MAX_VIDEO_SECONDS) throw new Error(`Video is longer than ${MAX_VIDEO_SECONDS / 60} minutes`);

  const transcode = await ffmpeg([
    '-y', '-hide_banner', '-i', src,
    '-vf', "scale='min(720,iw)':-2",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', out,
  ]);
  if (transcode.code !== 0) throw new Error('Could not process this video');

  await ffmpeg(['-y', '-hide_banner', '-ss', '0.3', '-i', src, '-frames:v', '1', '-vf', 'scale=480:-2', poster]);
  const outInfo = probe((await ffmpeg(['-hide_banner', '-i', out])).stderr);
  return {
    mediaUrl: `/uploads/posts/${postId}/video.mp4`,
    thumbUrl: fs.existsSync(poster) ? `/uploads/posts/${postId}/poster.jpg` : null,
    width: outInfo.width, height: outInfo.height, duration: info.duration,
  };
}

// Public entry point: called by the routes after a file has been saved to uploads/tmp.
function enqueueProcessing(postId, srcPath, mediaType) {
  enqueue(async () => {
    try {
      const result = mediaType === 'video' ? await processVideo(postId, srcPath) : await processImage(postId, srcPath);
      await storage.publishPost(postId); // S3 mode: upload and clear local copies. Local mode: no-op.
      await db.run(`UPDATE posts SET status='published', media_url=@mediaUrl, thumb_url=@thumbUrl,
                  width=@width, height=@height, duration=@duration WHERE id=@id`,
        { ...result, id: postId });
    } catch (err) {
      await db.run("UPDATE posts SET status='failed' WHERE id=?", [postId]).catch(() => {});
      console.error(`[media] post ${postId} failed: ${err.message}`);
    } finally {
      fs.rm(srcPath, { force: true }, () => {});
    }
  });
}

// On startup, anything still "processing" was interrupted by a restart, so mark it failed.
async function recoverStale() {
  await db.run("UPDATE posts SET status = 'failed' WHERE status = 'processing'");
}

module.exports = { enqueueProcessing, recoverStale, hasFfmpeg, FFMPEG, UPLOADS };
