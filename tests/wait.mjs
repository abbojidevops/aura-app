const url = process.argv[2] || process.env.BASE_URL;
if (!url) {
  console.error('Usage: node wait.mjs <url>');
  process.exit(1);
}

let ok = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${url}/healthz`);
    if (res.ok) {
      ok = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

if (!ok) {
  console.error(`Error: Server failed to start at ${url} within 30 seconds.`);
  process.exit(1);
}
