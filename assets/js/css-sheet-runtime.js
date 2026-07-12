/*
檔案位置：skhpsv2/assets/js/css-sheet-runtime.js
時間戳記：2026-07-10 23:40 UTC+8
用途：統一 CSS runtime；正式資料來源固定為後端 worker 讀取 Supabase CssRegistryRuntimeRow，失敗時回報錯誤不套假樣式。
*/

(function () {
  "use strict";

  var STYLE_ID = "skhps-css-runtime-style";
  var LEGACY_STYLE_ID = "skhps-css-sheet-runtime";
  var STATUS_ATTR = "data-css-sheet-runtime-status";
  var LOADING_CLASS = "skhps-css-loading";

  /*
    localStorage：
    保存 CSS 文字，讓同一次瀏覽流程切到 admin/css-setting/其他頁時可以立即套用。

    sessionStorage：
    只記錄「這次開網域後是否已經抓過一次 Supabase CSS Registry」。
    關閉分頁/瀏覽器後，下次第一次進網域會重新抓 registry。
  */
  var CACHE_KEY = "skhpsv2.cssRegistryRuntimeCache.v1";
  var LEGACY_CACHE_KEYS = [
    "skhpsv2.cssSheetRuntimeCache.v1",
    "skhpsv2.cssSheetRuntimeCache.v2"
  ];
  var SESSION_READY_KEY = "skhpsv2.cssRegistryRuntimeSessionReady.v1";
  var LEGACY_SESSION_READY_KEYS = [
    "skhpsv2.cssSheetRuntimeSessionReady.v1"
  ];
  var cssRuntimeStartedAt = 0;
  var cssRuntimeInitialDurationMs = null;
  var cssRuntimeGateDone = false;
  var lastAppliedHash = "";

  function runtime() {
    return window.SKHPSRuntime || null;
  }

  function rlog(status, action, detail, durationMs) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "css-sheet-runtime.js",
          category: "css",
          action: action,
          status: status,
          detail: detail || "",
          durationMs: durationMs
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "css-sheet-runtime.js");
  rlog("RUN", "cssRuntimeStart", "css-sheet-runtime.js");

  function runtimeStart() {
    cssRuntimeStartedAt = Date.now();

    if (runtime() && typeof runtime().start === "function") {
      runtime().start("cssRuntime");
    }

    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: false,
        source: "",
        durationMs: null
      });
    }
  }

  function runtimeDone(source) {
    if (cssRuntimeInitialDurationMs === null) {
      cssRuntimeInitialDurationMs = cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null;
    }

    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: true,
        source: source || "",
        durationMs: cssRuntimeInitialDurationMs,
        initialDurationMs: cssRuntimeInitialDurationMs
      });
    }

    if (runtime() && typeof runtime().done === "function") {
      runtime().done("cssRuntime", {
        source: source || ""
      });
    }
  }

  function runtimeFail(error) {
    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: false,
        durationMs: cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null
      });
    }

    if (runtime() && typeof runtime().fail === "function") {
      runtime().fail("cssRuntime", error);
    }
  }

  function traceFunction(functionName, status, data) {
    if (runtime() && typeof runtime().log === "function") {
      runtime().log({
        level: status === "error" ? "error" : "debug",
        module: "css-sheet-runtime.js",
        message: "function-" + status,
        data: Object.assign({
          file: "css-sheet-runtime.js",
          functionName: functionName,
          status: status
        }, data || {})
      });
    }
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function setStatus(message, ok) {
    var el = document.querySelector("[" + STATUS_ATTR + "]");
    if (!el) return;
    el.textContent = message;
    el.setAttribute("data-ok", ok ? "true" : "false");
  }

  function markCssRuntimePending() {
    traceFunction("markCssRuntimePending", "start");
    rlog("RUN", "markCssRuntimePending", "css-runtime");
    document.documentElement.setAttribute("data-skhps-css-ready", "false");
    runtimeStart();

    if (window.SKHPSLoading && typeof window.SKHPSLoading.require === "function") {
      window.SKHPSLoading.require("css-runtime");
    }
  }

  function markCssRuntimeDone() {
    traceFunction("markCssRuntimeDone", "done", {
      source: window.SKHPSCssSheetRuntime && window.SKHPSCssSheetRuntime.source || ""
    });
    rlog("OK", "cssRuntimeLoaded", {
      source: window.SKHPSCssSheetRuntime && window.SKHPSCssSheetRuntime.source || ""
    }, cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);
    document.documentElement.setAttribute("data-skhps-css-ready", "true");

    if (cssRuntimeGateDone) {
      return;
    }

    cssRuntimeGateDone = true;

    if (window.SKHPSLoading && typeof window.SKHPSLoading.done === "function") {
      rlog("OK", "done", "css-runtime");
      window.SKHPSLoading.done("css-runtime");
      return;
    }

    /*
      Fallback for old pages that have not loaded assets/js/loading-gate.js yet.
      New pages should let SKHPSLoading release the page only after every required
      task declared in data-skhps-loading-tasks is done or fail-rendered.
    */
    document.documentElement.classList.remove(LOADING_CLASS);
    document.documentElement.classList.remove("skhps-loading");
    document.documentElement.classList.remove("skhps-shell-loading");
    document.documentElement.classList.remove("skhps-main-loading");
    document.documentElement.setAttribute("data-skhps-shell-ready", "true");
    document.documentElement.setAttribute("data-skhps-page-ready", "true");
  }

  function markCssRuntimeFailed(error) {
    traceFunction("markCssRuntimeFailed", "error", {
      error: error && error.message ? error.message : String(error)
    });
    rlog("FAIL", "cssRuntimeLoaded", {
      error: error && error.message ? error.message : String(error)
    }, cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);
    document.documentElement.setAttribute("data-skhps-css-ready", "false");
    runtimeFail(error);

    if (cssRuntimeGateDone) {
      return;
    }

    cssRuntimeGateDone = true;

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("css-runtime", error);
      return;
    }

    /* Fallback: do not leave old pages permanently hidden when CSS failed. */
    document.documentElement.classList.remove(LOADING_CLASS);
    document.documentElement.classList.remove("skhps-loading");
    document.documentElement.classList.remove("skhps-shell-loading");
    document.documentElement.classList.remove("skhps-main-loading");
    document.documentElement.setAttribute("data-skhps-shell-ready", "true");
    document.documentElement.setAttribute("data-skhps-page-ready", "true");
  }

  function keepLoading() {
    traceFunction("keepLoading", "start");
    rlog("RUN", "keepLoading", LOADING_CLASS);
    document.documentElement.classList.add(LOADING_CLASS);
    markCssRuntimePending();
  }

  function getSessionReady() {
    try {
      return sessionStorage.getItem(SESSION_READY_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function setSessionReady() {
    try {
      sessionStorage.setItem(SESSION_READY_KEY, "1");
    } catch (error) {
      console.warn("CSS Registry runtime session flag write failed:", error);
    }
  }

  function clearSessionReady() {
    try {
      sessionStorage.removeItem(SESSION_READY_KEY);
      LEGACY_SESSION_READY_KEYS.forEach(function (key) {
        sessionStorage.removeItem(key);
      });
    } catch (error) {
      console.warn("CSS Registry runtime session flag clear failed:", error);
    }
  }

  function getConfig() {
    if (window.SKHPSConfig && typeof window.SKHPSConfig.loadConfig === "function") {
      return window.SKHPSConfig.loadConfig();
    }

    if (window.SKHPS_CONFIG) {
      return Promise.resolve(window.SKHPS_CONFIG);
    }

    return fetch("config.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("config.json HTTP " + res.status);
      return res.json();
    });
  }

  function nowTaipeiText() {
    var parts;

    try {
      parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date());
      return parts.replace("T", " ") + " UTC+8";
    } catch (error) {
      return new Date().toISOString();
    }
  }

  function hashText(text) {
    var hash = 2166136261;
    var input = String(text || "");

    for (var i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }

    return ("00000000" + (hash >>> 0).toString(16)).slice(-8);
  }



  function normalizePath(path) {
    return String(path || "")
      .split("?")[0]
      .split("#")[0]
      .replace(/^\.\//, "")
      .replace(/^\//, "");
  }

  function getCurrentPageFile() {
    var path = normalizePath(window.location.pathname);
    var parts = path.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "index.html";
  }

  function findPageTitle(config) {
    var current = getCurrentPageFile();
    var pages = config && Array.isArray(config.pages) ? config.pages : [];
    var match = pages.find(function (page) {
      return normalizePath(page && page.href) === current;
    });

    return (match && match.title) ||
      (config && config.title) ||
      document.title ||
      "";
  }

  function applyLoadingTitle(config) {
    /*
      Respect page-level loading title first.

      External child apps such as skhps-quick-login can set:
      <html data-loading-title="快速登入">

      In that case, css-sheet-runtime must not overwrite it with skhpsv2
      config.title or config.pages title.
    */
    var currentTitle = document.documentElement.getAttribute("data-loading-title");

    if (String(currentTitle || "").trim()) {
      return;
    }

    var title = String(findPageTitle(config) || "").trim();

    if (title) {
      document.documentElement.setAttribute("data-loading-title", title);
    } else {
      document.documentElement.removeAttribute("data-loading-title");
    }
  }


  function getCssSheets(config) {
    var cssSheets = config && config.sheets && config.sheets.cssSheets
      ? config.sheets.cssSheets
      : null;

    /*
      Supabase registry 仍保留 sheetKey 欄位做舊資料相容。
      如果 config.json 已移除 sheets.cssSheets，也預設讀 cssMain。
    */
    if (!cssSheets || !Object.keys(cssSheets).length) {
      return {
        cssMain: {
          key: "cssMain",
          title: "CssRegistry",
          tabName: "CssRegistry",
          tabGid: "0",
          enabled: true
        }
      };
    }

    if (!cssSheets.cssMain && cssSheets.baseStyle) {
      cssSheets.cssMain = {
        key: "cssMain",
        title: "CssRegistry",
        tabName: "CssRegistry",
        tabGid: "0",
        enabled: true
      };
    }

    return cssSheets;
  }

  function getEnabledSheetKeys(config) {
    var cssRuntime = config && config.cssRuntime ? config.cssRuntime : {};
    var registryKeys = Array.isArray(cssRuntime.registryKeys)
      ? cssRuntime.registryKeys
      : Array.isArray(cssRuntime.cssRegistryKeys)
        ? cssRuntime.cssRegistryKeys
        : [];
    var primaryRegistryKey = String(
      cssRuntime.primaryRegistryKey ||
      cssRuntime.primaryKey ||
      cssRuntime.registryKey ||
      ""
    ).trim();

    registryKeys = registryKeys.map(function (key) {
      return String(key || "").trim();
    }).filter(Boolean);

    if (primaryRegistryKey && registryKeys.indexOf(primaryRegistryKey) < 0) {
      registryKeys.unshift(primaryRegistryKey);
    }

    if (registryKeys.length) {
      return registryKeys;
    }

    var cssSheets = getCssSheets(config);

    var keys = Object.keys(cssSheets).filter(function (key) {
      var sheet = cssSheets[key] || {};
      return sheet.enabled !== false;
    });

    /* 固定版優先只讀 cssMain，避免舊多分頁 CSS 重複覆蓋。 */
    if (keys.indexOf("cssMain") >= 0) {
      return ["cssMain"];
    }

    return keys;
  }

  function normalizeBackendRows(response, sheetKeys) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    if (Array.isArray(response.rows)) return response.rows;
    if (Array.isArray(response.data)) return response.data;

    var out = [];

    sheetKeys.forEach(function (sheetKey) {
      var section = response[sheetKey];
      if (!section) return;

      if (Array.isArray(section)) {
        section.forEach(function (row) {
          if (!row.sheetKey) row.sheetKey = sheetKey;
          out.push(row);
        });
      } else if (Array.isArray(section.rows)) {
        section.rows.forEach(function (row) {
          if (!row.sheetKey) row.sheetKey = sheetKey;
          out.push(row);
        });
      }
    });

    return out;
  }

  function loadRowsFromBackend(sheetKeys) {
    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      return Promise.reject(new Error("SKHPSBackend.call not available"));
    }

    rlog("RUN", "loadCssRegistryBackend", {
      sheetKeys: sheetKeys
    });

    return window.SKHPSBackend.call("getCssRegistryRuntime", {
      registryKeys: sheetKeys,
      sheetKeys: sheetKeys
    }).then(function (res) {
      if (!res || res.ok === false) {
        throw new Error(res && (res.message || res.error) ? (res.message || res.error) : "getCssRegistryRuntime failed");
      }

      var rows = normalizeBackendRows(res, sheetKeys);
      if (!rows.length) throw new Error("getCssRegistryRuntime returned no rows");
      rlog("OK", "loadCssRegistryBackend", {
        sheetKeys: sheetKeys,
        rowsCount: rows.length
      });
      return rows;
    });
  }

  function shouldUseBackend(config) {
    return true;
  }

  function loadRows(config, sheetKeys) {
    return loadRowsFromBackend(sheetKeys).catch(function (error) {
      console.warn("CSS Registry backend failed:", error);
      rlog("WARN", "loadCssRegistryBackend", {
        sheetKeys: sheetKeys,
        error: error && error.message ? error.message : String(error),
        fallback: "none"
      });
      throw error;
    });
  }

  function normalizeSelector(className, component) {
    var raw = String(className || "").trim();

    if (!raw && component) raw = String(component || "").trim();
    if (!raw) return "";

    if (
      raw === "*" ||
      raw.indexOf("*::") === 0 ||
      raw === "body" ||
      raw === "html" ||
      raw === ":root" ||
      raw.indexOf(".") === 0 ||
      raw.indexOf("#") === 0 ||
      raw.indexOf("[") === 0 ||
      raw.indexOf(":") === 0 ||
      raw.indexOf("@media") === 0 ||
      raw.indexOf("@keyframes") === 0 ||
      /[\s,>+~:[#]/.test(raw) ||
      /^[a-z][a-z0-9-]*\./i.test(raw)
    ) {
      return raw;
    }

    return "." + raw;
  }

  function isDated(updatedAt) {
    var raw = String(updatedAt || "").trim().toLowerCase();
    return raw && raw !== "default";
  }

  function rowScore(row, index) {
    var updatedAt = String(row.updatedAt || "").trim();

    if (!isDated(updatedAt)) {
      return { rank: 1, time: 0, index: index };
    }

    var parsed = new Date(updatedAt.replace(/\//g, "-")).getTime();

    return {
      rank: 2,
      time: isNaN(parsed) ? 1 : parsed,
      index: index
    };
  }

  function compareScore(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.time !== b.time) return a.time - b.time;
    return a.index - b.index;
  }

  function pickLatestRows(rows) {
    var map = {};

    rows.forEach(function (row, index) {
      var selector = normalizeSelector(row.selector || row.className, row.component);
      var property = String(row.property || "").trim();
      var value = String(row.value || "").trim();

      if (!selector || !property || !value) return;

      var key = selector + "||" + property;
      var candidate = {
        selector: selector,
        property: property,
        value: value,
        sheetKey: row.sheetKey || "",
        component: row.component || "",
        updatedAt: row.updatedAt || "",
        score: rowScore(row, index)
      };

      if (!map[key] || compareScore(map[key].score, candidate.score) <= 0) {
        map[key] = candidate;
      }
    });

    return Object.keys(map).map(function (key) {
      return map[key];
    });
  }

  function buildCss(rows) {
    var latest = pickLatestRows(rows);
    var grouped = {};
    var mediaGrouped = {};
    var keyframesGrouped = {};

    latest.forEach(function (row) {
      var selector = row.selector;
      var keyframesMatch = selector.match(/^(@keyframes[^{]+)\{\s*([^}]+?)\s*\}?$/);

      if (keyframesMatch) {
        var keyframes = keyframesMatch[1].trim();
        var frameSelector = keyframesMatch[2].trim();

        keyframesGrouped[keyframes] = keyframesGrouped[keyframes] || {};
        keyframesGrouped[keyframes][frameSelector] = keyframesGrouped[keyframes][frameSelector] || [];
        keyframesGrouped[keyframes][frameSelector].push(row);
        return;
      }

      if (selector.indexOf("@media") === 0) {
        var match = selector.match(/^(@media[^{]+)\{\s*([^}]+?)\s*\}?$/);

        if (match) {
          var media = match[1].trim();
          var innerSelector = match[2].trim();

          mediaGrouped[media] = mediaGrouped[media] || {};
          mediaGrouped[media][innerSelector] = mediaGrouped[media][innerSelector] || [];
          mediaGrouped[media][innerSelector].push(row);
          return;
        }
      }

      grouped[selector] = grouped[selector] || [];
      grouped[selector].push(row);
    });

    var css = ["/* skhps css registry runtime generated */"];

    Object.keys(grouped).forEach(function (selector) {
      css.push("");
      css.push(selector + " {");

      grouped[selector].forEach(function (row) {
        css.push("  " + row.property + ": " + row.value + ";");
      });

      css.push("}");
    });

    Object.keys(mediaGrouped).forEach(function (media) {
      css.push("");
      css.push(media + " {");

      Object.keys(mediaGrouped[media]).forEach(function (selector) {
        css.push("  " + selector + " {");

        mediaGrouped[media][selector].forEach(function (row) {
          css.push("    " + row.property + ": " + row.value + ";");
        });

        css.push("  }");
      });

      css.push("}");
    });

    Object.keys(keyframesGrouped).forEach(function (keyframes) {
      css.push("");
      css.push(keyframes + " {");

      Object.keys(keyframesGrouped[keyframes]).forEach(function (frameSelector) {
        css.push("  " + frameSelector + " {");

        keyframesGrouped[keyframes][frameSelector].forEach(function (row) {
          css.push("    " + row.property + ": " + row.value + ";");
        });

        css.push("  }");
      });

      css.push("}");
    });

    css.push(sharedSwipeTableScaleCss());

    return {
      cssText: css.join("\n"),
      latestRows: latest
    };
  }

  function sharedSwipeTableScaleCss() {
    return [
      "",
      "/* shared swipe/expand table visual baseline */",
      ".sk-swipe-table {",
      "  width: 100%;",
      "  border-collapse: collapse;",
      "  table-layout: fixed;",
      "  font-size: var(--sk-swipe-table-font-size, calc(17px * var(--sk-swipe-table-scale, 1))) !important;",
      "}",
      "",
      ".sk-swipe-table thead th {",
      "  padding: 10px 16px;",
      "  background: var(--sk-primary, #516d87);",
      "  color: #fff;",
      "  font-size: 13px;",
      "  font-weight: 950;",
      "  text-align: left;",
      "  white-space: nowrap;",
      "}",
      "",
      ".sk-swipe-table tbody tr.sk-data-row td {",
      "  height: var(--sk-swipe-table-row-min-height, calc(64px * var(--sk-swipe-table-scale, 1)));",
      "  padding: 0 16px;",
      "  border-bottom: 1px solid var(--sk-line, rgba(208, 217, 227, .9));",
      "  background: var(--sk-surface, #fbfcf8);",
      "  color: var(--sk-text, #23323d);",
      "  vertical-align: middle;",
      "}",
      "",
      ".sk-swipe-table tbody tr.sk-data-row:hover td {",
      "  background: var(--sk-surface-hover, #f8f8f2);",
      "}",
      "",
      ".sk-swipe-table .sk-project-cell {",
      "  padding: 0 !important;",
      "}",
      "",
      ".sk-swipe-table .sk-project-main {",
      "  display: flex;",
      "  align-items: center;",
      "  min-height: var(--sk-swipe-table-row-min-height, calc(64px * var(--sk-swipe-table-scale, 1))) !important;",
      "  padding: var(--sk-swipe-table-main-padding, calc(10px * var(--sk-swipe-table-scale, 1)) calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "  gap: var(--sk-swipe-table-main-gap, calc(8px * var(--sk-swipe-table-scale, 1))) !important;",
      "  background: var(--sk-surface, #fbfcf8);",
      "}",
      "",
      ".sk-swipe-table .sk-project-text {",
      "  display: grid;",
      "  gap: 3px;",
      "  min-width: 0;",
      "}",
      "",
      ".sk-swipe-table .sk-project-text strong,",
      ".sk-swipe-table .sk-project-title-line {",
      "  overflow: hidden;",
      "  color: var(--sk-text-strong, #10243a);",
      "  font-weight: 950;",
      "  text-overflow: ellipsis;",
      "  white-space: nowrap;",
      "}",
      "",
      ".sk-swipe-table .sk-project-text span,",
      ".sk-swipe-table .sk-project-subtitle {",
      "  overflow: hidden;",
      "  color: var(--sk-muted, #5f7185);",
      "  font-size: 13px;",
      "  font-weight: 850;",
      "  text-overflow: ellipsis;",
      "  white-space: nowrap;",
      "}",
      "",
      ".sk-swipe-table .sk-reorder-handle,",
      ".sk-swipe-table .sk-expand-mark,",
      ".sk-swipe-table .sk-radio-circle {",
      "  border: 1px solid var(--sk-line, rgba(208, 217, 227, .95));",
      "  background: var(--sk-surface, #fbfcf8);",
      "  color: var(--sk-primary, #516d87);",
      "}",
      "",
      ".sk-swipe-table .sk-row-action-rail {",
      "  width: var(--sk-swipe-action-rail-width, calc(124px * var(--sk-swipe-table-scale, 1))) !important;",
      "  min-width: var(--sk-swipe-action-rail-width, calc(124px * var(--sk-swipe-table-scale, 1))) !important;",
      "  transform: translateX(calc(-1 * var(--sk-swipe-action-rail-width, calc(124px * var(--sk-swipe-table-scale, 1))))) !important;",
      "}",
      "",
      ".sk-swipe-table .sk-row-action {",
      "  min-height: var(--sk-swipe-table-row-min-height, calc(64px * var(--sk-swipe-table-scale, 1))) !important;",
      "  color: #fff;",
      "  font-weight: 950;",
      "}",
      "",
      ".sk-swipe-table .sk-row-action.edit,",
      ".sk-swipe-table .sk-row-action[data-swipe-action-key='edit'] {",
      "  background: var(--sk-primary, #516d87);",
      "}",
      "",
      ".sk-swipe-table .sk-row-action.delete,",
      ".sk-swipe-table .sk-row-action[data-swipe-action-key='delete'],",
      ".sk-swipe-table .sk-row-action[data-swipe-action-key='disableStaff'] {",
      "  background: var(--sk-danger, #b06f6a);",
      "}",
      "",
      ".sk-swipe-table .sk-row-action[data-swipe-action-key='enableStaff'] {",
      "  background: var(--sk-ok, #5f8a79);",
      "}",
      "",
      ".sk-swipe-table .sk-data-row.is-action-open .sk-row-action-rail {",
      "  transform: none !important;",
      "}",
      "",
      ".sk-swipe-table.is-reorder-mode .sk-project-main {",
      "  padding-left: var(--sk-swipe-table-reorder-main-padding-left, calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "}",
      "",
      ".sk-toolbar-table-group .sk-table-toolbar .sk-btn {",
      "  min-height: 42px;",
      "  border: 1px solid var(--sk-line, rgba(208, 217, 227, .95));",
      "  border-radius: 999px;",
      "  background: var(--sk-surface, #fbfcf8);",
      "  color: var(--sk-primary, #516d87);",
      "  cursor: pointer;",
      "  font: inherit;",
      "  font-size: 14px;",
      "  font-weight: 950;",
      "  padding: 0 18px;",
      "}",
      "",
      ".sk-toolbar-table-group .sk-table-toolbar .sk-btn-primary {",
      "  border-color: var(--sk-primary, #516d87);",
      "  background: var(--sk-primary, #516d87);",
      "  color: #fff;",
      "}",
      "",
      ".sk-swipe-global-overflow-menu .sk-row-action-menu-item {",
      "  font-size: var(--sk-swipe-menu-font-size, calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "}"
    ].join("\n");
  }

  function appendSharedSwipeTableCss(cssText) {
    var text = String(cssText || "");
    if (text.indexOf("shared swipe/expand table visual baseline") >= 0) return text;
    return text + sharedSwipeTableScaleCss();
  }

  function rowsFromStyles(styles) {
    return (Array.isArray(styles) ? styles : []).map(function (item, index) {
      item = item || {};
      return {
        sheetKey: item.sheetKey || item.group || item.component || "json",
        group: item.group || "",
        component: item.component || item.group || "",
        selector: String(item.selector || item.className || "").trim(),
        className: String(item.className || item.selector || "").trim(),
        property: String(item.property || "").trim(),
        value: String(item.value || "").trim(),
        description: String(item.description || "").trim(),
        updatedAt: String(item.updatedAt || "").trim(),
        __order: item.__order === undefined ? index : item.__order
      };
    }).filter(function (row) {
      return (row.selector || row.className) && row.property && row.value;
    });
  }

  function rowsToStyles(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      return {
        group: row.group || row.sheetKey || row.component || "",
        selector: row.selector || normalizeSelector(row.className, row.component),
        property: row.property || "",
        value: row.value || "",
        component: row.component || "",
        className: row.className || "",
        description: row.description || "",
        updatedAt: row.updatedAt || ""
      };
    }).filter(function (row) {
      return row.selector && row.property && row.value;
    });
  }

  function normalizeCssModel(input, source) {
    var payload = input || {};
    var rows = [];
    var built;
    var cssText = String(payload.cssText || "");
    var styles = Array.isArray(payload.styles) ? payload.styles : [];

    if (Array.isArray(payload.rows)) {
      rows = payload.rows;
    } else if (Array.isArray(payload.latestRows)) {
      rows = payload.latestRows;
    } else if (styles.length) {
      rows = rowsFromStyles(styles);
    }

    if (!cssText && rows.length) {
      built = buildCss(rows);
      cssText = built.cssText;
    } else if (cssText && !rows.length && styles.length) {
      rows = rowsFromStyles(styles);
    }

    if (!cssText || !String(cssText).trim()) {
      throw new Error("CSS model has no cssText");
    }

    built = rows.length ? buildCss(rows) : {
      cssText: appendSharedSwipeTableCss(cssText),
      latestRows: []
    };

    return {
      schemaVersion: Number(payload.schemaVersion || 1),
      generatedAt: payload.generatedAt || payload.savedAtText || "",
      source: source || payload.source || "",
      upstreamSource: payload.upstreamSource || payload.source || "",
      version: payload.version || "",
      hash: payload.hash || hashText(built.cssText || cssText),
      sheetKeys: payload.sheetKeys || [],
      rows: rows,
      latestRows: built.latestRows || [],
      styles: styles.length ? styles : rowsToStyles(built.latestRows || rows),
      cssText: built.cssText || cssText,
      rowsCount: rows.length,
      latestRowsCount: built.latestRows ? built.latestRows.length : 0
    };
  }

  function modelFromRows(rows, source, sheetKeys, extra) {
    var built = buildCss(rows || []);
    var model = normalizeCssModel(Object.assign({
      schemaVersion: 1,
      generatedAt: nowTaipeiText(),
      source: source || "supabase-css-registry",
      sheetKeys: sheetKeys || [],
      rows: rows || [],
      latestRows: built.latestRows,
      styles: rowsToStyles(built.latestRows),
      cssText: built.cssText
    }, extra || {}), source);

    model.hash = hashText(model.cssText);
    return model;
  }

  function injectCss(cssText, meta) {
    meta = meta || {};
    var style = document.getElementById(STYLE_ID);
    var legacy = document.getElementById(LEGACY_STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-skhps-css-runtime", "true");
      document.head.appendChild(style);
    }

    if (legacy && legacy !== style && legacy.parentNode) {
      legacy.parentNode.removeChild(legacy);
    }

    style.textContent = cssText || "";
    style.setAttribute("data-source", meta.source || "unknown");
    style.setAttribute("data-skhps-css-source", meta.source || "unknown");
    style.setAttribute("data-skhps-css-hash", meta.hash || hashText(cssText || ""));
    style.setAttribute("data-skhps-css-updated-at", meta.updatedAt || "");
    style.setAttribute("data-skhps-css-version", meta.version || "");
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      var cache = JSON.parse(raw);
      if (!cache || !cache.cssText) return null;

      return normalizeCssModel(cache, "localStorage-cache");
    } catch (error) {
      console.warn("CSS Registry runtime cache read failed:", error);
      return null;
    }
  }

  function writeCache(data) {
    try {
      var model = normalizeCssModel(data, data && data.source || "supabase-css-registry");

      localStorage.setItem(CACHE_KEY, JSON.stringify({
        schemaVersion: 1,
        savedAt: Date.now(),
        savedAtText: nowTaipeiText(),
        generatedAt: model.generatedAt || nowTaipeiText(),
        source: model.source,
        version: model.version || "",
        hash: model.hash,
        sheetKeys: model.sheetKeys || [],
        rowsCount: model.rowsCount || 0,
        latestRowsCount: model.latestRowsCount || 0,
        styles: model.styles || [],
        cssText: model.cssText
      }));
    } catch (error) {
      console.warn("CSS Registry runtime cache write failed:", error);
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
      LEGACY_CACHE_KEYS.forEach(function (key) {
        localStorage.removeItem(key);
      });
    } catch (error) {
      console.warn("CSS Registry runtime cache clear failed:", error);
    }

    clearSessionReady();
  }

  function cssRuntimeSourceLabel(model) {
    var source = String(model && model.source || "").trim();

    if (source === "localStorage-cache" || source === "early-localStorage-cache") return "localStorage / Supabase Registry cache";
    if (source.indexOf("supabase-css-registry") >= 0) return "Supabase CSS Registry";
    if (source === "backend") return "Supabase CSS Registry";
    return source || "Supabase CSS Registry";
  }

  function setRuntimeObject(model, options) {
    options = options || {};
    var initialDurationMs = cssRuntimeInitialDurationMs !== null
      ? cssRuntimeInitialDurationMs
      : (cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);

    window.SKHPSCssSheetRuntime = {
      source: model.source || "",
      sourceLabel: model.sourceLabel || cssRuntimeSourceLabel(model),
      upstreamSource: model.upstreamSource || "",
      sheetKeys: model.sheetKeys || [],
      rows: model.rows || [],
      latestRows: model.latestRows || [],
      styles: model.styles || [],
      cssText: model.cssText || "",
      hash: model.hash || hashText(model.cssText || ""),
      version: model.version || "",
      generatedAt: model.generatedAt || "",
      updatedAt: options.updatedAt || model.generatedAt || "",
      lastRefreshAt: options.lastRefreshAt || "",
      refreshStatus: options.refreshStatus || "",
      refreshError: options.refreshError || "",
      appliedRefresh: Boolean(options.appliedRefresh),
      initialDurationMs: initialDurationMs,
      refreshDurationMs: options.refreshDurationMs !== undefined ? options.refreshDurationMs : "",
      reload: load,
      refresh: refreshFromRegistry,
      clearCache: clearCache,
      clearSession: clearSessionReady,
      writeCache: writeCache
    };
    window.SKHPSCssRegistryRuntime = window.SKHPSCssSheetRuntime;

    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: true,
        source: window.SKHPSCssSheetRuntime.source,
        sourceLabel: window.SKHPSCssSheetRuntime.sourceLabel,
        upstreamSource: window.SKHPSCssSheetRuntime.upstreamSource,
        durationMs: initialDurationMs,
        initialDurationMs: initialDurationMs,
        refreshDurationMs: window.SKHPSCssSheetRuntime.refreshDurationMs,
        updatedAt: window.SKHPSCssSheetRuntime.updatedAt,
        generatedAt: window.SKHPSCssSheetRuntime.generatedAt,
        version: window.SKHPSCssSheetRuntime.version,
        hash: window.SKHPSCssSheetRuntime.hash,
        refreshStatus: window.SKHPSCssSheetRuntime.refreshStatus,
        refreshError: window.SKHPSCssSheetRuntime.refreshError,
        lastRefreshAt: window.SKHPSCssSheetRuntime.lastRefreshAt,
        appliedRefresh: window.SKHPSCssSheetRuntime.appliedRefresh,
        rowsCount: model.rowsCount || (model.rows ? model.rows.length : 0),
        latestRowsCount: model.latestRowsCount || (model.latestRows ? model.latestRows.length : 0)
      });
    }
  }

  function dispatchReady(detailName) {
    document.dispatchEvent(new CustomEvent("skhps-css-sheet-runtime-ready", {
      detail: window.SKHPSCssSheetRuntime
    }));

    document.dispatchEvent(new CustomEvent(detailName || "skhps-css-runtime-updated", {
      detail: window.SKHPSCssSheetRuntime
    }));
  }

  function applyCssModel(model, options) {
    options = options || {};
    model = normalizeCssModel(model, options.source || model.source);
    model.hash = model.hash || hashText(model.cssText || "");

    if (options.skipIfSame && lastAppliedHash && lastAppliedHash === model.hash) {
      var current = window.SKHPSCssSheetRuntime || {};
      var currentStyle = document.getElementById(STYLE_ID);
      var kept = normalizeCssModel({
        schemaVersion: current.schemaVersion || model.schemaVersion || 1,
        generatedAt: current.generatedAt || model.generatedAt || "",
        source: current.source || model.source || "",
        upstreamSource: model.upstreamSource || model.source || "",
        version: current.version || model.version || "",
        hash: current.hash || model.hash,
        sheetKeys: model.sheetKeys || current.sheetKeys || [],
        rows: model.rows || current.rows || [],
        latestRows: model.latestRows || current.latestRows || [],
        styles: model.styles || current.styles || [],
        cssText: current.cssText || model.cssText
      }, current.source || model.source);

      kept.hash = model.hash;
      if (!currentStyle || String(currentStyle.textContent || "").indexOf("shared swipe/expand table visual baseline") < 0) {
        injectCss(kept.cssText, {
          source: kept.source,
          hash: kept.hash,
          updatedAt: kept.generatedAt || kept.updatedAt || "",
          version: kept.version || ""
        });
      }
      setRuntimeObject(kept, Object.assign({}, options, {
        updatedAt: current.updatedAt || current.generatedAt || model.generatedAt || "",
        lastRefreshAt: options.lastRefreshAt || nowTaipeiText(),
        refreshStatus: options.refreshStatus || "success",
        refreshError: "",
        appliedRefresh: false
      }));
      dispatchReady(options.eventName);
      return {
        applied: false,
        model: model
      };
    }

    injectCss(model.cssText, {
      source: model.source,
      hash: model.hash,
      updatedAt: model.generatedAt || model.updatedAt || "",
      version: model.version || ""
    });

    lastAppliedHash = model.hash;
    document.documentElement.setAttribute("data-skhps-css-ready", "true");
    document.documentElement.setAttribute("data-skhps-css-source", model.source || "");
    document.documentElement.setAttribute("data-skhps-css-hash", model.hash || "");

    setRuntimeObject(model, options);
    markCssRuntimeDone();
    runtimeDone(model.source);
    dispatchReady(options.eventName);

    return {
      applied: true,
      model: model
    };
  }

  function applyCacheIfAvailable() {
    traceFunction("applyCacheIfAvailable", "start");
    var cache = readCache();

    if (!cache) {
      traceFunction("applyCacheIfAvailable", "done", {
        source: "none"
      });
      return false;
    }

    applyCssModel(cache, {
      source: "localStorage-cache"
    });

    setStatus(
      "CSS：已套用 localStorage 快取 " +
      (cache.sheetKeys ? cache.sheetKeys.length : "?") +
      " 張 / " +
      (cache.latestRowsCount || "?") +
      " 組樣式",
      true
    );

    traceFunction("applyCacheIfAvailable", "done", {
      source: "localStorage-cache"
    });

    return true;
  }

  function load(options) {
    options = options || {};
    traceFunction("load", "start", {
      silent: Boolean(options.silent)
    });

    return getConfig().then(function (config) {
      applyLoadingTitle(config);

      var sheetKeys = getEnabledSheetKeys(config);

      if (!sheetKeys.length) {
        throw new Error("CSS Registry keys are empty");
      }

      if (!options.silent) {
        setStatus("CSS Registry：重新讀取 Supabase（" + sheetKeys.length + " 組）", false);
      }

      return loadRows(config, sheetKeys).then(function (rows) {
        return {
          source: "supabase-css-registry",
          config: config,
          sheetKeys: sheetKeys,
          rows: rows
        };
      });
    }).then(function (result) {
      var model = modelFromRows(result.rows, result.source, result.sheetKeys);
      rlog("OK", "applyRows", {
        source: result.source,
        sheetKeys: result.sheetKeys,
        rowsCount: result.rows.length,
        latestRowsCount: model.latestRows.length
      });

      applyCssModel(model, {
        source: result.source
      });
      traceFunction("load", "done", {
        source: result.source
      });
      rlog("OK", "done", "css-runtime", cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);

      writeCache(Object.assign({}, model, {
        source: "supabase-css-registry"
      }));
      setSessionReady();

      setStatus(
        "CSS Registry：已重新讀取 " +
        result.sheetKeys.length +
        " 組 / " +
        model.latestRows.length +
        " 組樣式（" +
        result.source +
        "）",
        true
      );

      return window.SKHPSCssSheetRuntime;
    }).catch(function (error) {
      console.error("CSS Registry runtime failed:", error);

      /*
        第一次進網域重新抓 Supabase CSS Registry 失敗時，如果 localStorage 有舊 cache，
        才退回舊 cache，避免畫面壞掉。
      */
      if (applyCacheIfAvailable()) {
        setStatus("CSS Registry：重新讀取失敗，暫用舊快取：" + (error.message || String(error)), false);
        return window.SKHPSCssSheetRuntime;
      }

      markCssRuntimeFailed(error);
      setStatus("CSS Registry：載入失敗：" + (error.message || String(error)), false);
      traceFunction("load", "error", {
        error: error && error.message ? error.message : String(error)
      });
      rlog("FAIL", "load", {
        error: error && error.message ? error.message : String(error)
      });
      throw error;
    });
  }

  function fetchSheetModel(options) {
    options = options || {};

    return getConfig().then(function (config) {
      applyLoadingTitle(config);

      var sheetKeys = getEnabledSheetKeys(config);
      if (!sheetKeys.length) throw new Error("CSS Registry keys are empty");

      return loadRows(config, sheetKeys).then(function (rows) {
        return modelFromRows(rows, options.source || "supabase-css-registry-refresh", sheetKeys, {
          upstreamSource: "supabase"
        });
      });
    });
  }

  function refreshFromRegistry(options) {
    options = options || {};
    var startedAt = Date.now();

    return fetchSheetModel({
      source: "supabase-css-registry-refresh"
    }).then(function (model) {
      var result = applyCssModel(model, {
        source: "supabase-css-registry-refresh",
        skipIfSame: true,
        refreshStatus: "success",
        refreshDurationMs: Date.now() - startedAt,
        lastRefreshAt: nowTaipeiText(),
        eventName: "skhps-css-runtime-refreshed"
      });

      writeCache(Object.assign({}, model, {
        source: "supabase-css-registry-refresh"
      }));
      setSessionReady();

      setStatus(
        result.applied
          ? "CSS Registry：Supabase 刷新完成並已套用新版 CSS（hash " + model.hash + "）"
          : "CSS Registry：Supabase 刷新完成，CSS 無變更（hash " + model.hash + "）",
        true
      );

      rlog("OK", "cssRegistryRefresh", {
        hash: model.hash,
        applied: result.applied,
        source: model.upstreamSource || model.source
      });

      return result;
    }).catch(function (error) {
      var current = window.SKHPSCssSheetRuntime || {};
      if (runtime() && typeof runtime().setCssRuntime === "function") {
        runtime().setCssRuntime(Object.assign({}, current, {
          loaded: Boolean(current.cssText),
          refreshStatus: "failed",
          refreshError: error && error.message ? error.message : String(error),
          refreshDurationMs: Date.now() - startedAt,
          lastRefreshAt: nowTaipeiText()
        }));
      }
      setStatus("CSS Registry：Supabase 刷新失敗，保留目前 CSS：" + (error.message || String(error)), false);
      rlog("WARN", "cssRegistryRefresh", {
        error: error && error.message ? error.message : String(error)
      });
      return {
        applied: false,
        error: error
      };
    });
  }

  function refreshFromSheet(options) {
    return refreshFromRegistry(options);
  }

  function startBackgroundRefresh() {
    refreshFromRegistry({
      reason: "runtime-background",
      apply: false
    }).catch(function (error) {
      console.warn("CSS Registry background refresh failed:", error);
    });
  }

  function initialLoad() {
    keepLoading();

    getConfig()
      .then(function (config) {
        applyLoadingTitle(config);
      })
      .catch(function () {});

    /*
      新順序：
      1. 先吃 localStorage cache
      2. cache 命中就立刻放行
      3. 背景刷新 Supabase CSS Registry
      4. cache 沒命中才讀 Supabase CSS Registry
      5. registry 失敗就回報失敗，不套假樣式
    */
    if (applyCacheIfAvailable()) {
      setStatus("CSS：已套用 localStorage cache，背景刷新 Supabase CSS Registry。", true);
      startBackgroundRefresh();
      return;
    }

    load({
      silent: false
    }).catch(function (registryError) {
      rlog("FAIL", "initialLoad", {
        error: registryError && registryError.message ? registryError.message : String(registryError || "")
      });
    });
  }

  ready(function () {
    /*
      核心規則：
      - 每次進頁面先套 localStorage cache。
      - 背景刷新 Supabase CSS Registry。
      - localStorage/Supabase 都失敗就讓 loading gate 收到失敗狀態。
      - 保留舊 global 名稱與事件名稱，避免既有頁面入口斷裂。
    */
    initialLoad();
  });

  window.SKHPSCssSheetRuntimeLoader = {
    load: load,
    initialLoad: initialLoad,
    applyCssModel: applyCssModel,
    normalizeCssModel: normalizeCssModel,
    fetchSheetModel: fetchSheetModel,
    fetchRegistryModel: fetchSheetModel,
    refreshFromRegistry: refreshFromRegistry,
    refreshFromSheet: refreshFromSheet,
    writeCache: writeCache,
    clearCache: clearCache,
    clearSession: clearSessionReady,
    cacheKey: CACHE_KEY,
    legacyCacheKey: LEGACY_CACHE_KEYS[0],
    legacyCacheKeys: LEGACY_CACHE_KEYS,
    sessionReadyKey: SESSION_READY_KEY
  };
  rlog("OK", "moduleReady", "css-sheet-runtime.js");
})();

