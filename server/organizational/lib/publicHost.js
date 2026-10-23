'use strict';

// Checks that an address workspace admins enter points to a public https host, not an internal one.

const dns = require('dns').promises;
const net = require('net');

function privateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function privateAddress(ip) {
  if (net.isIPv4(ip)) return privateV4(ip);
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return net.isIPv4(v.slice(7)) ? privateV4(v.slice(7)) : true;
  return /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

async function publicHttpsProblem(urlString, lookup) {
  let u;
  try { u = new URL(String(urlString)); } catch (e) { return 'Enter a full address starting with https://.'; }
  if (u.protocol !== 'https:' || u.username || u.password) return 'The address must start with https:// and have no sign-in details in it.';
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) return 'The address must point to a public website.';
  try {
    const addrs = net.isIP(host) ? [{ address: host }] : await (lookup || ((h) => dns.lookup(h, { all: true })))(host);
    if (!addrs.length || addrs.some((a) => privateAddress(a.address))) return 'The address must point to a public website.';
  } catch (e) {
    return 'That address could not be found.';
  }
  return null;
}

module.exports = { publicHttpsProblem, privateAddress };
