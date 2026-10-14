// Media storage. Two modes, chosen by STORAGE:
//   local (default): files stay in uploads/ on this server's disk.
//   s3: after processing, each post's files are uploaded to an S3-compatible bucket
//       (AWS S3, Cloudflare R2, MinIO, ...), then the local copies are removed.
// Bucket keys match the local paths, e.g. uploads/posts/12/feed.webp. Public reads go through
// MEDIA_BASE_URL (the bucket's public URL or a CDN in front of it).
const fs = require('fs');
const path = require('path');

const UPLOADS = path.join(__dirname, '..', 'uploads');
const MODE = (process.env.STORAGE || 'local').toLowerCase();
const CONTENT_TYPES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4' };
const CACHE = 'public, max-age=2592000, immutable';

let s3 = null;
let bucket = null;

if (!['local', 's3'].includes(MODE)) {
  throw new Error(`STORAGE must be "local" or "s3" (got "${MODE}")`);
}

if (MODE === 's3') {
  const { S3Client } = require('@aws-sdk/client-s3');
  bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('STORAGE=s3 requires S3_BUCKET');
  if (!process.env.MEDIA_BASE_URL) throw new Error('STORAGE=s3 requires MEDIA_BASE_URL (the bucket or CDN public URL)');
  const credentials = process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
    : undefined; // otherwise the SDK's default chain (env, instance role, ...)
  s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    credentials,
  });
}

// Upload a post's processed files, then remove them from local disk. No-op in local mode.
async function publishPost(postId) {
  if (MODE !== 's3') return;
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const dir = path.join(UPLOADS, 'posts', String(postId));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (!files.length) throw new Error(`no processed files for post ${postId}`);
  for (const name of files) {
    const body = fs.readFileSync(path.join(dir, name));
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `uploads/posts/${postId}/${name}`,
      Body: body,
      ContentType: CONTENT_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream',
      CacheControl: CACHE,
    }));
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// Remove a post's files everywhere they might be.
async function deletePost(postId) {
  fs.rmSync(path.join(UPLOADS, 'posts', String(postId)), { recursive: true, force: true });
  if (MODE !== 's3') return;
  const { ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  const prefix = `uploads/posts/${postId}/`;
  let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    const keys = (page.Contents || []).map((o) => ({ Key: o.Key }));
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

module.exports = { MODE, publishPost, deletePost, UPLOADS };
