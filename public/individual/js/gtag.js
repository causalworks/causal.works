/**
 * Google Analytics 4 (gtag.js). Loads only when window.__GA_MEASUREMENT_ID__ is set
 * to a valid GA4 ID (G-xxxxxxxxxx) in app.html.
 */
(function () {
    'use strict';
    var id = typeof window.__GA_MEASUREMENT_ID__ === 'string' ? window.__GA_MEASUREMENT_ID__.trim() : '';
    if (!id || !/^G-[A-Z0-9]+$/i.test(id)) return;

    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id);

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.appendChild(s);
})();
