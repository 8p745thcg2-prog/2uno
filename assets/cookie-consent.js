/* 2UNO slapukų sutikimo valdymas. Išorinis failas (ne įterptinis <script>), todėl
   nereikia atnaujinti functions/_middleware.js INLINE_SCRIPT_HASHES masyvo. */
(function () {
  'use strict';

  var STORAGE_KEY = '2uno_cookie_consent';
  var POSTHOG_KEY = 'phc_zM6sfTKggAcgci59frCm5hMVJWPvNivd6co4CozaTWMR';
  var POSTHOG_HOST = 'https://eu.i.posthog.com';

  function getConsent() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveConsent(analytics) {
    var data = { necessary: true, analytics: !!analytics, ts: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function loadPostHog() {
    if (!POSTHOG_KEY || (window.posthog && window.posthog.__loaded)) return;
    !(function (t, e) {
      var o, n, p, r;
      e.__SV || (window.posthog && window.posthog.__loaded) || ((window.posthog = e), (e._i = []), (e.init = function (i, s, a) {
        function g(t, e) {
          var o = e.split('.');
          2 == o.length && ((t = t[o[0]]), (e = o[1])),
            (t[e] = function () {
              t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
            });
        }
        (p ||
          (((p = t.createElement('script')).type = 'text/javascript'),
          (p.crossOrigin = 'anonymous'),
          (p.async = !0),
          (p.src = s.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js'),
          (p.onerror = function () {
            p = null;
          }),
          (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r)));
        var u = e;
        for (
          void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
            (u.people = u.people || []),
            Object.defineProperty(u, 'toString', {
              configurable: !0,
              enumerable: !0,
              writable: !0,
              value: function (t) {
                var e = 'posthog';
                return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
              },
            }),
            Object.defineProperty(u.people, 'toString', {
              configurable: !0,
              enumerable: !0,
              writable: !0,
              value: function () {
                return u.toString(1) + '.people (stub)';
              },
            }),
            (o =
              'Eh Rh Ph Oh Dh qh init yd bd dd fd Sd wc md xd ad Ed Ad Rd Pd Od Fd capture getExtension gr pd gd calculateEventProperties Dd register register_once register_for_session unregister unregister_for_session zd hd jd getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys onActiveMatchingSurveysChanged renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync Hd identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset Ud shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty qd Td createPersonProfile setInternalOrTestUser Bd Uh zh opt_in_capturing opt_out_capturing Hh has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing $d debug kc Ds getPageViewId captureTraceFeedback captureTraceMetric rd'.split(
                ' '
              )),
            n = 0;
          n < o.length;
          n++
        )
          g(u, o[n]);
        e._i.push([i, s, a]);
      }),
        (e.__SV = 1));
    })(document, window.posthog || []);
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      defaults: '2026-05-30',
      person_profiles: 'identified_only',
    });
  }

  function applyConsent(consent) {
    if (consent && consent.analytics) loadPostHog();
  }

  /* ---- Banerio vartotojo sąsaja ---- */

  var root, panel, settingsOpen;

  function buildBanner() {
    root = document.createElement('div');
    root.className = 'cc-banner';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Slapukų nustatymai');
    root.innerHTML =
      '<div class="cc-banner-inner">' +
      '<p class="cc-text">Naudojame būtinus slapukus, kad svetainė tinkamai veiktų. Gavę jūsų sutikimą, naudosime ir analitikos slapukus, kad suprastume, kaip naudojatės svetaine, ir galėtume ją tobulinti. Plačiau: <a href="slapukai.html">Slapukų politika</a>.</p>' +
      '<div class="cc-actions">' +
      '<button type="button" class="cc-btn cc-btn-text" data-cc="settings">Nustatymai</button>' +
      '<button type="button" class="cc-btn cc-btn-outline" data-cc="necessary">Tik būtini</button>' +
      '<button type="button" class="cc-btn cc-btn-primary" data-cc="all">Priimti visus</button>' +
      '</div>' +
      '</div>' +
      '<div class="cc-panel hidden">' +
      '<div class="cc-panel-row">' +
      '<div><strong>Būtini</strong><p>Reikalingi svetainės veikimui ir saugumui (Cloudflare, apsauga nuo robotų). Jų negalima išjungti.</p></div>' +
      '<span class="cc-toggle cc-toggle-locked" aria-hidden="true"><span></span></span>' +
      '</div>' +
      '<div class="cc-panel-row">' +
      '<div><strong>Analitika</strong><p>Padeda suprasti, kaip lankytojai naudojasi svetaine, kad galėtume ją tobulinti.</p></div>' +
      '<label class="cc-toggle"><input type="checkbox" id="cc-analytics-toggle"><span></span></label>' +
      '</div>' +
      '<div class="cc-actions">' +
      '<button type="button" class="cc-btn cc-btn-primary" data-cc="save">Išsaugoti pasirinkimus</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(root);
    panel = root.querySelector('.cc-panel');

    root.addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-cc');
      if (!action) return;
      if (action === 'settings') {
        panel.classList.toggle('hidden');
        return;
      }
      if (action === 'all') {
        applyConsent(saveConsent(true));
        hideBanner();
      } else if (action === 'necessary') {
        applyConsent(saveConsent(false));
        hideBanner();
      } else if (action === 'save') {
        var checked = document.getElementById('cc-analytics-toggle').checked;
        applyConsent(saveConsent(checked));
        hideBanner();
      }
    });
  }

  function showBanner(prefillAnalytics) {
    if (!root) buildBanner();
    var toggle = document.getElementById('cc-analytics-toggle');
    if (toggle) toggle.checked = !!prefillAnalytics;
    root.classList.add('cc-visible');
  }

  function hideBanner() {
    if (root) root.classList.remove('cc-visible');
  }

  /* Leidžia bet kurį puslapį (pvz. slapukai.html) atidaryti nustatymus iš naujo. */
  window.openCookieSettings = function () {
    var consent = getConsent();
    showBanner(consent ? consent.analytics : false);
    if (panel) panel.classList.remove('hidden');
  };

  function init() {
    var consent = getConsent();
    if (consent) {
      applyConsent(consent);
    } else {
      showBanner(false);
    }
    var reopenBtn = document.getElementById('cc-reopen-settings');
    if (reopenBtn) reopenBtn.addEventListener('click', window.openCookieSettings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
