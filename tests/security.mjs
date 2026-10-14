const B = process.env.BASE_URL || 'http://localhost:3000';
let fails = 0;
const check = (n, ok, x = '') => {
  console.log(ok ? 'PASS' : 'FAIL', n, x);
  if (!ok) fails++;
};

// 1. Check security headers on GET /
const res = await fetch(B + '/');
const xContentType = res.headers.get('x-content-type-options');
const referrerPolicy = res.headers.get('referrer-policy');
const xFrameOptions = res.headers.get('x-frame-options');
const csp = res.headers.get('content-security-policy') || '';

check('X-Content-Type-Options is nosniff', xContentType === 'nosniff', xContentType || '');
check('Referrer-Policy is present', !!referrerPolicy, referrerPolicy || '');
check('X-Frame-Options is DENY', xFrameOptions?.toUpperCase() === 'DENY', xFrameOptions || '');
check('CSP includes self, data:, blob:', csp.includes("'self'") && csp.includes('data:') && csp.includes('blob:'), csp);
check('CSP includes ws: and wss:', csp.includes('ws:') && csp.includes('wss:'), csp);

// 2. Check rate limiting on POST /api/auth/login: 10 attempts per IP per 15 minutes, 11th gets 429
const testIp = `192.0.2.${Math.floor(Math.random() * 200 + 1)}`;
let lastStatus = 0;
let lastBody = null;

for (let i = 1; i <= 11; i++) {
  const r = await fetch(B + '/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': testIp,
    },
    body: JSON.stringify({ identifier: 'nonexistent', password: 'wrong' }),
  });
  lastStatus = r.status;
  lastBody = await r.json().catch(() => ({}));
  if (i <= 10) {
    if (r.status === 429) {
      check(`attempt ${i} not rate limited`, false, `got 429 prematurely at attempt ${i}`);
      break;
    }
  }
}

check('11th login attempt gets 429', lastStatus === 429, `status ${lastStatus}`);
check('429 body matches error message', lastBody.error === 'Too many attempts. Try again later.', JSON.stringify(lastBody));

console.log(fails === 0 ? '\nSECURITY CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails ? 1 : 0);
