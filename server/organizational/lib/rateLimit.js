'use strict';

// In-process token-bucket rate limiter for public routes, keyed by IP address and by workspace.

function createBucketLimiter({ capacity, refillPerMinute, now }) {
  const clock = now || (() => Date.now());
  const buckets = new Map();
  let lastSweep = clock();

  function sweep(t) {
    if (t - lastSweep < 60000) return;
    lastSweep = t;
    for (const [k, b] of buckets) {
      if (b.tokens >= capacity && t - b.at > 600000) buckets.delete(k);
    }
  }

  return {
    take(key, cost) {
      const t = clock();
      sweep(t);
      const c = cost || 1;
      let b = buckets.get(key);
      if (!b) { b = { tokens: capacity, at: t }; buckets.set(key, b); }
      const refill = ((t - b.at) / 60000) * refillPerMinute;
      b.tokens = Math.min(capacity, b.tokens + refill);
      b.at = t;
      if (b.tokens < c) return { ok: false, retryAfterSeconds: Math.ceil(((c - b.tokens) / refillPerMinute) * 60) };
      b.tokens -= c;
      return { ok: true };
    },
    size() { return buckets.size; },
  };
}

function clientIp(req) {
  return String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown');
}

// Middleware: refuses with 429 when either the caller's IP or the workspace in the path has used up its bucket.
function publicRateLimit(opts) {
  const o = opts || {};
  const perIp = createBucketLimiter({ capacity: o.ipCapacity || 30, refillPerMinute: o.ipPerMinute || 10, now: o.now });
  const perWorkspace = createBucketLimiter({ capacity: o.workspaceCapacity || 300, refillPerMinute: o.workspacePerMinute || 100, now: o.now });
  const cost = o.cost || 1;
  const mw = function publicRateLimitGuard(req, res, next) {
    const a = perIp.take('ip:' + clientIp(req), cost);
    const b = a.ok ? perWorkspace.take('ws:' + String(req.params.slug || ''), cost) : a;
    if (a.ok && b.ok) return next();
    res.setHeader('Retry-After', String((a.ok ? b : a).retryAfterSeconds));
    return res.status(429).json({ code: 'rate_limited', error: 'Too many tries from here. Wait a few minutes and try again.' });
  };
  mw.limiters = { perIp, perWorkspace };
  return mw;
}

module.exports = { createBucketLimiter, publicRateLimit, clientIp };
