/**
 * Real per-user Solid-OIDC login (Part 1 of the identity work) - the org
 * admin's OWN browser session, not a server-held credential. Everything
 * here runs client-side only: the platform's server never sees this person's
 * password, access token, refresh token, or DPoP private key - they live
 * in this browser's IndexedDB alone. Deliberately no external Solid
 * library (no rdflib.js, no @inrupt/solid-client) - hand-rolled against
 * native Web Crypto, matching this app's server-side pod integration,
 * which made the same choice for the same reason (see docs/CSS_Findings_And_Gaps.md).
 *
 * For a REAL browser redirect flow (unlike the headless HTTP-scripted spike
 * that first proved this end-to-end), CSS's own hosted login/pick-webid/
 * consent pages handle their own interaction-resumption internally - this
 * client never touches that. The one gotcha that DOES carry over to real
 * client code: prompt=consent must be on the initial authorization request,
 * or offline_access/refresh_token is silently dropped with no error.
 */
(function (global) {
  'use strict';

  const DB_NAME = 'causal-solid-oidc';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function base64url(bufOrBytes) {
    const bytes = bufOrBytes instanceof ArrayBuffer ? new Uint8Array(bufOrBytes) : bufOrBytes;
    let str = '';
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function randomString(len) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  }

  async function sha256(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  }

  function decodeJwtPayload(jwt) {
    try {
      const part = jwt.split('.')[1];
      const json = decodeURIComponent(
        atob(part.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return {};
    }
  }

  async function generateDpopKeyPair() {
    return crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  }

  // Web Crypto's ECDSA signature output is already raw r||s (IEEE P1363) -
  // exactly what a JWS ES256 signature needs, no DER re-encoding required.
  async function signJwt(header, payload, privateKey) {
    const encHeader = base64url(new TextEncoder().encode(JSON.stringify(header)));
    const encPayload = base64url(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${encHeader}.${encPayload}`;
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput));
    return `${signingInput}.${base64url(sig)}`;
  }

  // htu must exclude query/fragment per RFC 9449.
  function htuFor(url) {
    const u = new URL(url, window.location.origin);
    u.search = '';
    u.hash = '';
    return u.toString();
  }

  async function dpopProof(privateKey, publicJwk, url, method, accessToken) {
    const header = { alg: 'ES256', typ: 'dpop+jwt', jwk: { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y } };
    const payload = { htu: htuFor(url), htm: method, jti: randomString(16), iat: Math.floor(Date.now() / 1000) };
    if (accessToken) {
      payload.ath = base64url(await sha256(accessToken));
    }
    return signJwt(header, payload, privateKey);
  }

  async function discover(issuer) {
    const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer}: ${res.status}`);
    return res.json();
  }

  async function registerClient(config, redirectUri) {
    const res = await fetch(config.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        application_type: 'web',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'causalworks',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Dynamic client registration failed: ${JSON.stringify(data)}`);
    return data;
  }

  /** Kicks off the redirect - navigates away. Nothing after this call runs. */
  async function login(issuer, redirectUri) {
    const config = await discover(issuer);
    const client = await registerClient(config, redirectUri);
    const codeVerifier = randomString(64);
    const codeChallenge = base64url(await sha256(codeVerifier));
    const state = randomString(16);

    await idbSet('pending', { issuer, config, client, codeVerifier, state, redirectUri });

    const url = new URL(config.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', client.client_id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('scope', 'openid offline_access webid');
    url.searchParams.set('state', state);
    // The one gotcha confirmed to matter for a real client: omitting this
    // silently drops offline_access/refresh_token with no error, even
    // though it was explicitly requested in scope and consent was given.
    url.searchParams.set('prompt', 'consent');
    window.location.href = url.toString();
  }

  /**
   * Call on the redirect_uri page after CSS sends the browser back. Returns
   * the new session on success, null if this load isn't actually a callback
   * (no ?code= present), throws on a real failure.
   */
  async function handleRedirectCallback() {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) throw new Error(`Login failed: ${params.get('error_description') || error}`);
    const code = params.get('code');
    if (!code) return null;
    const state = params.get('state');
    const iss = params.get('iss');

    const pending = await idbGet('pending');
    if (!pending) throw new Error('No pending login found in this browser (storage cleared, or opened in a different browser/tab than the one that started login).');
    if (pending.state !== state) throw new Error('State mismatch on return from the identity provider - aborting rather than risk a CSRF-planted session.');
    if (iss && pending.issuer.replace(/\/$/, '') !== iss.replace(/\/$/, '')) {
      throw new Error('Issuer mismatch on return - aborting (RFC 9207 issuer check).');
    }

    const dpopKeyPair = await generateDpopKeyPair();
    const dpopPublicJwk = await crypto.subtle.exportKey('jwk', dpopKeyPair.publicKey);
    const dpopPrivateJwk = await crypto.subtle.exportKey('jwk', dpopKeyPair.privateKey);
    const tokenUrl = pending.config.token_endpoint;
    const proof = await dpopProof(dpopKeyPair.privateKey, dpopPublicJwk, tokenUrl, 'POST');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pending.redirectUri,
      code_verifier: pending.codeVerifier,
      client_id: pending.client.client_id,
    });
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', dpop: proof },
      body: body.toString(),
    });
    const tokenData = await res.json();
    if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    const accessClaims = decodeJwtPayload(tokenData.access_token);
    const idClaims = tokenData.id_token ? decodeJwtPayload(tokenData.id_token) : {};
    const webId = accessClaims.webid || idClaims.webid;

    const session = {
      issuer: pending.issuer,
      config: pending.config,
      client: pending.client,
      webId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      dpopPrivateJwk,
      dpopPublicJwk,
      expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
    };
    await idbSet('session', session);
    await idbDelete('pending');
    // Clean the code/state out of the visible URL now that they're consumed.
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    return session;
  }

  async function getSession() {
    return idbGet('session');
  }

  async function logout() {
    await idbDelete('session');
    await idbDelete('pending');
  }

  async function importDpopPrivateKey(jwk) {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  }

  async function refresh() {
    const session = await idbGet('session');
    if (!session || !session.refreshToken) throw new Error('No refresh token available - a full login is required.');
    const privateKey = await importDpopPrivateKey(session.dpopPrivateJwk);
    const proof = await dpopProof(privateKey, session.dpopPublicJwk, session.config.token_endpoint, 'POST');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
      client_id: session.client.client_id,
    });
    const res = await fetch(session.config.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', dpop: proof },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    session.accessToken = data.access_token;
    session.refreshToken = data.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    await idbSet('session', session);
    return session;
  }

  /** Authenticated fetch as the logged-in human's own WebID - DPoP-bound, auto-refreshing. */
  async function authFetch(url, opts) {
    opts = opts || {};
    let session = await idbGet('session');
    if (!session) throw new Error('Not logged in.');
    if (Date.now() > session.expiresAt - 30000 && session.refreshToken) {
      session = await refresh();
    }
    const privateKey = await importDpopPrivateKey(session.dpopPrivateJwk);
    const method = opts.method || 'GET';
    const proof = await dpopProof(privateKey, session.dpopPublicJwk, url, method, session.accessToken);
    return fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), authorization: `DPoP ${session.accessToken}`, dpop: proof },
    });
  }

  global.SolidOidcClient = { login, handleRedirectCallback, getSession, logout, refresh, authFetch };
})(window);
