'use strict';

// The real client address behind nginx. The causal.works nginx block sets X-Real-IP to
// $remote_addr (overwriting anything the client sent) but does NOT set X-Forwarded-For, and the
// app has no 'trust proxy' set, so req.ip is always nginx's own address. X-Forwarded-For is only
// a fallback: with this nginx config it is whatever the client chose to send.
function clientIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.ip || 'unknown');
}

module.exports = { clientIp };
