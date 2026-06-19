/*
檔案位置：skhpsv2/assets/js/header.js
時間戳記：2026-06-19 UTC+8
用途：
共用 Header。

本版重點：
- Header 掛載到 <header id="header">。
- Header 左側顯示 SKHPS / Plastic Surgery。
- Header 左側按下去回「目前被水庫放置的位置」首頁。
- 外部 App 的回首頁位置不再由 app.json 寫死判斷，而是以 ExternalProject registry 當下 displayPosition 為準。
  - displayPosition=backend / 後台 → 回 skhpsv2/admin.html
  - displayPosition=front / 前台 → 回 skhpsv2/index.html
  - 查不到 registry → fallback 回 skhpsv2/index.html
- Header 右側目前只顯示「登入」，登入連到 skhpsv2/admin.html。
- Header 不顯示 runtime / backend / CSS / version 狀態。
- Header 不進 loading gate，不呼叫 SKHPSLoading.done()。
*/

(function () {
  "use strict";

  function rlog(status, action, detail) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "header.js",
          category: "dom",
          action: action,
          status: status,
          detail: detail || ""
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "header.js");

  var HEADER_ID = "header";
  var BRAND_MARK = "SKHPS";
  var BRAND_MAIN = "SKHPS";
  var BRAND_SUB = "Plastic Surgery";
  var LOGIN_HREF = "admin.html";
  var FRONT_HREF = "index.html";
  var ADMIN_HREF = "admin.html";
  var currentResolvedPlacement = "";
  var currentRenderedHomeHref = "";
  var registryResolveStarted = false;

  function getHeaderRoot() {
    return document.getElementById(HEADER_ID);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    baseUrl = normalizeText(baseUrl);
    path = String(path || "").replace(/^\/+/, "");

    if (!baseUrl) {
      return path;
    }

    return normalizeBaseUrl(baseUrl) + path;
  }

  function isAbsoluteUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function getSharedBaseUrl() {
    if (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.sharedBaseUrl) {
      return window.SKHPS_APP_ENV.sharedBaseUrl;
    }

    if (window.SKHPS_ENTRY_BASE_URL) {
      return window.SKHPS_ENTRY_BASE_URL;
    }

    if (
      window.SKHPSConfig &&
      typeof window.SKHPSConfig.getSiteBaseUrl === "function"
    ) {
      return window.SKHPSConfig.getSiteBaseUrl(window.SKHPS_CONFIG);
    }

    return "";
  }

  function sharedHref(path) {
    var sharedBaseUrl = getSharedBaseUrl();

    if (!sharedBaseUrl) {
      return path;
    }

    return joinUrl(sharedBaseUrl, path);
  }

  function getEntryScope() {
    return normalizeText(
      document.documentElement.getAttribute("data-skhps-entry-scope")
    );
  }

  function isExternalApp() {
    return getEntryScope() === "external-app" || Boolean(window.SKHPS_APP_ENV || window.SKHPS_APP_MANIFEST);
  }

  function getCurrentPageId() {
    return normalizeText(
      document.documentElement.getAttribute("data-skhps-page-id")
    );
  }

  function getCurrentAppId() {
    var html = document.documentElement;
    var appEnv = window.SKHPS_APP_ENV || {};
    var manifest = window.SKHPS_APP_ROOT_MANIFEST || window.SKHPS_APP_MANIFEST || {};
    var effective = window.SKHPS_APP_EFFECTIVE_MANIFEST || {};

    /*
      多頁外部 App 必須先用「目前 page/project」找 registry。
      rootAppId 只代表檔案家族，不代表目前頁面所在的前台/後台位置。
    */
    return normalizeText(
      html.getAttribute("data-skhps-registry-project-id") ||
      html.getAttribute("data-skhps-project-id") ||
      appEnv.projectId ||
      appEnv.currentAppId ||
      window.SKHPS_CURRENT_PROJECT_ID ||
      effective.projectId ||
      effective.appId ||
      appEnv.pageId ||
      html.getAttribute("data-skhps-page-id") ||
      appEnv.appId ||
      html.getAttribute("data-skhps-app-id") ||
      window.SKHPS_CURRENT_APP_ID ||
      manifest.projectId ||
      manifest.appId ||
      appEnv.rootAppId ||
      effective.rootAppId ||
      html.getAttribute("data-skhps-root-app-id") ||
      window.SKHPS_APP_ID ||
      ""
    );
  }

  function normalizePlacement(value) {
    value = normalizeText(value).toLowerCase();

    if (!value) return "";
    if (value === "backend" || value === "admin" || value === "back" || value === "後台" || value === "管理") return "backend";
    if (value === "front" || value === "frontend" || value === "home" || value === "index" || value === "前台" || value === "首頁") return "front";

    return value;
  }

  function pickPlacementFromObject(item) {
    if (!item || typeof item !== "object") return "";

    return normalizePlacement(
      item.displayPosition ||
      item.display_position ||
      item.position ||
      item.placement ||
      item.area ||
      item.zone ||
      item["顯示位置"] ||
      item["位置"] ||
      ""
    );
  }

  function matchesAppId(item, appId) {
    var ids;

    if (!item || typeof item !== "object" || !appId) return false;

    ids = [
      item.projectId,
      item.project_id,
      item.pageId,
      item.page_id,
      item.appId,
      item.app_id,
      item.id,
      item.key,
      item.registryKey,
      item.registry_key,
      item["appId"],
      item["專案ID"],
      item["專案Id"],
      item["專案id"]
    ].map(function (value) {
      return normalizeText(value);
    }).filter(Boolean);

    return ids.indexOf(appId) >= 0;
  }

  function collectCandidateArrays(value, output) {
    if (!value || typeof value !== "object") return output;

    if (Array.isArray(value)) {
      output.push(value);
      return output;
    }

    ["projects", "apps", "items", "rows", "data", "result", "records", "list"].forEach(function (key) {
      if (Array.isArray(value[key])) {
        output.push(value[key]);
      } else if (value[key] && typeof value[key] === "object") {
        collectCandidateArrays(value[key], output);
      }
    });

    return output;
  }

  function findRegistryItemFromResult(result, appId) {
    var arrays = collectCandidateArrays(result || {}, []);
    var found = null;

    arrays.some(function (items) {
      return items.some(function (item) {
        if (matchesAppId(item, appId)) {
          found = item;
          return true;
        }
        return false;
      });
    });

    return found;
  }

  function registryResultCandidates() {
    return [
      window.SKHPS_CURRENT_APP_REGISTRY,
      window.SKHPS_EXTERNAL_APP_REGISTER_RESULT,
      window.SKHPS_EXTERNAL_APP_REGISTRY_RESULT,
      window.SKHPS_EXTERNAL_PROJECTS_RESULT,
      window.SKHPS_EXTERNAL_APPS_RESULT
    ].filter(Boolean);
  }

  function resolvePlacementFromKnownResults(appId) {
    var placement = "";

    registryResultCandidates().some(function (result) {
      var item;

      if (matchesAppId(result, appId)) {
        placement = pickPlacementFromObject(result);
        if (placement) return true;
      }

      item = findRegistryItemFromResult(result, appId);
      placement = pickPlacementFromObject(item);
      if (placement) {
        window.SKHPS_CURRENT_APP_REGISTRY = item;
        return true;
      }

      return false;
    });

    return placement;
  }

  function getHeaderMode() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-mode")
    );
    var pageId;

    if (fromHtml) {
      return fromHtml;
    }

    if (isExternalApp()) {
      return currentResolvedPlacement === "backend" ? "admin" : "front";
    }

    pageId = getCurrentPageId();

    if (pageId === "admin" || pageId === "backend-project-launcher") {
      return "admin";
    }

    return "front";
  }

  function getHomeHref() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-home-href")
    );
    var mode = getHeaderMode();

    if (fromHtml) {
      return fromHtml;
    }

    if (isExternalApp()) {
      return sharedHref(mode === "admin" ? ADMIN_HREF : FRONT_HREF);
    }

    if (mode === "admin") {
      return ADMIN_HREF;
    }

    if (window.SKHPS_ENTRY_BASE_URL && isAbsoluteUrl(window.SKHPS_ENTRY_BASE_URL)) {
      return window.SKHPS_ENTRY_BASE_URL;
    }

    return FRONT_HREF;
  }

  function getLoginHref() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-login-href")
    );

    if (fromHtml) {
      return fromHtml;
    }

    return sharedHref(LOGIN_HREF);
  }

  function applyResolvedPlacement(placement, reason) {
    placement = normalizePlacement(placement);

    if (!placement) return false;
    if (placement !== "backend" && placement !== "front") return false;
    if (currentResolvedPlacement === placement) return false;

    currentResolvedPlacement = placement;
    document.documentElement.setAttribute("data-skhps-current-display-position", placement);

    rlog("OK", "resolvePlacement", {
      appId: getCurrentAppId(),
      placement: placement,
      reason: reason || ""
    });

    renderHeader();
    return true;
  }

  function resolvePlacementFromBackend() {
    var appId = getCurrentAppId();
    var knownPlacement;

    if (!isExternalApp() || !appId || registryResolveStarted) {
      return;
    }

    knownPlacement = resolvePlacementFromKnownResults(appId);
    if (applyResolvedPlacement(knownPlacement, "known-result")) {
      return;
    }

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      rlog("WARN", "resolvePlacementSkipped", "SKHPSBackend.call not available");
      return;
    }

    registryResolveStarted = true;

    window.SKHPSBackend.call("listExternalProjects", {}, {
      timeoutMs: 8000
    }).then(function (result) {
      var item = findRegistryItemFromResult(result, appId);
      var placement = pickPlacementFromObject(item);

      if (item) {
        window.SKHPS_CURRENT_APP_REGISTRY = item;
      }

      if (!applyResolvedPlacement(placement, "listExternalProjects")) {
        rlog("WARN", "resolvePlacementNoMatch", {
          appId: appId,
          hasResult: Boolean(result)
        });
      }

      try {
        document.dispatchEvent(new CustomEvent("skhps-current-app-registry-resolved", {
          detail: {
            appId: appId,
            placement: placement,
            item: item || null,
            result: result || null
          }
        }));
      } catch (error) {}
    }).catch(function (error) {
      rlog("WARN", "resolvePlacementFailed", error && error.message ? error.message : String(error));
    });
  }

  function renderHeader() {
    var root = getHeaderRoot();
    var mode;
    var homeHref;
    var loginHref;

    if (!root) {
      rlog("WARN", "renderHeader", "missing header root");
      return;
    }

    mode = getHeaderMode();
    homeHref = getHomeHref();
    loginHref = getLoginHref();

    currentRenderedHomeHref = homeHref;

    root.classList.add("skhps-header");
    root.setAttribute("data-skhps-header-ready", "true");
    root.setAttribute("data-skhps-header-mode", mode);

    root.innerHTML = [
      '<div class="skhps-header-inner">',
        '<a class="skhps-header-brand" href="' + escapeHtml(homeHref) + '" aria-label="回到首頁">',
          '<span class="skhps-header-brand-mark">',
            escapeHtml(BRAND_MARK),
          '</span>',
          '<span class="skhps-header-brand-copy">',
            '<span class="skhps-header-brand-main">',
              escapeHtml(BRAND_MAIN),
            '</span>',
            '<span class="skhps-header-brand-sub">',
              escapeHtml(BRAND_SUB),
            '</span>',
          '</span>',
        '</a>',

        '<nav class="skhps-header-actions" aria-label="主要導覽">',
          '<a',
            ' class="skhps-btn skhps-btn-primary skhps-header-login-btn"',
            ' href="' + escapeHtml(loginHref) + '"',
            ' data-skhps-login-link',
          '>',
            '登入',
          '</a>',
        '</nav>',
      '</div>'
    ].join("");

    rlog("OK", "renderHeader", {
      mode: mode,
      homeHref: homeHref,
      loginHref: loginHref,
      placement: currentResolvedPlacement || ""
    });
  }

  function boot() {
    /*
      先用 fallback render，避免 header 空白。
      外部 App 再用 registry 的當下 displayPosition 非同步修正回首頁位置。
    */
    renderHeader();
    resolvePlacementFromBackend();

    document.addEventListener("skhps-runtime-updated", function () {
      if (!currentResolvedPlacement) {
        resolvePlacementFromBackend();
      }
    });

    document.addEventListener("skhps-current-app-registry-resolved", function () {
      var nextHomeHref = getHomeHref();
      if (nextHomeHref !== currentRenderedHomeHref) {
        renderHeader();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  rlog("OK", "moduleReady", "header.js");
})();
