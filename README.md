# AURA

A working social app: a mood-based For you feed (plus Following), Reels, Explore, Create, Profile, Messages, Notifications, Settings. Light and dark themes. Responsive (bottom nav on mobile, sidebar on desktop).

## Run it

You need Node 20+ and a PostgreSQL 14+ database.

```bash
export DATABASE_URL=postgres://aura:aura@localhost:5432/aura   # your database
npm install
npm run build        # builds the React app into client/dist
npm start            # API + app on http://0.0.0.0:3000
```

On startup the server creates the tables if they don't exist. The first run on an empty database seeds demo users, posts, and reels.

Demo account: `demo` / `demo1234`.

Video processing needs ffmpeg. The server looks for `FFMPEG_PATH`, then `ffmpeg` on PATH, then the `imageio-ffmpeg` Python package. Without ffmpeg, videos are stored unprocessed and the demo reels are skipped.

## Deploy (closed alpha)

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
docker compose up -d --build     # app on :3000, PostgreSQL 17 in a volume
```

- Health check: `GET /` returns 200.
- Backups: `docker compose exec db pg_dump -U aura aura > aura-$(date +%F).sql`. Also back up the `uploads` volume.
- The demo account is seeded only on an empty database. Delete it or change its password before inviting anyone.
- CDN (optional): set `MEDIA_BASE_URL=https://cdn.example.com` to put a CDN in front of this app's `/uploads` path. The CDN pulls from `https://your-app/uploads/...`. The app returns CDN URLs in API responses, and the database keeps relative paths, so changing CDN providers needs no data migration. Uploaded files are still written to local disk. Moving writes to object storage (S3/R2) is the next step.
- Object storage (optional, recommended for alpha beyond one server): set `STORAGE=s3` and these variables:
  - `S3_BUCKET`, `S3_REGION` (use `auto` for Cloudflare R2)
  - `S3_ENDPOINT` (R2: `https://<account>.r2.cloudflarestorage.com`; AWS: leave empty)
  - `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (or leave empty to use the SDK's default credential chain)
  - `S3_FORCE_PATH_STYLE=1` for MinIO-style endpoints
  - `MEDIA_BASE_URL`: the public URL that serves the bucket (or the CDN in front of it). Required in S3 mode.
  After processing, each post's files are uploaded to `uploads/posts/<id>/...` in the bucket and removed from local disk. Deleting a post removes its objects. The bucket must allow public GET on `uploads/*` (or sit behind the CDN).
- Health check: `GET /healthz` returns `{ok:true}` after a database query.
- Proxies must allow WebSocket upgrades on `/ws` (nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
- Put the app behind HTTPS (a reverse proxy such as Caddy or nginx). Sessions are tokens, so never serve them over plain HTTP outside a test network.

## Feed

- **Moods** (Inspire, Educate, Entertain, Calm, Trending, Interests, Surprise) shift which posts rise. Each post has a "Why" line showing its ranking reasons.
- **Tune your feed** sets three sliders, 0–100: friends, new creators, controversial. Saved per user via `GET/PATCH /api/me/feed-settings`.
- **Wellbeing pause:** a break prompt appears after every 10 posts. The user can pause for 10 minutes.
- Diversity rule: no more than two posts in a row from the same author.
- Three distinct reports auto-hide a post.

## Structure

```
server/
  index.js    routes: auth, posts, likes, comments, follows, explore, messages, notifications, export
  feed.js     visibility rules, mood modes, slider-weighted ranking with reasons
  media.js    upload processing queue: sharp (images) + ffmpeg (720p H.264 video, poster frame)
  auth.js     scrypt password hashes, session tokens
  db.js       PostgreSQL pool, schema (users, posts, follows, likes, comments, notifications, messages, reports, user_feed_settings)
  seed.js     demo data
client/src/
  pages/      Home, Reels, Explore, Create, Profile, PostPage, Messages, Notifications, Settings, Auth
  components/ Shell (nav), PostCard, MediaFrame (player + double-tap like), Comments, Sheet, Feedback
  styles.css  design tokens (light/dark), layout, motion, responsive
```

## Known limits (MVP)

- Media processing uses an in-process queue. Move it to BullMQ/SQS when scaling.
- Messages use WebSockets (`/ws`) with polling as a fallback. Events carry IDs only, and content is fetched over the API.
- Multiple app instances: the WebSocket fan-out is in-process. Add Redis pub/sub before running more than one instance.
- The earlier SQLite database is not migrated. Alpha started on PostgreSQL with fresh demo data.
- Media: local disk by default. Set `STORAGE=s3` for S3-compatible storage (see Deploy). Tested against an S3 emulator, not yet against a real provider.
- Private accounts follow immediately instead of via follow requests.
- Feed ranking is rule-based. Recommendations are not a trained model.
- The ads slider is not included because there are no ads yet.
- Tips, creator stock, tokens, and blockchain are not included (see the PRD).
