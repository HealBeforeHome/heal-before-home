/* Heal Before Home: cookie consent + Google Analytics 4
   Vanilla JS, no dependencies.

   Nothing from Google loads until the visitor accepts. Until then there is no
   gtag.js request and no _ga cookie; the choice is remembered in localStorage
   and can be changed from the "Cookie Settings" link in every footer.

   This lives in a file rather than Google's inline snippet on purpose: the CSP
   in _headers allows exactly one inline script (by hash), so an inline gtag
   block would be blocked. The Google hosts gtag.js talks to are allowed there. */
(function () {
  'use strict';

  var MEASUREMENT_ID = 'G-NFYYRZNC75';
  var STORAGE_KEY = 'hbh-cookie-consent'; // 'granted' | 'denied'

  function readChoice() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveChoice(value) {
    try { window.localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode: ask again next visit */ }
  }

  /* ---------------------------------------------------------
     Google Analytics
     --------------------------------------------------------- */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  var loaded = false;
  function loadAnalytics() {
    if (loaded) {
      gtag('consent', 'update', { analytics_storage: 'granted' });
      return;
    }
    loaded = true;
    gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(s);
  }

  /* Withdrawing consent: stop further collection and remove the cookies GA set.
     They are written on the registrable domain, so clear them there as well as
     on the current host. */
  function stopAnalytics() {
    if (loaded) gtag('consent', 'update', { analytics_storage: 'denied' });
    var host = window.location.hostname;
    var domains = ['', host, '.' + host.replace(/^www\./, '')];
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga(_|$)/.test(name)) return;
      domains.forEach(function (d) {
        document.cookie = name + '=; Max-Age=0; path=/' + (d ? '; domain=' + d : '');
      });
    });
  }

  /* ---------------------------------------------------------
     Consent banner
     --------------------------------------------------------- */
  var banner = null;

  function privacyHref() {
    var link = document.querySelector('.footer-legal a[href$="privacy-policy"]');
    return link ? link.getAttribute('href') : '/privacy-policy';
  }

  function buildBanner() {
    banner = document.createElement('section');
    banner.className = 'cookie-banner';
    banner.setAttribute('aria-label', 'Cookie preferences');
    banner.hidden = true;
    banner.innerHTML =
      '<div class="cookie-banner__inner">' +
        '<p class="cookie-banner__text">We use analytics cookies to understand how visitors use this site and to improve it. ' +
        'They are only set if you accept. See our <a href="' + privacyHref() + '">Privacy Policy</a>.</p>' +
        '<div class="cookie-banner__actions">' +
          '<button type="button" class="btn btn--ghost" data-consent="denied">Decline</button>' +
          '<button type="button" class="btn" data-consent="granted">Accept</button>' +
        '</div>' +
      '</div>';
    banner.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-consent]');
      if (!btn) return;
      var value = btn.getAttribute('data-consent');
      saveChoice(value);
      if (value === 'granted') loadAnalytics(); else stopAnalytics();
      hideBanner();
    });
    document.body.appendChild(banner);
  }

  var returnFocus = null;
  function showBanner(moveFocus) {
    if (!banner) buildBanner();
    banner.hidden = false;
    if (moveFocus) {
      returnFocus = document.activeElement;
      var current = readChoice();
      var target = banner.querySelector('[data-consent="' + (current || 'granted') + '"]');
      if (target) target.focus();
    }
  }
  function hideBanner() {
    banner.hidden = true;
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
    returnFocus = null;
  }

  function init() {
    var choice = readChoice();
    if (choice === 'granted') loadAnalytics();
    else if (choice !== 'denied') showBanner(false);

    document.addEventListener('click', function (e) {
      var trigger = e.target.closest && e.target.closest('[data-cookie-settings]');
      if (!trigger) return;
      e.preventDefault();
      showBanner(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
