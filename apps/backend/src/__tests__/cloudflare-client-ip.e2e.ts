/**
 * resolveCloudflareClientIp (middleware/security.middleware.ts).
 *
 * The API sits behind a proxy chain whose hop count varies by request path
 * (direct api.sahaledu.com vs. the frontend's nginx re-proxying through
 * Cloudflare for custom domains), so a fixed `trust proxy` hop count either
 * collapses many real users onto one rate-limit bucket or lets a forged
 * X-Forwarded-For entry through. This middleware rewrites X-Forwarded-For to
 * Cloudflare's own CF-Connecting-IP header, which survives every hop
 * unchanged, so req.ip resolves correctly regardless of hop count.
 *
 * No Express app/MongoDB needed — this calls the middleware function
 * directly against fake req/res objects. `npm run test:cloudflare-client-ip`.
 */

let failures = 0;
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  OK   ${label}`);
  else { console.log(`  FAIL ${label}`); failures++; }
}

function run(headers: Record<string, string | string[] | undefined>, middleware: (req: any, res: any, next: any) => void, remoteAddress = '172.18.0.5') {
  const req: any = { headers: { ...headers }, socket: { remoteAddress } };
  let nextCalled = false;
  middleware(req, {}, () => { nextCalled = true; });
  return { req, nextCalled };
}

async function main() {
  const { resolveCloudflareClientIp } = await import('../middleware/security.middleware');

  console.log('\n=== resolveCloudflareClientIp ===');

  {
    const { req, nextCalled } = run({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.5, 10.0.0.6' }, resolveCloudflareClientIp);
    assert(nextCalled, 'calls next()');
    assert(req.headers['x-forwarded-for'] === '203.0.113.9', `replaces a multi-hop XFF with CF-Connecting-IP (got ${req.headers['x-forwarded-for']})`);
  }

  {
    // Different request path (one fewer/extra hop) — same header still wins,
    // which is the whole point: req.ip stops depending on hop count.
    const { req } = run({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.5' }, resolveCloudflareClientIp);
    assert(req.headers['x-forwarded-for'] === '203.0.113.9', 'resolves the same client IP from a different hop count');
  }

  {
    const { req } = run({ 'cf-connecting-ip': ['203.0.113.9', '203.0.113.10'] as any }, resolveCloudflareClientIp);
    assert(req.headers['x-forwarded-for'] === '203.0.113.9', 'an array header value uses the first entry');
  }

  {
    // No Cloudflare header — local dev / direct access. Leave XFF (and thus
    // Express's own trust-proxy handling) untouched rather than erasing it.
    const { req } = run({ 'x-forwarded-for': '10.0.0.5' }, resolveCloudflareClientIp);
    assert(req.headers['x-forwarded-for'] === '10.0.0.5', 'falls through unchanged when Cloudflare is not in the path');
  }

  {
    const { req } = run({ 'cf-connecting-ip': '   ' }, resolveCloudflareClientIp);
    assert(req.headers['x-forwarded-for'] === undefined, 'a blank header is ignored rather than written as whitespace');
  }

  {
    // Reaching the origin directly (not through Cloudflare or our private
    // proxy hop) must not let the caller choose its own client IP.
    const { req } = run({ 'cf-connecting-ip': '203.0.113.77', 'x-forwarded-for': '198.51.100.20' }, resolveCloudflareClientIp);
    assert(req.headers['x-forwarded-for'] === '198.51.100.20', `a CF header from a non-Cloudflare peer is ignored (got ${req.headers['x-forwarded-for']})`);
  }

  {
    const { req } = run({ 'cf-connecting-ip': '203.0.113.77' }, resolveCloudflareClientIp, '198.51.100.20');
    assert(req.headers['x-forwarded-for'] === undefined, 'a direct public caller cannot set the client IP either');
  }

  {
    const { req } = run({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '162.158.10.20' }, resolveCloudflareClientIp, '198.51.100.20');
    assert(req.headers['x-forwarded-for'] === '203.0.113.9', 'a Cloudflare edge peer is trusted');
  }

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CLOUDFLARE CLIENT-IP CHECKS PASSED (0 failures)');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
