// Public media URLs. The database stores paths like /uploads/posts/12/poster.jpg.
// When MEDIA_BASE_URL is set (for example https://cdn.example.com), API responses point at the CDN.
// The CDN pulls from this app's /uploads path, so switching CDN providers needs no data migration.
const BASE = (process.env.MEDIA_BASE_URL || '').replace(/\/+$/, '');

if (BASE && !/^https?:\/\//.test(BASE)) {
  console.warn('[urls] MEDIA_BASE_URL should start with http:// or https://. Ignoring it.');
}

function mediaUrl(p) {
  if (!p) return p ?? null;
  if (!p.startsWith('/')) return p;
  return /^https?:\/\//.test(BASE) ? BASE + p : p;
}

module.exports = { mediaUrl, MEDIA_BASE: BASE };
