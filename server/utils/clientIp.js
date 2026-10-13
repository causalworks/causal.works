'use strict';

function clientIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((v) => v.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.ip || 'unknown');
}

module.exports = { clientIp };
