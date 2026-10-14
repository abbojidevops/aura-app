#!/usr/bin/env node
const db = require('../server/db');

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/make-admin.js <username>');
    process.exit(1);
  }

  const user = await db.get('SELECT id, username FROM users WHERE username = lower(?)', [username]);
  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }

  await db.run('UPDATE users SET is_admin = 1 WHERE id = ?', [user.id]);
  console.log(`User "${user.username}" is now an admin.`);
  await db.close();
}

main().catch((err) => {
  console.error('[make-admin]', err);
  process.exit(1);
});
