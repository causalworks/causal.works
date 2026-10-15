/* document-print.js — shared pieces for printed invoices and bills: organization letterhead, contact blocks and page styles. */
(function () {
  'use strict';

  const esc = window.escapeHtml || function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function lines(text) {
    return String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  }

  function css() {
    return 'body{font:13px system-ui,sans-serif;margin:32px;color:#111}h1{font-size:22px;margin:0}h2{font-size:11px;text-transform:uppercase;color:#555;margin:0 0 4px;letter-spacing:.04em}'
      + 'table{border-collapse:collapse;width:100%;margin-top:16px}th{text-align:left;font-size:11px;text-transform:uppercase;color:#555;border-bottom:1px solid #999;padding:4px 8px 4px 0}'
      + 'td{padding:4px 8px 4px 0;border-bottom:1px solid #ddd;vertical-align:top}.r{text-align:right}.top{display:flex;justify-content:space-between;gap:24px}'
      + '.org{font-size:12px;color:#333;line-height:1.5}.org b{font-size:15px;color:#111}.band{display:flex;gap:24px;margin-top:20px;padding:14px 16px;border:1px solid #bbb;border-radius:6px}'
      + '.band>div{flex:1}.due{font-size:24px;font-weight:700}.pay{margin-top:14px;padding:12px 16px;border:1px solid #bbb;border-radius:6px;background:#f7f7f7;white-space:pre-line}'
      + '.facts td{border:0;padding:1px 0 1px 0}.facts td:first-child{color:#555;padding-right:14px}.small{font-size:11px;color:#555}';
  }

  function letterheadHtml(org) {
    org = org || {};
    const profile = org.cooperative_profile && typeof org.cooperative_profile === 'object' ? org.cooperative_profile : {};
    const name = org.legal_name || org.display_name || '';
    const parts = ['<b>' + esc(name) + '</b>']
      .concat(lines(org.mailing_address).map(esc))
      .concat([org.phone, org.contact_email, profile.website].filter(Boolean).map(esc))
      .concat(org.ein ? ['EIN ' + esc(org.ein)] : []);
    return '<div class="org">' + parts.join('<br>') + '</div>';
  }

  function contactHtml(label, name, who) {
    who = who || {};
    const parts = ['<b>' + esc(name || '') + '</b>']
      .concat(lines(who.contact_address).map(esc))
      .concat([who.contact_email, who.contact_phone].filter(Boolean).map(esc));
    return '<h2>' + esc(label) + '</h2>' + parts.join('<br>');
  }

  function open(title, bodyHtml, onBlocked) {
    const w = window.open('', '_blank');
    if (!w) { if (onBlocked) onBlocked(); return; }
    w.document.write('<!doctype html><title>' + esc(title) + '</title><style>' + css() + '</style>' + bodyHtml);
    w.document.close();
    w.focus();
    w.print();
  }

  window.OrganizationalDocPrint = { esc: esc, css: css, letterheadHtml: letterheadHtml, contactHtml: contactHtml, open: open };
})();
