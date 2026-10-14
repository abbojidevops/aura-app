# AURA closed alpha: runbook

Scope: invite-only alpha on one app instance and one PostgreSQL database.

## Before the first deploy

1. Build the image on a machine with Docker: `docker compose build`. This has not been tested yet.
2. Create `.env` with a strong database password: `POSTGRES_PASSWORD=...`
3. Put the app behind HTTPS with a reverse proxy. The proxy must allow WebSocket upgrades on `/ws`.
4. Optional CDN: set `MEDIA_BASE_URL` to the CDN origin. The CDN pulls from `/uploads` on the app.
5. If using object storage: set `STORAGE=s3`, the `S3_*` variables, and `MEDIA_BASE_URL` (see README). Upload one photo and one video and confirm they play from the public URL.
6. Delete or change the demo account (`demo` / `demo1234`) before inviting anyone.

## Start, stop, check

- Start: `docker compose up -d`
- Stop: `docker compose down` (keeps volumes)
- Health: `curl -f https://<host>/healthz` should return `{"ok":true,...}`
- Logs: `docker compose logs -f app`
- Realtime: the browser's Network tab should show a WebSocket to `/ws` on the Messages page

## Backups

- Database: `docker compose exec db pg_dump -U aura aura > aura-$(date +%F).sql`
- Uploads (local mode): `docker run --rm -v aura-app_uploads:/u -v $PWD:/b alpine tar czf /b/uploads-$(date +%F).tgz -C /u .`
- Uploads (S3 mode): enable bucket versioning or the provider's backup feature instead.
- Restore test: restore a dump into a scratch database at least once before inviting users.

## Rollback

- Keep the previous image tag. Roll back with `docker compose up -d` after pinning the old tag.
- Schema changes are additive (`CREATE TABLE IF NOT EXISTS`). Roll back the image, not the schema.

## Known limits for alpha

- Media: with `STORAGE=local` it sits in the `uploads` volume. With `STORAGE=s3` it goes to the bucket. The S3 path is tested against an emulator. Test one real upload against the real bucket before inviting users.
- Realtime fan-out is in-process. Run exactly one app instance.
- Media processing runs in-process. A crash during processing marks the post as failed on restart.
- Private accounts follow immediately. There are no follow requests yet.
- Ranking is rule-based. No ads and no tips.
- The earlier SQLite data was not migrated. The alpha database started fresh.

## Incidents

- Abuse: three distinct reports hide a post automatically. Hidden posts are shown to the author only. Review and delete from the database or the API.
- Lost session or password: there is no reset flow yet. Reset the password hash in the database by hand.
