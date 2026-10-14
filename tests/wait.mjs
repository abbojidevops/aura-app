const url = process.argv[2] || process.env.BASE_URL;
if (!url) {
  console.error('Usage: node wait.mjs <url>');
  process.exit(1);
}

// Wait for the server to answer AND report ready (seed + media processing finished).
let ok = false;
for (let i = 0; i < 180; i++) {
  try {
    const res = await fetch(`${url}/healthz`);
    if (res.ok && (await res.json()).ready) {
      ok = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

if (!ok) {
  console.error(`Error: Server not ready at ${url} within 90 seconds.`);
  process.exit(1);
}
