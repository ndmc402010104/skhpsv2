/*
檔案位置：skhpsv2/assets/js/footer.js
時間戳記：2026-06-25 UTC+8
用途：Footer 三區 runtime 摘要與單一完整 runtime panel；只保留 closed/full；full 開啟時立刻展開 tail。短頁會補足 tail 前導距離；長頁原頁底開啟時允許 signed tail spacer，把 flow runtime 上緣直接對齊「footer 上緣 - summary cards 高度」。本版保留五張 summary cards peek，只在 runtime cards 內滑動才展開；peek 狀態只預留「footer runtime 上緣到 viewport/page 底部」所需空間，不再預留整個 runtime；runtime 內部捲回頂端時收回五卡片。
*/

(function () {
  "use strict";

  var booted = false;
  var versionLoadStarted = false;
  var STYLE_ID = "skhps-footer-runtime-guard-style";
  var resizeObserver = null;
  var runtimeResizeObserver = null;
  var runtimeState = "closed";
  var runtimeDocked = false;
  var lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  var lastScrollDirection = "none";
  var measureRaf = 0;
  var runtimeTailStart = 0;
  var runtimeOpenScrollY = 0;
  var runtimeOpenedAtExistingBottom = false;
  var RUNTIME_PEEK_MAX_BOTTOM_GAP = 15;
  var runtimeDockSwitchLockUntil = 0;
  var runtimeFlowMeasurePauseUntil = 0;
  var runtimeFixedMode = "peek";
  var runtimeTouchStartY = 0;

  function rlog(status, action, detail) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "footer.js",
          category: "dom",
          action: action,
          status: status,
          detail: detail || ""
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "footer.js");

  var INFRA_TASKS = {
    "css-runtime": true,
    config: true,
    backend: true,
    runtime: true,
    header: true,
    footer: true,
    "loading-gate": true,
    loadingGate: true
  };

  function runtime() {
    return window.SKHPSRuntime || null;
  }

  function findFooter() {
    return document.querySelector("[data-skhps-footer]");
  }

  function ensureFooterGuardStyle() {
    if (document.getElementById(STYLE_ID)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".skhps-footer{max-width:100%;overflow-x:hidden;isolation:isolate!important;z-index:2147483000!important}",
      ".skhps-footer-left,.skhps-footer-center,.skhps-footer-right{min-width:0}",
      ".skhps-footer-left{overflow:hidden}",
      ".skhps-footer-page{overflow:hidden;text-overflow:ellipsis}",
      ".skhps-footer-page-line,.skhps-footer-runtime-line{display:flex;align-items:center;gap:6px;min-width:0;white-space:nowrap}",
      ".skhps-footer-runtime-line{font-size:.86em;opacity:.88;flex-wrap:wrap;row-gap:2px}",
      ".skhps-footer-env-summary{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap}",
      ".skhps-footer-env-chip{font-weight:800;letter-spacing:.02em;white-space:nowrap}",
      ".skhps-footer-env{font-weight:500}",
      ".skhps-footer-right{min-width:0;flex-wrap:wrap}",
      ".skhps-footer-lamp,.skhps-footer-env,.skhps-footer-css-refresh,.skhps-footer-runtime-toggle{flex:0 0 auto}",
      ".skhps-footer-css-refresh{border:0;background:transparent;color:inherit;font:inherit;font-weight:750;cursor:pointer;padding:2px 4px;white-space:nowrap}",
      "html[data-skhps-rwd-group='small'] .skhps-footer{flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;gap:6px!important;padding-top:8px!important;padding-bottom:8px!important}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-left,html[data-skhps-rwd-group='small'] .skhps-footer-center,html[data-skhps-rwd-group='small'] .skhps-footer-right{width:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;text-align:center!important;min-width:0}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-left{flex-direction:column!important;gap:2px!important;overflow:visible}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-page-line,html[data-skhps-rwd-group='small'] .skhps-footer-runtime-line{justify-content:center!important;text-align:center!important;white-space:normal!important;flex-wrap:wrap!important}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-runtime-line{font-size:11px;width:100%}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-center{font-size:11px;white-space:nowrap}",
      "html[data-skhps-rwd-group='small'] .skhps-footer-right{gap:6px!important;flex-wrap:wrap!important}",
,
      "@media (max-width:720px){.skhps-footer{align-items:center}.skhps-footer-left{display:flex;flex-direction:column;align-items:flex-start;gap:2px}.skhps-footer-page-line,.skhps-footer-runtime-line{white-space:normal}.skhps-footer-runtime-line{font-size:11px}.skhps-footer-center{font-size:11px}.skhps-footer-right{gap:4px}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function visualViewportMetrics() {
    var viewport = window.visualViewport || null;
    var layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var visualHeight = viewport && viewport.height ? viewport.height : layoutHeight;
    var offsetTop = viewport && viewport.offsetTop ? viewport.offsetTop : 0;
    var bottomGap = Math.max(0, Math.ceil(layoutHeight - visualHeight - offsetTop));

    return {
      layoutHeight: Math.max(0, Math.ceil(layoutHeight)),
      visualHeight: Math.max(0, Math.ceil(visualHeight)),
      offsetTop: Math.max(0, Math.ceil(offsetTop)),
      bottomGap: bottomGap
    };
  }

  function updateViewportCssVariables() {
    var metrics = visualViewportMetrics();

    document.documentElement.style.setProperty("--skhps-visual-viewport-height", metrics.visualHeight + "px");
    document.documentElement.style.setProperty("--skhps-visual-viewport-offset-top", Math.max(0, metrics.offsetTop) + "px");
    document.documentElement.style.setProperty("--skhps-visual-viewport-bottom-gap", metrics.bottomGap + "px");
    document.documentElement.setAttribute("data-skhps-visual-viewport-bottom-gap", String(metrics.bottomGap));
    return metrics;
  }

  function updateFooterSafeArea() {
    var footer = findFooter();
    var metrics = updateViewportCssVariables();
    if (!footer || !document.body) return;

    try {
      var style = window.getComputedStyle ? window.getComputedStyle(footer) : null;
      var isFixed = style && style.position === "fixed";
      var footerRect = footer.getBoundingClientRect();
      var viewportHeight = metrics.layoutHeight || window.innerHeight || document.documentElement.clientHeight || 0;
      var footerHeight = Math.ceil(footerRect.height || footer.offsetHeight || 0) || 48;
      var footerViewportTop = Math.max(0, Math.ceil(
        footerRect && Number.isFinite(Number(footerRect.top)) ? Number(footerRect.top) : viewportHeight - footerHeight - metrics.bottomGap
      ));
      var footerDockBottom = Math.max(0, Math.ceil(viewportHeight - footerViewportTop)) ||
        (isFixed ? footerHeight + metrics.bottomGap : footerHeight);

      /*
       * docked full 是 fixed 掛畫，不應該改變 document flow。
       * 只有 flow full 需要讓頁尾 runtime-tail 接續內容；如果 footer 是 fixed，才保留安全距離。
       */
      var shouldReserve = Boolean(isFixed);
      var height = shouldReserve ? footerHeight + metrics.bottomGap + 16 : 0;

      document.documentElement.setAttribute("data-skhps-footer-fixed", isFixed ? "true" : "false");
      document.documentElement.setAttribute("data-skhps-footer-reserve", shouldReserve ? "true" : "false");
      document.documentElement.style.setProperty("--skhps-footer-safe-bottom", height ? height + "px" : "0px");
      document.documentElement.style.setProperty("--skhps-footer-page-bottom-space", height ? height + "px" : "0px");
      document.documentElement.style.setProperty("--skhps-footer-height", footerHeight + "px");
      document.documentElement.style.setProperty("--skhps-footer-viewport-top", footerViewportTop + "px");
      document.documentElement.style.setProperty("--skhps-footer-dock-bottom", footerDockBottom + "px");
    } catch (error) {}
  }

  function observeFooterSize() {
    var footer = findFooter();
    if (!footer || resizeObserver || typeof ResizeObserver !== "function") return;

    resizeObserver = new ResizeObserver(function () {
      updateFooterSafeArea();
      scheduleMeasureRuntimePanel();
    });
    resizeObserver.observe(footer);
  }

  function getState() {
    if (runtime() && typeof runtime().getState === "function") {
      return runtime().getState();
    }

    return null;
  }

  function hostEnvFromLocation() {
    var host = String(window.location.hostname || "").toLowerCase();
    var protocol = String(window.location.protocol || "").toLowerCase();

    if (protocol === "file:" || host === "127.0.0.1" || host === "localhost" || host === "") return "LOCAL";
    if (host === "dev-skhps.jonaminz.com" || /^dev-[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "DEV";
    if (host === "skhps.jonaminz.com" || /^[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "PROD";
    if (/\.github\.io$/.test(host) && /^\/dev(?:\/|$)/i.test(window.location.pathname || "")) return "DEV";
    if (/\.github\.io$/.test(host)) return "PROD";
    if (window.SKHPS_APP_ENV || window.SKHPS_APP_CONFIG) return "EXTERNAL";
    return "UNKNOWN";
  }

  function pageTitle() {
    var html = document.documentElement;
    return String(
      html.dataset.skhpsPageTitle ||
      html.dataset.loadingTitle ||
      document.title ||
      "SKHPS"
    ).trim();
  }

  function normalizeEnvLabel(value) {
    value = String(value || "").trim().toLowerCase();
    if (value === "local-dev" || value === "local" || value === "localdev") return "LOCAL";
    if (value === "dev") return "DEV";
    if (value === "prod" || value === "production") return "PROD";
    if (value === "auto" || value === "") return "";
    return value.toUpperCase();
  }

  function runtimeRequestedLabel(state) {
    var requested = state && state.runtime ? state.runtime.requested : "";
    requested = normalizeEnvLabel(requested);
    return requested || "AUTO";
  }

  function runtimeEffectiveLabel(state) {
    var runtimeState = state && state.runtime ? state.runtime : {};
    return normalizeEnvLabel(
      runtimeState.effective ||
      (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env) ||
      document.documentElement.getAttribute("data-skhps-runtime") ||
      hostEnvFromLocation()
    ) || "UNKNOWN";
  }

  function pageEnvLabel(state) {
    state = state || {};
    return normalizeEnvLabel(currentPageEnvFromLocation()) || "UNKNOWN";
  }

  function scriptEnvLabel(state) {
    state = state || {};
    return normalizeEnvLabel(
      state.backend && state.backend.env ||
      state.runtime && state.runtime.effective ||
      (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env) ||
      document.documentElement.getAttribute("data-skhps-runtime")
    ) || "UNKNOWN";
  }

  function runtimeSummaryText(state) {
    var requested = runtimeRequestedLabel(state);
    var effective = runtimeEffectiveLabel(state);

    if (requested === "AUTO" || requested === effective) {
      return "Runtime " + effective;
    }

    return "Runtime " + requested + "→" + effective;
  }

  function footerEnvSummary(state) {
    return {
      page: pageEnvLabel(state),
      runtime: runtimeSummaryText(state),
      script: "Script " + scriptEnvLabel(state)
    };
  }

  function detectDeviceLabel() {
    var ua = String(navigator.userAgent || "").toLowerCase();
    var hasTouchPoints = typeof navigator.maxTouchPoints !== "undefined" && navigator.maxTouchPoints > 0;
    var hasTouch = hasTouchPoints || ("ontouchstart" in window);
    var w = window.screen ? Math.max(window.screen.width || 0, window.screen.height || 0)
                          : Math.max(window.innerWidth || 0, window.innerHeight || 0);

    if (!hasTouch) return "Desktop";
    if (/ipad/.test(ua) || (hasTouchPoints && !/mobile/.test(ua) && w >= 768)) return "Tablet";
    if (/mobile|android|iphone|ipod|blackberry|windows phone/.test(ua) || w < 768) return "Mobile";
    return "Touch";
  }

  function hostEnvLabel(state) {
    state = state || {};
    var host = state.host || {};
    var runtimeState = state.runtime || {};
    var hostEnv = host.env || hostEnvFromLocation();
    var effective = runtimeState.effective ||
      (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env ? String(window.SKHPS_APP_ENV.env).toUpperCase() : "") ||
      String(document.documentElement.getAttribute("data-skhps-runtime") || "").toUpperCase();

    if (hostEnv === "LOCAL" && effective && effective !== "LOCAL" && effective !== "UNKNOWN") {
      return "LOCAL→" + effective;
    }

    if ((hostEnv === "UNKNOWN" || hostEnv === "EXTERNAL") && effective) {
      return "EXTERNAL→" + effective;
    }

    return hostEnv || "UNKNOWN";
  }

  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "") + "/";
  }

  function currentHostPageEnvFromLocation() {
    var host = String(window.location.hostname || "").toLowerCase();
    var protocol = String(window.location.protocol || "").toLowerCase();

    if (protocol === "file:" || host === "127.0.0.1" || host === "localhost" || host === "") return "local";
    if (host === "dev-skhps.jonaminz.com" || /^dev-[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "dev";
    if (host === "skhps.jonaminz.com" || /^[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "prod";
    if (/\.github\.io$/.test(host) && /^\/dev(?:\/|$)/i.test(window.location.pathname || "")) return "dev";
    if (/\.github\.io$/.test(host)) return "prod";
    return "unknown";
  }

  function currentPageEnvFromLocation() {
    var hrefMap = null;
    var currentHref = String(window.location.href || "");
    var currentOriginPath = String(window.location.origin || "") + String(window.location.pathname || "");
    var localHref = "";
    var devHref = "";
    var prodHref = "";

    try {
      hrefMap = (window.SKHPS_APP_CONFIG && window.SKHPS_APP_CONFIG.href) || null;
    } catch (error) {
      hrefMap = null;
    }

    if (hrefMap && typeof hrefMap === "object") {
      localHref = String(hrefMap["local-dev"] || hrefMap.local || "").trim();
      devHref = String(hrefMap.dev || "").trim();
      prodHref = String(hrefMap.prod || hrefMap.production || "").trim();

      if (devHref && currentHref.indexOf(devHref) === 0) return "dev";
      if (prodHref && currentHref.indexOf(prodHref) === 0) return "prod";
      if (localHref && (currentHref.indexOf(localHref) >= 0 || currentOriginPath.indexOf(localHref) >= 0)) return "local";
    }

    return currentHostPageEnvFromLocation();
  }

  function currentLocalProjectSegment() {
    var parts = String(window.location.pathname || "/").split("/").filter(Boolean);
    return parts.length ? parts[0] : "";
  }

  function shouldStripLocalProjectSegment(segment) {
    segment = String(segment || "").toLowerCase();
    if (!segment) return false;
    if (segment === "skhps" || segment === "skhpsv2" || segment === "devskhpsv2") return true;
    if (segment.indexOf("skhps-") === 0) return true;
    if (segment === "dressing-inventory" || segment === "smoke") return true;
    return false;
  }

  function currentRelativePagePath() {
    var pathname = String(window.location.pathname || "/");
    var env = currentPageEnvFromLocation();
    var parts;

    if (env === "local") {
      parts = pathname.split("/").filter(Boolean);
      if (parts.length && shouldStripLocalProjectSegment(parts[0])) {
        parts.shift();
        pathname = "/" + parts.join("/");
      }
    }

    if (!pathname || pathname === "/") return "/";
    return pathname.charAt(0) === "/" ? pathname : "/" + pathname;
  }

  function stripRuntimeSearchParams(search) {
    var params;

    try {
      params = new URLSearchParams(String(search || ""));
      ["runtime", "skhpsRuntime", "skhps-runtime", "env", "skhpsEnv", "skhps-env"].forEach(function (key) {
        params.delete(key);
      });
      return params.toString() ? "?" + params.toString() : "";
    } catch (error) {
      return String(search || "");
    }
  }

  function mergeSearch(baseSearch, pageSearch) {
    var params = new URLSearchParams();

    try {
      new URLSearchParams(String(baseSearch || "").replace(/^\?/, "")).forEach(function (value, key) {
        params.set(key, value);
      });
      new URLSearchParams(String(pageSearch || "").replace(/^\?/, "")).forEach(function (value, key) {
        params.set(key, value);
      });
    } catch (error) {}

    return params.toString() ? "?" + params.toString() : "";
  }

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function absoluteHttpHref(value) {
    value = String(value || "").trim();
    return /^https?:\/\//i.test(value) ? value : "";
  }

  function getCurrentPageIdCandidates() {
    var html = document.documentElement || {};
    var appEnv = window.SKHPS_APP_ENV || {};
    var config = window.SKHPS_APP_CONFIG || {};
    var candidates = [
      html.dataset ? html.dataset.skhpsPageId : "",
      html.getAttribute ? html.getAttribute("data-skhps-page-id") : "",
      appEnv.pageId,
      appEnv.appId,
      config.pageId,
      config.appId,
      window.SKHPS_PAGE_ID,
      window.SKHPS_APP_ID
    ];
    var seen = {};

    return candidates.map(function (value) {
      return String(value || "").trim();
    }).filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  function findPageConfig(container) {
    var ids;
    var pages;
    var found = null;

    if (!isPlainObject(container)) return null;
    pages = container.pages;
    if (!pages) return null;
    ids = getCurrentPageIdCandidates();

    if (isPlainObject(pages)) {
      ids.some(function (id) {
        if (isPlainObject(pages[id])) {
          found = pages[id];
          return true;
        }
        return false;
      });
      if (found) return found;
    }

    if (Array.isArray(pages)) {
      pages.some(function (page) {
        if (!isPlainObject(page)) return false;
        if (ids.indexOf(String(page.pageId || page.appId || page.id || "").trim()) >= 0) {
          found = page;
          return true;
        }
        return false;
      });
    }

    return found;
  }

  function inferHrefEnv(value) {
    var url;
    var runtimeValue;
    var host;

    value = absoluteHttpHref(value);
    if (!value) return "";

    try {
      url = new URL(value, window.location.href);
      runtimeValue = String(
        url.searchParams.get("skhpsRuntime") ||
        url.searchParams.get("runtime") ||
        url.searchParams.get("skhps-runtime") ||
        url.searchParams.get("skhpsEnv") ||
        url.searchParams.get("env") ||
        ""
      ).trim().toLowerCase();
      if (runtimeValue === "local-dev" || runtimeValue === "local" || runtimeValue === "localdev") return "local";
      if (runtimeValue === "dev" || runtimeValue === "prod" || runtimeValue === "production") return normalizeRuntimeQueryValue(runtimeValue);

      host = String(url.hostname || "").toLowerCase();
      if (host === "127.0.0.1" || host === "localhost" || host === "") return "local";
      if (host === "dev-skhps.jonaminz.com" || /^dev-[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "dev";
      if (host === "skhps.jonaminz.com" || /^[^.]+\.skhps\.jonaminz\.com$/.test(host)) return "prod";
      if (/\.github\.io$/.test(host) && /^\/dev(?:\/|$)/i.test(url.pathname || "")) return "dev";
      if (/\.github\.io$/.test(host)) return "prod";
    } catch (error) {}

    return "";
  }

  function hrefFromObjectForEnv(map, env) {
    var href = "";

    if (!isPlainObject(map)) return "";
    href = map[env] || map[env === "prod" ? "production" : env] || "";
    return absoluteHttpHref(href);
  }

  function hrefFromConfigForEnv(source, env) {
    var href = "";

    if (!isPlainObject(source)) return "";

    href = hrefFromObjectForEnv(source.href, env) || hrefFromObjectForEnv(source.hrefMap, env);
    if (href) return href;

    if (env === "dev") {
      href = source.devHref || source.hrefDev || "";
    } else if (env === "prod") {
      href = source.prodHref || source.hrefProd || source.productionHref || source.hrefProduction || "";
    }

    href = absoluteHttpHref(href);
    if (href) return href;

    /*
     * Generic href string is dangerous: on local it often means the current local URL.
     * Only accept it when its own runtime/host already proves it belongs to the requested env.
     */
    href = absoluteHttpHref(typeof source.href === "string" ? source.href : "");
    if (href && inferHrefEnv(href) === env) return href;

    return "";
  }

  function explicitHrefForEnv(env) {
    var appEnv = window.SKHPS_APP_ENV || {};
    var config = window.SKHPS_APP_CONFIG || {};
    var candidates = [
      findPageConfig(config),
      findPageConfig(appEnv),
      config.currentPage,
      config.page,
      appEnv.currentPage,
      appEnv.page,
      config,
      appEnv
    ];
    var href = "";

    env = normalizeRuntimeQueryValue(env);

    candidates.some(function (candidate) {
      href = hrefFromConfigForEnv(candidate, env);
      return Boolean(href);
    });

    return href || "";
  }


  var appManifestPromise = null;

  function appManifestUrl() {
    var value = window.SKHPS_APP_MANIFEST_URL || "app.json";

    try {
      return new URL(String(value || "app.json"), window.location.href).toString();
    } catch (error) {
      return "app.json";
    }
  }

  function fetchAppManifest() {
    if (appManifestPromise) return appManifestPromise;

    if (!window.fetch) {
      appManifestPromise = Promise.resolve(null);
      return appManifestPromise;
    }

    appManifestPromise = fetch(appManifestUrl(), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin"
    }).then(function (response) {
      if (!response || !response.ok) return null;
      return response.json();
    }).catch(function () {
      return null;
    });

    return appManifestPromise;
  }

  function hrefFromManifestForEnv(manifest, env) {
    var candidates;
    var href = "";

    if (!isPlainObject(manifest)) return "";

    candidates = [
      findPageConfig(manifest),
      manifest.currentPage,
      manifest.page,
      manifest
    ];

    env = normalizeRuntimeQueryValue(env);

    candidates.some(function (candidate) {
      href = hrefFromConfigForEnv(candidate, env);
      return Boolean(href);
    });

    return href || "";
  }

  function explicitHrefForEnvAsync(env) {
    var syncHref = explicitHrefForEnv(env);
    if (syncHref) return Promise.resolve(syncHref);

    return fetchAppManifest().then(function (manifest) {
      return hrefFromManifestForEnv(manifest, env);
    });
  }

  function siteBaseForEnv(env) {
    var config = window.SKHPS_CONFIG || {};
    var siteBase = config.site && config.site.baseUrl ? config.site.baseUrl : null;

    if (siteBase && siteBase[env]) {
      return siteBase[env];
    }

    if (env === "dev") return "https://dev-skhps.jonaminz.com/";
    if (env === "prod") return "https://skhps.jonaminz.com/";
    return "";
  }

  function isSkhpsCoreLocalPage() {
    var seg;

    if (currentPageEnvFromLocation() !== "local") return false;

    seg = currentLocalProjectSegment().toLowerCase();
    if (!seg) return true;
    return seg === "skhps" || seg === "skhpsv2" || seg === "devskhpsv2";
  }

  function isSkhpsCoreHost() {
    var host = String(window.location.hostname || "").toLowerCase();
    return host === "skhps.jonaminz.com" || host === "dev-skhps.jonaminz.com";
  }

  function currentHostBaseForEnv(env) {
    var host = String(window.location.hostname || "").toLowerCase();
    var protocol = String(window.location.protocol || "https:");

    if (!host || host === "127.0.0.1" || host === "localhost") return "";

    if (isSkhpsCoreHost()) return siteBaseForEnv(env);

    if (/^dev-[^.]+\.skhps\.jonaminz\.com$/.test(host)) {
      if (env === "dev") return protocol + "//" + host + "/";
      if (env === "prod") return protocol + "//" + host.replace(/^dev-/, "") + "/";
    }

    if (/^[^.]+\.skhps\.jonaminz\.com$/.test(host)) {
      if (env === "prod") return protocol + "//" + host + "/";
      return "";
    }

    return "";
  }

  function appHrefForEnv(env) {
    var explicit = explicitHrefForEnv(env);
    if (explicit) return explicit;

    /*
     * 不自行發明外部專案 dev 網域。
     * - skhpsv2 本體：可用 dev-skhps / skhps。
     * - 目前已經在 dev-xxx.skhps...：prod 可去掉 dev-。
     * - 目前在 xxx.skhps...：只承認 prod；要去 dev 必須有 devHref / hrefMap.dev，
     *   沒有就走 prod + runtime=dev。
     */
    if (isSkhpsCoreLocalPage()) return siteBaseForEnv(env);
    return currentHostBaseForEnv(env);
  }

  function buildSamePageHref(baseHref) {
    var pagePath = currentRelativePagePath();
    var cleanPageSearch = stripRuntimeSearchParams(window.location.search || "");
    var url;
    var basePath;
    var joinedPath;

    if (!baseHref) return "";

    try {
      url = new URL(baseHref, window.location.href);
      basePath = String(url.pathname || "/");

      if (/\.[a-z0-9]{1,10}$/i.test(basePath.split("/").pop() || "")) {
        url.pathname = pagePath;
      } else {
        basePath = basePath.replace(/\/+$/, "");
        joinedPath = (basePath ? basePath : "") + pagePath;
        url.pathname = joinedPath || "/";
      }

      url.search = mergeSearch(url.search, cleanPageSearch);
      url.hash = window.location.hash || url.hash || "";
      return url.toString();
    } catch (error) {
      return "";
    }
  }

  function normalizeRuntimeQueryValue(env) {
    env = String(env || "").trim().toLowerCase();
    if (env === "local-dev" || env === "local" || env === "localdev") return "dev";
    if (env === "production") return "prod";
    if (env === "dev" || env === "prod") return env;
    return env || "dev";
  }

  function addRuntimeToHref(href, env) {
    var url;

    if (!href) return "";

    try {
      url = new URL(href, window.location.href);
      ["runtime", "skhpsRuntime", "skhps-runtime", "env", "skhpsEnv", "skhps-env"].forEach(function (key) {
        url.searchParams.delete(key);
      });
      url.searchParams.set("skhpsRuntime", normalizeRuntimeQueryValue(env));
      return url.toString();
    } catch (error) {
      return href;
    }
  }

  function probePageExists(href) {
    if (!href || !window.fetch || !/^https?:\/\//i.test(String(href))) {
      return Promise.resolve(null);
    }

    return fetch(href, {
      method: "HEAD",
      cache: "no-store",
      credentials: "omit"
    }).then(function (response) {
      if (response && response.status >= 200 && response.status < 400) return true;
      if (response && (response.status === 404 || response.status === 410)) return false;
      return null;
    }).catch(function () {
      return null;
    });
  }

  function targetEnvFromCurrentPage() {
    var current = currentPageEnvFromLocation();
    var hasAppHref = Boolean(window.SKHPS_APP_CONFIG && window.SKHPS_APP_CONFIG.href);

    if (hasAppHref) {
      if (current === "local") return "dev";
      if (current === "dev") return "prod";
      if (current === "prod") return "dev";
      return "prod";
    }

    if (current === "local") return "dev";
    if (current === "dev") return "prod";
    if (current === "prod") return "dev";
    return "prod";
  }

  function prodBaseForFallback() {
    return explicitHrefForEnv("prod") || appHrefForEnv("prod") || (isSkhpsCoreLocalPage() || isSkhpsCoreHost() ? siteBaseForEnv("prod") : "");
  }

  function prodBaseForFallbackAsync() {
    var syncBase = prodBaseForFallback();
    if (syncBase) return Promise.resolve(syncBase);

    return explicitHrefForEnvAsync("prod").then(function (href) {
      return href || appHrefForEnv("prod") || (isSkhpsCoreLocalPage() || isSkhpsCoreHost() ? siteBaseForEnv("prod") : "");
    });
  }

  function prodFallbackHrefForDevIntent() {
    var prodBase = prodBaseForFallback();
    var prodHref = buildSamePageHref(prodBase);
    return addRuntimeToHref(prodHref, "dev");
  }

  function prodFallbackHrefForDevIntentAsync() {
    return prodBaseForFallbackAsync().then(function (prodBase) {
      var prodHref = buildSamePageHref(prodBase);
      return addRuntimeToHref(prodHref, "dev");
    });
  }

  function resolveToggleHref() {
    var targetEnv = targetEnvFromCurrentPage();
    var hasAppHref = Boolean(window.SKHPS_APP_CONFIG && window.SKHPS_APP_CONFIG.href);

    if (hasAppHref) {
      return explicitHrefForEnvAsync(targetEnv).then(function (href) {
        return href || "";
      });
    }

    if (targetEnv === "prod") {
      return prodBaseForFallbackAsync().then(function (targetBase) {
        return buildSamePageHref(targetBase);
      });
    }

    return explicitHrefForEnvAsync("dev").then(function (explicitDevBase) {
      var targetBase = explicitDevBase || appHrefForEnv("dev");
      var targetHref = buildSamePageHref(targetBase);

      if (!targetHref) {
        return prodFallbackHrefForDevIntentAsync();
      }

      return probePageExists(targetHref).then(function (exists) {
        if (exists === false) return prodFallbackHrefForDevIntentAsync();
        return targetHref;
      });
    });
  }

  function toggleHref() {
    var current = currentPageEnvFromLocation();
    var targetEnv = targetEnvFromCurrentPage();
    var targetBase = "";
    var targetHref = "";

    if (targetEnv === "prod") {
      targetBase = explicitHrefForEnv("prod") || appHrefForEnv("prod") || (isSkhpsCoreLocalPage() || isSkhpsCoreHost() ? siteBaseForEnv("prod") : "");
      return buildSamePageHref(targetBase);
    }

    targetBase = explicitHrefForEnv("dev") || appHrefForEnv("dev");
    targetHref = buildSamePageHref(targetBase);

    if (!targetHref || current === "local") {
      return targetHref || prodFallbackHrefForDevIntent();
    }

    return targetHref;
  }

  function navigateEnvToggle(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    resolveToggleHref().then(function (href) {
      if (href) window.location.href = href;
    }).catch(function () {
      var href = toggleHref();
      if (href) window.location.href = href;
    });
  }

  function debugEnvToggle() {
    var current = currentPageEnvFromLocation();
    var targetEnv = targetEnvFromCurrentPage();

    return Promise.all([
      resolveToggleHref(),
      explicitHrefForEnvAsync("dev"),
      explicitHrefForEnvAsync("prod")
    ]).then(function (values) {
      return {
        currentHref: window.location.href,
        currentPageEnv: current,
        targetEnv: targetEnv,
        localProjectSegment: currentLocalProjectSegment(),
        relativePagePath: currentRelativePagePath(),
        explicitDevBase: values[1] || "",
        explicitProdBase: values[2] || "",
        manifestUrl: appManifestUrl(),
        runtimeQueryKey: "skhpsRuntime",
        resolvedHref: values[0] || ""
      };
    });
  }

  function getBusinessVersionInfo() {
    var appEnv = window.SKHPS_APP_ENV || {};
    var appVersion = window.SKHPS_APP_VERSION || window.SKHPS_APP_VERSION_INFO || null;
    var envVersion = appEnv.appVersion || appEnv.version || "";

    if (appVersion && typeof appVersion === "object" && appVersion.version) {
      return appVersion;
    }

    if (envVersion) {
      return {
        appId: appEnv.appId || window.SKHPS_APP_ID || "",
        version: String(envVersion || "").trim(),
        source: "SKHPS_APP_ENV"
      };
    }

    /*
      Legacy fallback 只給舊頁面過渡用。
      新外部專案標準仍是 version.js -> window.SKHPS_APP_VERSION。
    */
    if (window.SKHPS_VERSION && window.SKHPS_VERSION.version) {
      return window.SKHPS_VERSION;
    }

    return null;
  }

  function loadVersionJsIfNeeded() {
    if (getBusinessVersionInfo() || versionLoadStarted) return;
    versionLoadStarted = true;

    var script = document.createElement("script");
    script.src = "version.js?v=" + encodeURIComponent(String(Date.now()));
    script.async = true;
    rlog("RUN", "loadScript", script.src);
    script.onload = function () {
      if (window.SKHPS_APP_VERSION && !window.SKHPS_APP_VERSION_INFO) {
        window.SKHPS_APP_VERSION_INFO = window.SKHPS_APP_VERSION;
      }
      rlog("OK", "scriptLoaded", script.src);
      render();
    };
    script.onerror = function () {
      rlog("WARN", "scriptError", script.src);
      render();
    };
    document.head.appendChild(script);
  }

  function versionText() {
    var versionInfo = getBusinessVersionInfo();
    var version = versionInfo && versionInfo.version ? String(versionInfo.version || "").trim() : "";

    return version || "v.unknown";
  }

  function failedTasks(gate) {
    return (gate.failedTasks || []).concat(gate.failed || []);
  }

  function completedTasks(gate) {
    return gate.completedTasks || gate.done || [];
  }

  function requiredTasks(gate) {
    return gate.requiredTasks || gate.required || [];
  }

  function traffic(status, label, title) {
    var icons = {
      green: "🟢",
      yellow: "🟡",
      red: "🔴",
      gray: "⚪"
    };

    return {
      icon: icons[status] || icons.gray,
      status: status,
      label: label,
      title: title || label
    };
  }

  function deriveGate(state) {
    var gate = state && state.loadingGate ? state.loadingGate : {};
    var required = requiredTasks(gate);
    var completed = completedTasks(gate);
    var failed = failedTasks(gate);
    var releaseReason = gate.releaseReason || "";

    if (!required.length && !completed.length && !failed.length) return traffic("gray", "Gate", "沒有 loading gate 資料");
    if (failed.length || /timeout|error|force-release-with-error/i.test(releaseReason)) return traffic("red", "Gate", releaseReason || "loading gate failed");
    if (required.length && required.every(function (task) { return completed.indexOf(task) >= 0; }) && (!releaseReason || releaseReason === "all-ready")) return traffic("green", "Gate", "all-ready");
    return traffic("yellow", "Gate", "loading");
  }

  function deriveConfig(state) {
    var config = state && state.config ? state.config : {};
    var module = state && state.modules ? state.modules.config : null;
    if (module && module.status === "fail") return traffic("red", "Config", module.error || "config failed");
    if (config.loaded && config.source) return traffic("green", "Config", config.source);
    if (config.loaded) return traffic("yellow", "Config", "inferred");
    return traffic("gray", "Config", "unknown");
  }

  function deriveBackend(state) {
    var backend = state && state.backend ? state.backend : {};
    var calls = backend.calls || [];
    if (calls.some(function (call) { return call.status === "fail" || call.status === "error"; })) return traffic("red", "Backend", "backend call failed");
    if (calls.some(function (call) { return call.status === "ok" || call.status === "done"; })) return traffic("green", "Backend", "backend call ok");
    if (backend.loaded) return traffic("yellow", "Backend", "backend loaded, no successful call yet");
    return traffic("gray", "Backend", "unknown");
  }

  function deriveCss(state) {
    var css = state && state.cssRuntime ? state.cssRuntime : {};
    var module = state && state.modules ? state.modules.cssRuntime : null;
    var label = "CSS";
    var title = [
      css.source ? "source=" + css.source : "",
      css.hash ? "hash=" + css.hash : "",
      css.updatedAt || css.generatedAt ? "updatedAt=" + (css.updatedAt || css.generatedAt) : "",
      css.refreshStatus ? "refresh=" + css.refreshStatus : "",
      css.lastRefreshAt ? "lastRefresh=" + css.lastRefreshAt : "",
      css.refreshError ? "error=" + css.refreshError : ""
    ].filter(Boolean).join(" | ");

    if (module && module.status === "fail") return traffic("red", label, module.error || "css failed");
    if (css.loaded && css.source === "default-fallback") return traffic("yellow", label, title || "default-fallback");
    if (css.loaded && css.refreshStatus === "failed") return traffic("yellow", label, title || "refresh failed");
    if (css.loaded && css.source === "css-file") return traffic("green", label, title || "uni-CSS.CSS");
    if (css.loaded && css.source === "localStorage-cache") return traffic("yellow", label, title || "localStorage cache");
    if (css.loaded) return traffic("green", label, title || css.source || "live");
    if (module && module.status === "waiting") return traffic("yellow", "CSS", "loading");
    return traffic("gray", "CSS", "unknown");
  }

  function pageDataTask(state) {
    var html = document.documentElement;
    var configured = html.getAttribute("data-skhps-page-data-task");
    var required = state && state.loadingGate ? requiredTasks(state.loadingGate) : [];

    if (state && (state.pageDataTask || state.appDataTask)) return state.pageDataTask || state.appDataTask;
    if (configured) return configured;

    return required.find(function (task) {
      return !INFRA_TASKS[task];
    }) || "";
  }

  function deriveData(state) {
    var gate = state && state.loadingGate ? state.loadingGate : {};
    var data = state && state.data ? state.data : {};
    var task = pageDataTask(state);
    var completed = completedTasks(gate);
    var failed = failedTasks(gate);
    var dataTask = data.task || task || "Data";
    var dataMessage = data.message || dataTask;
    var status = String(data.status || "").toLowerCase();

    if (status === "ok" || status === "green" || status === "success") return traffic("green", "Data", dataMessage);
    if (status === "warn" || status === "warning" || status === "yellow") return traffic("yellow", "Data", dataMessage);
    if (status === "fail" || status === "failed" || status === "error" || status === "red") return traffic("red", "Data", dataMessage);
    if (status === "waiting" || status === "loading" || status === "pending" || status === "run") return traffic("yellow", "Data", dataMessage);
    if (status === "gray" || status === "idle") return traffic("gray", "Data", dataMessage);
    if (!task) return traffic("gray", "Data", "not specified");
    if (failed.some(function (entry) { return entry.task === task || entry === task; })) return traffic("red", "Data", task + " failed");
    if (completed.indexOf(task) >= 0) return traffic("green", "Data", task);
    return traffic("yellow", "Data", task + " loading");
  }

  function getFooterRuntimeSummary(state) {
    state = state || getState() || {};
    return [
      deriveGate(state),
      deriveConfig(state),
      deriveBackend(state),
      deriveCss(state),
      deriveData(state)
    ];
  }

  function createStatusLamp(item) {
    var span = document.createElement("span");
    span.className = "skhps-footer-lamp skhps-footer-lamp-" + item.status;
    span.title = item.title;
    span.textContent = item.icon + " " + item.label;
    return span;
  }

  function forceReloadCssSheet(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    try {
      if (
        window.SKHPSCssSheetRuntimeLoader &&
        typeof window.SKHPSCssSheetRuntimeLoader.clearCache === "function"
      ) {
        window.SKHPSCssSheetRuntimeLoader.clearCache();
      } else {
        localStorage.removeItem("skhpsv2.cssSheetRuntimeCache.v1");
        localStorage.removeItem("skhpsv2.cssSheetRuntimeCache.v2");
        sessionStorage.removeItem("skhpsv2.cssSheetRuntimeSessionReady.v1");
      }
    } catch (error) {
      console.warn("CSS Sheet force reload cache clear failed:", error);
    }

    try {
      if (runtime() && typeof runtime().log === "function") {
        runtime().log({
          level: "info",
          module: "footer",
          message: "force-css-sheet-reload",
          data: {
            source: "footer CSS button"
          }
        });
      }
    } catch (error) {}

    window.location.reload();
  }

  function createCssRefreshButton(item) {
    var button = document.createElement("button");
    button.className = "skhps-footer-css-refresh skhps-footer-lamp skhps-footer-lamp-" + item.status;
    button.type = "button";
    button.title = item.title || "清除 CSS cache 並重新從 CSS總表讀取";
    button.textContent = item.icon + " " + item.label;
    button.addEventListener("click", forceReloadCssSheet);
    return button;
  }

  function loadingLocked() {
    var html = document.documentElement;

    return html.classList.contains("skhps-css-loading") ||
      html.classList.contains("skhps-loading") ||
      html.getAttribute("data-skhps-loading-released") !== "true";
  }

  function normalizeRuntimeState(state) {
    state = String(state || "").trim().toLowerCase();
    if (state === "full") return "full";
    return "closed";
  }

  function setRuntimeDocked(docked) {
    runtimeDocked = Boolean(docked && runtimeState === "full");
    document.documentElement.setAttribute("data-skhps-runtime-docked", runtimeDocked ? "true" : "false");
    if (!runtimeDocked) {
      setRuntimeFixedMode("");
    } else if (!runtimeFixedMode) {
      setRuntimeFixedMode("peek");
    }
    return runtimeDocked;
  }

  function setRuntimeFixedMode(mode) {
    mode = String(mode || "").trim().toLowerCase();
    if (mode !== "peek" && mode !== "scroll") mode = "";
    runtimeFixedMode = mode;
    if (mode) {
      document.documentElement.setAttribute("data-skhps-runtime-fixed-mode", mode);
    } else {
      document.documentElement.removeAttribute("data-skhps-runtime-fixed-mode");
    }
    return runtimeFixedMode;
  }

  function runtimePanelElement() {
    return document.getElementById("skhps-runtime-panel");
  }

  function runtimePanelContainsTarget(target) {
    var panel = runtimePanelElement();
    return Boolean(panel && target && (target === panel || panel.contains(target)));
  }

  function expandRuntimeFixedPanelFromPeek(scrollDelta) {
    var panel;

    if (runtimeState !== "full" || !runtimeDocked || runtimeFixedMode !== "peek") {
      return false;
    }

    panel = runtimePanelElement();
    if (panel) {
      try { panel.scrollTop = 0; } catch (error) {}
    }

    /*
     * 從五卡片 peek 展開 full runtime 時，第一幀必須「頂端對齊頂端」。
     * 觸發展開的那一次 wheel/touch 只負責切模式，不應該順手把 delta 灌進
     * panel.scrollTop；否則會先看到 summary cards 被推到 viewport 上方，
     * 接著 visualViewport / measure 再修正，形成「先歪一下再跳正」的感覺。
     */
    setRuntimeFixedMode("scroll");
    updateFooterSafeArea();
    measureRuntimePanel();

    return true;
  }

  function collapseRuntimeFixedPanelToPeek() {
    var panel;

    if (runtimeState !== "full" || !runtimeDocked || runtimeFixedMode !== "scroll") {
      return false;
    }

    panel = runtimePanelElement();
    if (panel) {
      try { panel.scrollTop = 0; } catch (error) {}
    }

    setRuntimeFixedMode("peek");
    updateFooterSafeArea();
    scheduleMeasureRuntimePanel();
    return true;
  }

  function runtimePanelAtTop() {
    var panel = runtimePanelElement();
    if (!panel) return true;
    try {
      return Number(panel.scrollTop || 0) <= 1;
    } catch (error) {
      return true;
    }
  }

  function consumeRuntimeScrollEvent(event) {
    if (!event) return;

    if (typeof event.preventDefault === "function" && event.cancelable !== false) {
      event.preventDefault();
    }

    if (typeof event.stopPropagation === "function") {
      event.stopPropagation();
    }
  }

  function scrollRuntimePanelBy(delta) {
    var panel = runtimePanelElement();
    var amount = Number(delta) || 0;

    if (!panel || !amount) return 0;

    try {
      panel.scrollTop = Math.max(0, Number(panel.scrollTop || 0) + amount);
      return Number(panel.scrollTop || 0);
    } catch (error) {
      return 0;
    }
  }

  function ensureRuntimeTail() {
    var tail = document.getElementById("skhps-runtime-tail");
    var footer = findFooter();

    if (tail) return tail;
    if (!document.body) return null;

    tail = document.createElement("div");
    tail.id = "skhps-runtime-tail";
    tail.className = "skhps-runtime-tail";
    tail.setAttribute("data-skhps-runtime-tail", "");

    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(tail, footer);
    } else {
      document.body.appendChild(tail);
    }

    return tail;
  }

  function ensureRuntimePanel(refresh) {
    var tail = ensureRuntimeTail();
    var panel = null;
    var host = null;

    document.documentElement.setAttribute("data-skhps-runtime-panel-open", runtimeState === "closed" ? "false" : "true");
    if (refresh && runtime() && typeof runtime().renderPanel === "function") {
      panel = runtime().renderPanel();
    } else {
      panel = document.getElementById("skhps-runtime-panel");
    }

    if (!panel && runtime() && typeof runtime().renderPanel === "function") {
      panel = runtime().renderPanel();
    }

    if (panel) {
      panel.style.removeProperty("margin-top");
      panel.style.removeProperty("position");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
      panel.style.removeProperty("left");
      panel.style.removeProperty("height");
      panel.style.removeProperty("max-height");
      panel.style.removeProperty("overflow");
      panel.style.removeProperty("z-index");
      panel.style.removeProperty("box-shadow");
    }

    /*
     * 單一 runtime panel，兩種掛法，只有 closed/full 狀態：
     * - full + docked：掛到 body，用 fixed 方式把整張 runtime 掛在 footer 下面，只露出 summary cards。
     * - full + flow：掛回 runtime-tail，恢復原本「頁尾順接、繼續往下滑看到 runtime」的 flow。
     */
    host = runtimeState === "full" && !runtimeDocked && tail ? tail : document.body;
    if (host && panel && panel.parentNode !== host) {
      host.appendChild(panel);
    }

    return panel;
  }

  function clearRuntimeStateClasses() {
    var html = document.documentElement;

    html.classList.remove("runtime-state-closed");
    html.classList.remove("runtime-state-full");
  }

  function setRuntimeState(state, options) {
    var html = document.documentElement;

    options = options || {};
    state = normalizeRuntimeState(state);

    if (loadingLocked()) {
      state = "closed";
    }

    if (state === "full" && runtimeState !== "full") {
      runtimeOpenScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      setRuntimeFixedMode("peek");
    }
    if (state === "closed") {
      runtimeOpenScrollY = 0;
      runtimeOpenedAtExistingBottom = false;
      setRuntimeFixedMode("");
      setRuntimeCssSignedNumber("--skhps-runtime-tail-spacer", 0);
    }

    runtimeState = state;
    clearRuntimeStateClasses();
    html.classList.add("runtime-state-" + state);
    html.setAttribute("data-skhps-runtime-state", state);
    html.setAttribute("data-skhps-runtime-panel-open", state === "closed" ? "false" : "true");
    setRuntimeDocked(state === "full" ? options.docked !== false : false);

    ensureRuntimePanel(true);
    updateFooterSafeArea();
    measureRuntimePanel();

    if (!options.skipRender) {
      render({
        restoreToggleFocus: Boolean(options.restoreToggleFocus)
      });
      measureRuntimePanel();
    } else {
      scheduleMeasureRuntimePanel();
    }

    return runtimeState;
  }

  function setRuntimeCssNumber(name, value) {
    value = Math.max(0, Math.ceil(Number(value) || 0));
    document.documentElement.style.setProperty(name, value + "px");
    return value;
  }

  function setRuntimeCssSignedNumber(name, value) {
    value = Math.ceil(Number(value) || 0);
    document.documentElement.style.setProperty(name, value + "px");
    return value;
  }

  function measureRuntimePanel() {
    var footer = findFooter();
    var tail = ensureRuntimeTail();
    var panel = ensureRuntimePanel(false);
    var summary = panel ? panel.querySelector(".skhps-runtime-summary") : null;
    var traffic = panel ? panel.querySelector("[data-skhps-runtime-section='traffic-lights']") : null;
    var viewportMetrics = updateViewportCssVariables();
    var viewportHeight = viewportMetrics.layoutHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    var visualViewportHeight = viewportMetrics.visualHeight || viewportHeight;
    var footerHeight = 48;
    var footerViewportTop = 0;
    var footerDockBottom = 48;
    var panelTop = 0;
    var trafficTop = 0;
    var summaryHeight = 0;
    var fullHeight = 0;
    var tailHeight = 0;
    var tailSpacer = 0;
    var currentTailSpacer = 0;
    var naturalTailStart = 0;
    var dockedSummaryTop = 0;
    var dockedReserveHeight = 0;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var footerRect;
    var panelRect;
    var trafficRect;
    var tailRect;
    var tailStyle;

    if (footer) {
      footerRect = footer.getBoundingClientRect();
      footerHeight = Math.ceil(footerRect.height || footer.offsetHeight || 0) || 48;
      footerViewportTop = Math.max(0, Math.ceil(
        footerRect && Number.isFinite(Number(footerRect.top)) ? Number(footerRect.top) : viewportHeight - footerHeight - viewportMetrics.bottomGap
      ));
      footerDockBottom = Math.max(0, Math.ceil(viewportHeight - footerViewportTop)) || footerHeight;
    } else {
      footerViewportTop = Math.max(0, viewportHeight - footerHeight);
    }

    if (panel) {
      panelRect = panel.getBoundingClientRect();
      panelTop = panelRect.top;
      trafficRect = traffic ? traffic.getBoundingClientRect() : null;
      trafficTop = trafficRect ? trafficRect.top : 0;

      if (traffic && typeof traffic.offsetTop === "number" && traffic.offsetTop > 0) {
        summaryHeight = Math.ceil(traffic.offsetTop);
      } else if (summary) {
        summaryHeight = Math.ceil((summary.offsetTop || 0) + (summary.offsetHeight || 0));
      } else if (trafficRect && trafficTop > panelTop) {
        summaryHeight = Math.max(0, Math.ceil(trafficTop - panelTop));
      } else {
        summaryHeight = 0;
      }

      fullHeight = Math.ceil(panel.scrollHeight || panelRect.height || 0);
    }

    /*
     * Docked runtime 使用 viewport 座標統一計算 footer 上緣。
     * 五卡片 peek 時，視覺上只需要預留「summary cards 高度 + 最多 15px」的頁尾跑道，
     * 不再把整段 footerDockBottom 一起塞進 document flow。
     *
     * 目的：頁面內容底緣與 runtime 五卡片上緣的空白最多約 15px，
     * 避免短頁底部出現一大片灰藍空白。
     */
    dockedSummaryTop = Math.max(0, Math.ceil((footerViewportTop || 0) - summaryHeight));
    dockedReserveHeight = Math.max(0, Math.ceil(summaryHeight + Math.min(RUNTIME_PEEK_MAX_BOTTOM_GAP, footerDockBottom || 0)));

    if (tail) {
      tailRect = tail.getBoundingClientRect();
      try {
        tailStyle = window.getComputedStyle ? window.getComputedStyle(tail) : null;
        currentTailSpacer = tailStyle ? parseFloat(tailStyle.marginTop || "0") : cssPixelValue("--skhps-runtime-tail-spacer");
      } catch (error) {
        currentTailSpacer = cssPixelValue("--skhps-runtime-tail-spacer");
      }
      currentTailSpacer = isNaN(currentTailSpacer) ? 0 : currentTailSpacer;
      naturalTailStart = Math.max(0, Math.round(scrollY + tailRect.top - currentTailSpacer));
    } else {
      naturalTailStart = 0;
    }

    /*
     * flow 接點定位：runtime panel 的上緣不應該對齊 footer 上緣。
     * 正確位置是「footer 上緣 - summary cards 高度」，也就是整張 runtime
     * 放進 flow 時，summary cards 的下緣剛好貼在 footer 上緣。
     *
     * 短頁：naturalTailStart 太高，使用正 spacer 補一段跑道。
     * 長頁原本已在頁底開啟：naturalTailStart 常常太低，必須允許負 spacer
     * 把 runtime-tail 往上拉到目前 viewport 的接點；這才是「畫到二樓」，不是
     * 「電梯在二樓、畫在一樓」。
     * 其他長頁位置：不能用負 spacer 把尾巴硬拉到目前視窗，避免提前出現 runtime。
     */
    if (runtimeState === "full" && fullHeight > 0 && !runtimeDocked) {
      tailSpacer = Math.ceil((runtimeOpenScrollY || 0) + dockedSummaryTop - naturalTailStart);
      if (!runtimeOpenedAtExistingBottom) {
        tailSpacer = Math.max(0, tailSpacer);
      }
    } else {
      tailSpacer = 0;
    }

    runtimeTailStart = naturalTailStart + tailSpacer;
    if (runtimeState === "full" && runtimeDocked) {
      tailHeight = dockedReserveHeight;
    } else {
      tailHeight = runtimeState === "full" && !runtimeDocked ? fullHeight : 0;
    }

    setRuntimeCssNumber("--skhps-footer-height", footerHeight || 48);
    setRuntimeCssNumber("--skhps-footer-viewport-top", footerViewportTop);
    setRuntimeCssNumber("--skhps-footer-dock-bottom", footerDockBottom || footerHeight || 48);
    setRuntimeCssNumber("--skhps-runtime-docked-reserve-height", dockedReserveHeight);
    setRuntimeCssNumber("--skhps-runtime-summary-height", summaryHeight);
    setRuntimeCssNumber("--skhps-runtime-full-height", fullHeight);
    setRuntimeCssNumber("--skhps-runtime-visible-height", fullHeight);
    setRuntimeCssNumber("--skhps-runtime-tail-height", tailHeight);
    setRuntimeCssNumber("--skhps-runtime-mobile-max-height", Math.max(0, visualViewportHeight - (footerDockBottom || footerHeight || 48) - 16));
    setRuntimeCssSignedNumber("--skhps-runtime-tail-spacer", tailSpacer);

    document.documentElement.setAttribute("data-skhps-runtime-tail-start", String(runtimeTailStart));
    document.documentElement.setAttribute("data-skhps-runtime-tail-spacer", String(tailSpacer));
    document.documentElement.setAttribute("data-skhps-runtime-flow-switch-y", String(Math.max(0, Math.round(runtimeTailStart - viewportHeight + (footerDockBottom || footerHeight || 48) + summaryHeight))));
    document.documentElement.setAttribute("data-skhps-footer-viewport-top", String(footerViewportTop));
    document.documentElement.setAttribute("data-skhps-footer-dock-bottom", String(footerDockBottom || footerHeight || 48));
    document.documentElement.setAttribute("data-skhps-runtime-docked-reserve-height", String(dockedReserveHeight));
    document.documentElement.setAttribute("data-skhps-runtime-visible-height", String(fullHeight));

    return {
      footerHeight: footerHeight,
      footerViewportTop: footerViewportTop,
      footerDockBottom: footerDockBottom,
      dockedReserveHeight: dockedReserveHeight,
      panelTop: panelTop,
      trafficTop: trafficTop,
      summaryHeight: summaryHeight,
      fullHeight: fullHeight,
      visibleHeight: fullHeight,
      maxVisibleHeight: Math.max(0, viewportHeight - (footerDockBottom || footerHeight || 48) - 8),
      tailHeight: tailHeight,
      tailSpacer: tailSpacer,
      naturalTailStart: naturalTailStart,
      progress: Math.max(0, scrollY - runtimeTailStart),
      viewportHeight: viewportHeight,
      visualViewportHeight: visualViewportHeight,
      visualViewportBottomGap: viewportMetrics.bottomGap,
      runtimeTailStart: runtimeTailStart,
      flowSwitchY: Math.max(0, Math.round(runtimeTailStart - viewportHeight + (footerDockBottom || footerHeight || 48) + summaryHeight))
    };
  }

  function scheduleMeasureRuntimePanel() {
    if (measureRaf) return;

    measureRaf = window.requestAnimationFrame(function () {
      measureRaf = 0;
      measureRuntimePanel();
    });
  }

  function observeRuntimeSize() {
    var footer = findFooter();
    var tail = ensureRuntimeTail();
    var panel = document.getElementById("skhps-runtime-panel");
    var summary = panel ? panel.querySelector(".skhps-runtime-summary") : null;
    var traffic = panel ? panel.querySelector("[data-skhps-runtime-section='traffic-lights']") : null;

    if (typeof ResizeObserver !== "function") return;

    if (!runtimeResizeObserver) {
      runtimeResizeObserver = new ResizeObserver(scheduleMeasureRuntimePanel);
    }
    [footer, tail, panel, summary, traffic].forEach(function (node) {
      if (node) runtimeResizeObserver.observe(node);
    });
  }

  function focusRuntimeToggle() {
    var footer = findFooter();
    var toggle = footer ? footer.querySelector(".skhps-footer-runtime-toggle") : null;
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (!toggle || typeof toggle.focus !== "function") return;

    try {
      toggle.focus({
        preventScroll: true
      });
    } catch (error) {
      toggle.focus();
      try {
        window.scrollTo(scrollX, scrollY);
      } catch (scrollError) {}
    }
  }

  function toggleRuntimePanel(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    if (runtimeState === "full") {
      setRuntimeState("closed", {
        restoreToggleFocus: true
      });
      return;
    }

    /*
     * 2026-06-25 hard fix：Runtime 展開後直接維持 fixed docked panel。
     * runtime panel 自己 overflow-y:auto，不再等使用者第一次往下滑時
     * 由 docked 切 flow；這個切換正是手機上「一下滑、一下不滑」的來源。
     */
    runtimeOpenedAtExistingBottom = false;
    setRuntimeState("full", {
      docked: true,
      restoreToggleFocus: true
    });
  }

  function render(options) {
    options = options || {};
    var footer = findFooter();
    var state = getState();
    if (!footer) return;

    ensureFooterGuardStyle();
    loadVersionJsIfNeeded();
    footer.classList.add("skhps-footer");
    footer.innerHTML = "";
    var envSummary = footerEnvSummary(state);

    var left = document.createElement("div");
    left.className = "skhps-footer-left";

    var env = document.createElement("button");
    env.className = "skhps-footer-env";
    env.type = "button";
    env.textContent = "PAGE " + envSummary.page;
    env.title = "頁面來源；點擊切換正式版 / 測試版";
    env.addEventListener("click", navigateEnvToggle);

    var runtimeLine = document.createElement("div");
    runtimeLine.className = "skhps-footer-runtime-line";

    var pageChip = document.createElement("span");
    pageChip.className = "skhps-footer-env-chip skhps-footer-page-chip";
    pageChip.appendChild(env);

    var runtimeSep = document.createElement("span");
    runtimeSep.className = "skhps-footer-separator";
    runtimeSep.textContent = "｜";

    var runtimeChip = document.createElement("span");
    runtimeChip.className = "skhps-footer-env-chip skhps-footer-runtime-chip";
    runtimeChip.textContent = envSummary.runtime;

    var scriptSep = document.createElement("span");
    scriptSep.className = "skhps-footer-separator";
    scriptSep.textContent = "｜";

    var scriptChip = document.createElement("span");
    scriptChip.className = "skhps-footer-env-chip skhps-footer-script-chip";
    scriptChip.textContent = envSummary.script;

    var deviceSep = document.createElement("span");
    deviceSep.className = "skhps-footer-separator";
    deviceSep.textContent = "｜";

    var deviceChip = document.createElement("span");
    deviceChip.className = "skhps-footer-env-chip skhps-footer-device-chip";
    deviceChip.textContent = detectDeviceLabel();

    runtimeLine.appendChild(pageChip);
    runtimeLine.appendChild(runtimeSep);
    runtimeLine.appendChild(runtimeChip);
    runtimeLine.appendChild(scriptSep);
    runtimeLine.appendChild(scriptChip);
    runtimeLine.appendChild(deviceSep);
    runtimeLine.appendChild(deviceChip);

    left.appendChild(runtimeLine);

    var center = document.createElement("div");
    center.className = "skhps-footer-center";
    center.textContent = versionText();

    var right = document.createElement("div");
    right.className = "skhps-footer-right";

    getFooterRuntimeSummary(state).forEach(function (lamp) {
      right.appendChild(lamp.label === "CSS" ? createCssRefreshButton(lamp) : createStatusLamp(lamp));
    });

    var toggle = document.createElement("button");
    toggle.className = "skhps-footer-runtime-toggle";
    toggle.type = "button";
    toggle.textContent = runtimeState === "closed" ? "▲" : "▼";
    toggle.title = runtimeState === "closed" ? "展開 runtime" : (!runtimeDocked ? "關閉 runtime 並回到頁首" : "收合 runtime");
    toggle.setAttribute("aria-expanded", runtimeState === "closed" ? "false" : "true");
    toggle.setAttribute("aria-controls", "skhps-runtime-panel");
    toggle.addEventListener("click", toggleRuntimePanel);
    right.appendChild(toggle);

    footer.appendChild(left);
    footer.appendChild(center);
    footer.appendChild(right);
    ensureRuntimePanel(true);
    updateFooterSafeArea();
    observeFooterSize();
    observeRuntimeSize();
    scheduleMeasureRuntimePanel();

    if (options.restoreToggleFocus) {
      focusRuntimeToggle();
    }

  }

  function logViaRuntime(level, key, value, detail) {
    if (runtime() && typeof runtime().log === "function") {
      runtime().log({
        level: level,
        module: "footer",
        message: key + (value ? ": " + value : ""),
        data: detail || null
      });
    }
    render();
  }

  function setRuntimeStatus(name, status, detail, options) {
    options = options || {};

    if (runtime()) {
      if (status === "ok" && typeof runtime().done === "function") {
        runtime().done(name, { detail: detail || options.detail || "" });
      } else if ((status === "error" || status === "fail" || status === "failed") && typeof runtime().fail === "function") {
        runtime().fail(name, detail || "failed", options);
      } else if (typeof runtime().start === "function") {
        runtime().start(name);
      }
    }

    render();
  }

  function nearPageBottom() {
    var doc = document.documentElement;

    return (window.innerHeight || 0) + (window.scrollY || window.pageYOffset || doc.scrollTop || 0) >=
      doc.scrollHeight - 2;
  }

  function pageHasScrollableRunway() {
    var doc = document.documentElement;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    return doc.scrollHeight > viewportHeight + 2;
  }

  function cssPixelValue(name) {
    var value = 0;

    try {
      value = parseFloat(
        (window.getComputedStyle ? window.getComputedStyle(document.documentElement) : document.documentElement.style)
          .getPropertyValue(name)
      );
    } catch (error) {
      value = 0;
    }

    return isNaN(value) ? 0 : value;
  }

  function runtimeFlowSwitchY() {
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var footerDockBottom = cssPixelValue("--skhps-footer-dock-bottom") || cssPixelValue("--skhps-footer-height") || 48;
    var summaryHeight = cssPixelValue("--skhps-runtime-summary-height");

    if (!runtimeTailStart) {
      measureRuntimePanel();
    }

    /*
     * docked → flow 的無跳接點：
     * docked panel 的 summary top = viewport bottom - footerDockBottom - summaryHeight。
     * flow panel 的 top = runtimeTailStart - scrollY。
     * 兩者相等時切換，視覺上同一張 runtime 會從 footer 掛畫自然接回頁尾 flow。
     */
    return Math.max(0, Math.round(runtimeTailStart - viewportHeight + footerDockBottom + summaryHeight));
  }


  function runtimeDockSwitchLocked() {
    return Date.now() < runtimeDockSwitchLockUntil;
  }

  function lockRuntimeDockSwitch(ms) {
    runtimeDockSwitchLockUntil = Date.now() + Math.max(0, Number(ms) || 0);
  }

  function pauseRuntimeFlowMeasure(ms) {
    runtimeFlowMeasurePauseUntil = Date.now() + Math.max(0, Number(ms) || 0);
  }

  function shouldMeasureRuntimeOnScroll() {
    /*
     * Runtime full 使用 panel 內部捲動，window scroll 不需要連續重算。
     * resize / orientation / runtime content update 仍會由既有 observer 重算。
     */
    if (runtimeState === "full") {
      return false;
    }
    return true;
  }

  function syncRuntimeDockingWithScroll(direction) {
    /*
     * 2026-06-25 hard fix：Runtime full 維持 fixed docked panel，內容由 panel 自己 scroll。
     * 不再於第一次下滑時把 panel 從 fixed 搬到 flow，避免手機上出現
     * 「滑一下、卡一下、再滑」的手感。
     */
    if (runtimeState !== "full") return;
    if (!runtimeDocked) {
      setRuntimeDocked(true);
      ensureRuntimePanel(false);
    }
  }

  function handleRuntimeWheel(event) {
    var targetInRuntime;
    var deltaY;

    if (!event || loadingLocked()) {
      if (loadingLocked() && runtimeState !== "closed") {
        setRuntimeState("closed");
      }
      return;
    }

    deltaY = Number(event.deltaY || 0);
    targetInRuntime = runtimePanelContainsTarget(event.target);

    /*
     * Runtime full + fixed mode：
     * - peek：只有在五張 cards / runtime panel 上往下滾，才展開成完整 runtime。
     * - scroll：runtime panel 內的 wheel 只捲 panel 本身，不讓外層 document 先被吃一段。
     */
    if (runtimeState === "full" && runtimeDocked && targetInRuntime) {
      if (runtimeFixedMode === "peek" && deltaY > 0) {
        consumeRuntimeScrollEvent(event);
        expandRuntimeFixedPanelFromPeek(deltaY);
        return;
      }

      if (runtimeFixedMode === "scroll") {
        /*
         * Full runtime 進入 scroll mode 後，交回瀏覽器原生 overflow scrolling。
         * 舊版在 wheel 事件中 preventDefault + 手動 panel.scrollTop += deltaY，
         * 會讓手機/觸控板失去慣性與加速度，手感像被限速。
         *
         * 這裡只在「已經在頂端還往上滑」時攔截並收回 peek；
         * 其餘往下/內部捲動全部讓 .skhps-runtime-panel 原生 scroll 接手，
         * 外層頁面靠 overscroll-behavior: contain 阻斷 scroll chaining。
         */
        if (deltaY < 0 && runtimePanelAtTop()) {
          consumeRuntimeScrollEvent(event);
          collapseRuntimeFixedPanelToPeek();
          return;
        }

        return;
      }
    }

    if (deltaY > 0 && runtimeState === "full" && runtimeDocked) {
      if (runtimeFixedMode === "peek") {
        /*
         * Peek 狀態只露出五張 summary cards。
         * 使用者在頁面其他位置往下滑，應該只是滑原頁面，不可展開整個 runtime。
         */
        return;
      }
      syncRuntimeDockingWithScroll("down");
      return;
    }

    if (deltaY < 0 && runtimeState === "full") {
      syncRuntimeDockingWithScroll("up");
      if (shouldMeasureRuntimeOnScroll()) {
        scheduleMeasureRuntimePanel();
      }
    }
  }

  function handleRuntimeScroll() {
    var currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    var direction = currentY > lastScrollY ? "down" : currentY < lastScrollY ? "up" : lastScrollDirection;

    lastScrollDirection = direction;
    lastScrollY = currentY;

    if (loadingLocked()) {
      if (runtimeState !== "closed") {
        setRuntimeState("closed");
      }
      return;
    }

    if (runtimeState === "full") {
      syncRuntimeDockingWithScroll(direction);
      if (shouldMeasureRuntimeOnScroll()) {
        scheduleMeasureRuntimePanel();
      }
    }
  }

  function handleRuntimeTouchStart(event) {
    var touch;

    if (runtimeState !== "full" || !runtimeDocked) {
      runtimeTouchStartY = 0;
      return;
    }

    if (!event || !runtimePanelContainsTarget(event.target) || !event.touches || !event.touches.length) {
      runtimeTouchStartY = 0;
      return;
    }

    touch = event.touches[0];
    runtimeTouchStartY = touch ? Number(touch.clientY || 0) : 0;
  }

  function handleRuntimeTouchMove(event) {
    var touch;
    var currentY;
    var delta;

    if (runtimeState !== "full" || !runtimeDocked || !runtimeTouchStartY) {
      return;
    }

    if (!event || !runtimePanelContainsTarget(event.target) || !event.touches || !event.touches.length) {
      return;
    }

    touch = event.touches[0];
    currentY = touch ? Number(touch.clientY || 0) : runtimeTouchStartY;
    delta = runtimeTouchStartY - currentY;

    if (runtimeFixedMode === "peek" && delta > 6) {
      consumeRuntimeScrollEvent(event);
      expandRuntimeFixedPanelFromPeek(delta);
      runtimeTouchStartY = currentY;
      return;
    }

    if (runtimeFixedMode === "scroll") {
      /*
       * Full runtime 內部捲動交給瀏覽器原生 touch scrolling，保留慣性。
       * 只在頂端繼續往上拉時攔截，收回五張 cards。
       */
      if (delta < -6 && runtimePanelAtTop()) {
        consumeRuntimeScrollEvent(event);
        collapseRuntimeFixedPanelToPeek();
        runtimeTouchStartY = currentY;
        return;
      }

      runtimeTouchStartY = currentY;
    }
  }

  function handleLoadingReleased() {
    if (loadingLocked()) {
      setRuntimeState("closed");
      return;
    }

    if (!document.documentElement.getAttribute("data-skhps-runtime-state")) {
      setRuntimeState("closed");
    } else {
      scheduleMeasureRuntimePanel();
    }
  }

  function installRuntimeInteractions() {
    var viewport = window.visualViewport || null;
    var refreshViewportLayout = function () {
      updateFooterSafeArea();
      scheduleMeasureRuntimePanel();
    };

    window.addEventListener("wheel", handleRuntimeWheel, {
      passive: false
    });
    document.addEventListener("touchstart", handleRuntimeTouchStart, {
      passive: true
    });
    document.addEventListener("touchmove", handleRuntimeTouchMove, {
      passive: false
    });
    window.addEventListener("scroll", handleRuntimeScroll, {
      passive: true
    });
    window.addEventListener("resize", refreshViewportLayout);
    window.addEventListener("orientationchange", refreshViewportLayout);

    if (viewport) {
      viewport.addEventListener("resize", refreshViewportLayout);
      viewport.addEventListener("scroll", refreshViewportLayout);
    }

    if (document.fonts && typeof document.fonts.ready === "object") {
      document.fonts.ready.then(scheduleMeasureRuntimePanel).catch(function () {});
    }

    document.addEventListener("skhps-css-sheet-runtime-ready", scheduleMeasureRuntimePanel);
    document.addEventListener("skhps-external-app-loader-ready", scheduleMeasureRuntimePanel);
    document.addEventListener("skhps-runtime-updated", scheduleMeasureRuntimePanel);
    document.addEventListener("skhps-layout-metrics-updated", refreshViewportLayout);
  }

  function boot() {
    if (booted) {
      render();
      return;
    }

    booted = true;
    setRuntimeState("closed", {
      skipRender: true
    });
    ensureRuntimePanel(true);
    render();

    document.addEventListener("skhps-runtime-updated", render);
    document.addEventListener("skhps-css-sheet-runtime-ready", render);
    document.addEventListener("skhps-external-app-loader-ready", render);
    window.addEventListener("resize", updateFooterSafeArea);
    installRuntimeInteractions();
    handleLoadingReleased();
    rlog("OK", "moduleReady", "footer.js");
  }

  window.SKHPSFooter = {
    set: function (key, patch) { logViaRuntime("info", key, patch && patch.value, patch); },
    remove: render,
    ok: function (key, value, detail) { setRuntimeStatus(key, "ok", detail || value); },
    warn: function (key, value, detail) { logViaRuntime("warn", key, value, detail); },
    error: function (key, value, detail) { setRuntimeStatus(key, "error", detail || value); },
    pending: function (key, value, detail) { setRuntimeStatus(key, "pending", detail || value); },
    info: function (key, value, detail) { logViaRuntime("info", key, value, detail); },
    getEnvToggleHref: toggleHref,
    resolveEnvToggleHref: resolveToggleHref,
    debugEnvToggle: debugEnvToggle,
    setRuntimeStatus: setRuntimeStatus,
    taskPending: function (taskName, detail) {
      if (runtime() && typeof runtime().setLoadingRequired === "function") {
        var state = getState();
        var required = state && state.loadingGate ? (state.loadingGate.requiredTasks || []).slice() : [];
        if (required.indexOf(taskName) < 0) required.push(taskName);
        runtime().setLoadingRequired(required);
      }
      logViaRuntime("info", taskName, "pending", detail || null);
    },
    taskDone: function (taskName, detail) {
      if (runtime() && typeof runtime().taskDone === "function") runtime().taskDone(taskName);
      logViaRuntime("info", taskName, "done", detail || null);
    },
    taskWarn: function (taskName, detail) { logViaRuntime("warn", taskName, "warning", detail); },
    taskError: function (taskName, detail) {
      if (runtime() && typeof runtime().taskFailed === "function") runtime().taskFailed(taskName, detail || "failed");
      logViaRuntime("error", taskName, "failed", detail || null);
    },
    taskReady: function (taskName, detail) {
      if (runtime() && typeof runtime().taskDone === "function") runtime().taskDone(taskName);
      setRuntimeStatus(taskName, "ok", detail || "done");
    },
    taskFailed: function (taskName, detail) {
      if (runtime() && typeof runtime().taskFailed === "function") runtime().taskFailed(taskName, detail || "failed");
      setRuntimeStatus(taskName, "error", detail || "failed");
    },
    getFooterRuntimeSummary: getFooterRuntimeSummary,
    setRuntimeState: setRuntimeState,
    setRuntimeDocked: setRuntimeDocked,
    measureRuntimePanel: measureRuntimePanel,
    toggleRuntimePanel: toggleRuntimePanel,
    render: render,
    boot: boot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
