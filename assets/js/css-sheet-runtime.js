/*
檔案位置：skhpsv2/assets/js/css-sheet-runtime.js
時間戳記：2026-06-22 09:40 UTC+8
用途：統一 CSS runtime；先套用 skhpsv2/uni-CSS.CSS 快取，失敗才退回 localStorage / Sheet / DEFAULT CSS，並由 CSS-fetch.js 背景刷新 Sheet cache。
*/

(function () {
  "use strict";

  var currentScript = document.currentScript;
  var STYLE_ID = "skhps-css-runtime-style";
  var LEGACY_STYLE_ID = "skhps-css-sheet-runtime";
  var STATUS_ATTR = "data-css-sheet-runtime-status";
  var LOADING_CLASS = "skhps-css-loading";

  /*
    localStorage：
    保存 CSS 文字，讓同一次瀏覽流程切到 admin/css-setting/其他頁時可以立即套用。

    sessionStorage：
    只記錄「這次開網域後是否已經抓過一次 Sheet」。
    關閉分頁/瀏覽器後，下次第一次進網域會重新抓 Sheet。
  */
  var CACHE_KEY = "skhpsv2.cssSheetRuntimeCache.v2";
  var LEGACY_CACHE_KEY = "skhpsv2.cssSheetRuntimeCache.v1";
  var SESSION_READY_KEY = "skhpsv2.cssSheetRuntimeSessionReady.v1";
  var CSS_CACHE_PATH = "uni-CSS.CSS";
  var CSS_FETCH_PATH = "assets/js/CSS-fetch.js";
  var DEFAULT_CSS_TEXT = [
    "/* skhps css runtime default fallback */",
    ":root {",
    "  --skhps-primary: #0f766e;",
    "  --skhps-surface: #ffffff;",
    "  --skhps-bg: #f4f7fb;",
    "  --skhps-text: #162231;",
    "}",
    "body {",
    "  background: var(--skhps-bg);",
    "  color: var(--skhps-text);",
    "}"
  ].join("\n");
  var cssRuntimeStartedAt = 0;
  var cssRuntimeInitialDurationMs = null;
  var cssRuntimeGateDone = false;
  var lastAppliedHash = "";
  var cssFileFetchState = {
    url: "",
    status: "",
    ok: null,
    error: ""
  };

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
      console.warn("CSS Sheet runtime session flag write failed:", error);
    }
  }

  function clearSessionReady() {
    try {
      sessionStorage.removeItem(SESSION_READY_KEY);
    } catch (error) {
      console.warn("CSS Sheet runtime session flag clear failed:", error);
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

  function stripQueryAndHash(url) {
    return String(url || "").split("#")[0].split("?")[0];
  }

  function inferSharedBaseUrl() {
    var src = currentScript && currentScript.src ? currentScript.src : "";

    if (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.sharedBaseUrl) {
      return window.SKHPS_APP_ENV.sharedBaseUrl;
    }

    if (window.SKHPS_ENTRY_BASE_URL) {
      return window.SKHPS_ENTRY_BASE_URL;
    }

    if (window.SKHPS_CONFIG_BASE_URL) {
      return window.SKHPS_CONFIG_BASE_URL;
    }

    if (src) {
      return stripQueryAndHash(src).replace(/\/assets\/js\/css-sheet-runtime\.js$/i, "/");
    }

    return "";
  }

  function inferCoreBaseUrl() {
    var htmlRuntime = document.documentElement.getAttribute("data-skhps-runtime") || "";
    var host = String(window.location.hostname || "").toLowerCase();
    var runtimeName = String(
      htmlRuntime ||
      (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env) ||
      ""
    ).trim().toLowerCase();

    var shared = inferSharedBaseUrl();
    if (shared) return normalizeBaseUrl(shared);

    if (host === "127.0.0.1" || host === "localhost" || host === "") {
      return window.location.origin + "/skhpsv2/";
    }

    if (runtimeName === "local-dev" || runtimeName === "local") {
      return window.location.origin + "/skhpsv2/";
    }

    if (runtimeName === "dev" || host === "dev-skhps.jonaminz.com") {
      return "https://dev-skhps.jonaminz.com/";
    }

    return "https://skhps.jonaminz.com/";
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    if (/^https?:\/\//i.test(String(path || ""))) return path;
    if (!baseUrl) return path;
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
  }

  function getRuntimeVersion() {
    if (window.SKHPS_ENTRY_VERSION) {
      return String(window.SKHPS_ENTRY_VERSION || "").trim();
    }

    if (currentScript && currentScript.src && currentScript.src.indexOf("?") >= 0) {
      try {
        return new URL(currentScript.src).searchParams.get("v") || "";
      } catch (error) {
        return "";
      }
    }

    return "";
  }

  function withVersion(url) {
    var version = getRuntimeVersion();
    if (!version) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function cssCacheUrl() {
    return joinUrl(inferCoreBaseUrl(), CSS_CACHE_PATH);
  }

  function cssFetchUrl() {
    return withVersion(joinUrl(inferSharedBaseUrl(), CSS_FETCH_PATH));
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
      2026-06-11 固定版：
      CSS Sheet 先收斂成單一 gid 0 / CSS總表。
      如果 config.json 還沒補 cssSheets，也不要讓 runtime 直接失敗。
    */
    if (!cssSheets || !Object.keys(cssSheets).length) {
      return {
        cssMain: {
          key: "cssMain",
          title: "CSS總表",
          tabName: "CSS總表",
          tabGid: "0",
          enabled: true
        }
      };
    }

    if (!cssSheets.cssMain && cssSheets.baseStyle) {
      cssSheets.cssMain = {
        key: "cssMain",
        title: "CSS總表",
        tabName: "CSS總表",
        tabGid: "0",
        enabled: true
      };
    }

    return cssSheets;
  }

  function getEnabledSheetKeys(config) {
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

  function csvUrl(config, sheetKey) {
    var spreadsheetId = config && config.sheets && config.sheets.mainSpreadsheetId;
    var sheet = getCssSheets(config)[sheetKey];

    if (!spreadsheetId) throw new Error("config.json missing sheets.mainSpreadsheetId");

    if (!sheet || sheet.tabGid === undefined || sheet.tabGid === null || sheet.tabGid === "") {
      throw new Error("config.json missing sheets.cssSheets." + sheetKey + ".tabGid");
    }

    return "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(spreadsheetId) +
      "/export?format=csv&gid=" +
      encodeURIComponent(sheet.tabGid) +
      "&ts=" +
      Date.now();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var quote = false;

    for (var i = 0; i < text.length; i += 1) {
      var c = text[i];
      var n = text[i + 1];

      if (quote) {
        if (c === '"' && n === '"') {
          cell += '"';
          i += 1;
        } else if (c === '"') {
          quote = false;
        } else {
          cell += c;
        }
      } else {
        if (c === '"') {
          quote = true;
        } else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (c !== "\r") {
          cell += c;
        }
      }
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return r.some(function (x) {
        return String(x || "").trim() !== "";
      });
    });
  }

  function rowsFromCsv(sheetKey, csvRows) {
    var header = csvRows[0] || [];
    var idx = {};

    header.forEach(function (h, i) {
      idx[String(h || "").trim()] = i;
    });

    return csvRows.slice(1).map(function (row, order) {
      return {
        sheetKey: sheetKey,
        component: String(row[idx.component] || "").trim(),
        className: String(row[idx.className] || "").trim(),
        property: String(row[idx.property] || "").trim(),
        value: String(row[idx.value] || "").trim(),
        description: String(row[idx.description] || "").trim(),
        updatedAt: String(row[idx.updatedAt] || "").trim(),
        __order: order
      };
    }).filter(function (row) {
      return row.className && row.property && row.value;
    });
  }

  function loadRowsFromCsv(config, sheetKeys) {
    var startedAt = Date.now();
    rlog("RUN", "loadCsv", {
      sheetKeys: sheetKeys
    });
    return Promise.all(sheetKeys.map(function (sheetKey) {
      return fetch(csvUrl(config, sheetKey), { cache: "no-store" })
        .then(function (res) {
          return res.text().then(function (text) {
            if (!res.ok) throw new Error(sheetKey + " CSV HTTP " + res.status);
            return rowsFromCsv(sheetKey, parseCsv(text));
          });
        });
    })).then(function (groups) {
      return groups.reduce(function (acc, rows) {
        return acc.concat(rows);
      }, []);
    }).then(function (rows) {
      rlog("OK", "loadCsv", {
        sheetKeys: sheetKeys,
        rowsCount: rows.length
      }, Date.now() - startedAt);
      return rows;
    }).catch(function (error) {
      rlog("FAIL", "loadCsv", {
        sheetKeys: sheetKeys,
        error: error && error.message ? error.message : String(error)
      }, Date.now() - startedAt);
      throw error;
    });
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

    rlog("RUN", "loadSheetBackend", {
      sheetKeys: sheetKeys
    });

    return window.SKHPSBackend.call("getCssSheetRuntime", {
      sheetKeys: sheetKeys,
      sheets: sheetKeys
    }).then(function (res) {
      if (!res || res.ok === false) {
        throw new Error(res && (res.message || res.error) ? (res.message || res.error) : "getCssSheetRuntime failed");
      }

      var rows = normalizeBackendRows(res, sheetKeys);
      if (!rows.length) throw new Error("getCssSheetRuntime returned no rows");
      rlog("OK", "loadSheetBackend", {
        sheetKeys: sheetKeys,
        rowsCount: rows.length
      });
      return rows;
    });
  }

  function shouldUseBackend(config) {
    /*
      現階段預設 false，避免 Apps Script 尚未支援 getCssSheetRuntime 時，
      每次載入都噴 JSONP failed。
      之後後端補好後，在 config.json 加：
      "cssRuntime": { "source": "backend" }
      就能切回後端。
    */
    return config && config.cssRuntime && config.cssRuntime.source === "backend";
  }

  function loadRows(config, sheetKeys) {
    if (shouldUseBackend(config)) {
      return loadRowsFromBackend(sheetKeys).catch(function (error) {
        console.warn("CSS Sheet backend failed, fallback to CSV:", error);
        rlog("WARN", "loadSheetBackend", {
          sheetKeys: sheetKeys,
          error: error && error.message ? error.message : String(error),
          fallback: "csv"
        });
        return loadRowsFromCsv(config, sheetKeys);
      });
    }

    return loadRowsFromCsv(config, sheetKeys);
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

    var css = ["/* skhps css sheet runtime generated */"];

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
      "/* shared swipe table scale settings */",
      ".sk-swipe-table {",
      "  font-size: var(--sk-swipe-table-font-size, calc(17px * var(--sk-swipe-table-scale, 1))) !important;",
      "}",
      "",
      ".sk-swipe-table .sk-project-main {",
      "  min-height: var(--sk-swipe-table-row-min-height, calc(64px * var(--sk-swipe-table-scale, 1))) !important;",
      "  padding: var(--sk-swipe-table-main-padding, calc(10px * var(--sk-swipe-table-scale, 1)) calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "  gap: var(--sk-swipe-table-main-gap, calc(8px * var(--sk-swipe-table-scale, 1))) !important;",
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
      "}",
      "",
      ".sk-swipe-table .sk-data-row.is-action-open .sk-row-action-rail {",
      "  transform: none !important;",
      "}",
      "",
      ".sk-swipe-table .sk-data-row.is-action-open .sk-project-main {",
      "  padding-left: calc(var(--sk-swipe-action-rail-width, calc(124px * var(--sk-swipe-table-scale, 1))) + var(--sk-swipe-primary-text-gap, calc(6px * var(--sk-swipe-table-scale, 1)))) !important;",
      "}",
      "",
      ".sk-swipe-table .sk-data-row.is-action-open .sk-mobile-meta {",
      "  margin-left: calc(var(--sk-swipe-action-rail-width, calc(124px * var(--sk-swipe-table-scale, 1))) + var(--sk-swipe-primary-text-gap, calc(6px * var(--sk-swipe-table-scale, 1)))) !important;",
      "}",
      "",
      ".sk-swipe-table.is-reorder-mode .sk-project-main {",
      "  padding-left: var(--sk-swipe-table-reorder-main-padding-left, calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "}",
      "",
      ".sk-swipe-global-overflow-menu .sk-row-action-menu-item {",
      "  font-size: var(--sk-swipe-menu-font-size, calc(16px * var(--sk-swipe-table-scale, 1))) !important;",
      "}"
    ].join("\n");
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
      cssText: cssText,
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
      source: source || "sheet",
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
      var raw = localStorage.getItem(CACHE_KEY) || localStorage.getItem(LEGACY_CACHE_KEY);
      if (!raw) return null;

      var cache = JSON.parse(raw);
      if (!cache || !cache.cssText) return null;

      return normalizeCssModel(cache, "localStorage-cache");
    } catch (error) {
      console.warn("CSS Sheet runtime cache read failed:", error);
      return null;
    }
  }

  function writeCache(data) {
    try {
      var model = normalizeCssModel(data, data && data.source || "sheet-refresh");

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
      console.warn("CSS Sheet runtime cache write failed:", error);
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(LEGACY_CACHE_KEY);
    } catch (error) {
      console.warn("CSS Sheet runtime cache clear failed:", error);
    }

    clearSessionReady();
  }

  function setRuntimeObject(model, options) {
    options = options || {};
    var initialDurationMs = cssRuntimeInitialDurationMs !== null
      ? cssRuntimeInitialDurationMs
      : (cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);

    window.SKHPSCssSheetRuntime = {
      source: model.source || "",
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
      cssFileUrl: cssFileFetchState.url || "",
      cssFileFetchStatus: cssFileFetchState.status || "",
      cssFileFetchOk: cssFileFetchState.ok,
      cssFileFetchError: cssFileFetchState.error || "",
      appliedRefresh: Boolean(options.appliedRefresh),
      initialDurationMs: initialDurationMs,
      refreshDurationMs: options.refreshDurationMs !== undefined ? options.refreshDurationMs : "",
      reload: load,
      refresh: refreshFromSheet,
      clearCache: clearCache,
      clearSession: clearSessionReady,
      writeCache: writeCache
    };

    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: true,
        source: window.SKHPSCssSheetRuntime.source,
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
        cssFileUrl: window.SKHPSCssSheetRuntime.cssFileUrl,
        cssFileFetchStatus: window.SKHPSCssSheetRuntime.cssFileFetchStatus,
        cssFileFetchOk: window.SKHPSCssSheetRuntime.cssFileFetchOk,
        cssFileFetchError: window.SKHPSCssSheetRuntime.cssFileFetchError,
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
        throw new Error("config.json sheets.cssSheets is empty");
      }

      if (!options.silent) {
        setStatus("CSS Sheet：重新讀取 Sheet（" + sheetKeys.length + " 張）", false);
      }

      return loadRows(config, sheetKeys).then(function (rows) {
        return {
          source: shouldUseBackend(config) ? "backend" : "csv",
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
        source: "sheet-refresh"
      }));
      setSessionReady();

      setStatus(
        "CSS Sheet：已重新讀取 " +
        result.sheetKeys.length +
        " 張 / " +
        model.latestRows.length +
        " 組樣式（" +
        result.source +
        "）",
        true
      );

      return window.SKHPSCssSheetRuntime;
    }).catch(function (error) {
      console.error("CSS Sheet runtime failed:", error);

      /*
        第一次進網域重新抓 Sheet 失敗時，如果 localStorage 有舊 cache，
        才退回舊 cache，避免畫面壞掉。
      */
      if (applyCacheIfAvailable()) {
        setStatus("CSS Sheet：重新讀取失敗，暫用舊快取：" + (error.message || String(error)), false);
        return window.SKHPSCssSheetRuntime;
      }

      markCssRuntimeFailed(error);
      setStatus("CSS Sheet：載入失敗：" + (error.message || String(error)), false);
      traceFunction("load", "error", {
        error: error && error.message ? error.message : String(error)
      });
      rlog("FAIL", "load", {
        error: error && error.message ? error.message : String(error)
      });
      throw error;
    });
  }

  function loadCssFileCache() {
    var url = cssCacheUrl();

    cssFileFetchState = {
      url: url,
      status: "pending",
      ok: null,
      error: ""
    };

    traceFunction("loadCssFileCache", "start", {
      url: url
    });
    rlog("RUN", "loadCssFileCache", url);

    return fetch(url, {
      cache: "no-store"
    }).then(function (res) {
      cssFileFetchState.status = String(res.status) + " " + (res.statusText || "");
      cssFileFetchState.ok = Boolean(res.ok);
      return res.text().then(function (text) {
        if (!res.ok) throw new Error("uni-CSS.CSS HTTP " + res.status);
        return text;
      });
    }).then(function (cssText) {
      var model = normalizeCssModel({
        schemaVersion: 1,
        generatedAt: "",
        source: "css-file",
        cssText: cssText
      }, "css-file");
      model.source = "css-file";
      model.upstreamSource = "sheet-snapshot";
      rlog("OK", "loadCssFileCache", {
        url: url,
        status: cssFileFetchState.status,
        hash: model.hash
      });
      return model;
    }).catch(function (error) {
      cssFileFetchState.ok = false;
      cssFileFetchState.error = error && error.message ? error.message : String(error);
      if (cssFileFetchState.status === "pending") {
        cssFileFetchState.status = "failed";
      }
      rlog("WARN", "loadCssFileCache", {
        url: url,
        status: cssFileFetchState.status,
        error: cssFileFetchState.error
      });
      throw error;
    });
  }

  function applyDefaultFallback(error) {
    var model = normalizeCssModel({
      schemaVersion: 1,
      generatedAt: nowTaipeiText(),
      source: "default-fallback",
      cssText: DEFAULT_CSS_TEXT
    }, "default-fallback");

    applyCssModel(model, {
      source: "default-fallback",
      refreshStatus: "failed",
      refreshError: error && error.message ? error.message : String(error || "")
    });

    setStatus("CSS：已套用 DEFAULT fallback；" + (error && error.message ? error.message : String(error || "no cache")), false);
    rlog("WARN", "defaultFallback", {
      error: error && error.message ? error.message : String(error || "")
    });
    return window.SKHPSCssSheetRuntime;
  }

  function loadScriptOnce(src, globalName) {
    if (globalName && window[globalName]) {
      return Promise.resolve(window[globalName]);
    }

    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-skhps-runtime-src="' + src + '"]');
      var script;

      if (existing) {
        existing.addEventListener("load", function () {
          resolve(globalName ? window[globalName] : true);
        });
        existing.addEventListener("error", function () {
          reject(new Error("script load failed: " + src));
        });
        return;
      }

      script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.setAttribute("data-skhps-runtime-src", src);
      script.onload = function () {
        resolve(globalName ? window[globalName] : true);
      };
      script.onerror = function () {
        reject(new Error("script load failed: " + src));
      };
      document.head.appendChild(script);
    });
  }

  function ensureCssFetch() {
    if (window.SKHPSCssFetch && typeof window.SKHPSCssFetch.refresh === "function") {
      return Promise.resolve(window.SKHPSCssFetch);
    }

    return loadScriptOnce(cssFetchUrl(), "SKHPSCssFetch");
  }

  function fetchSheetModel(options) {
    options = options || {};

    return getConfig().then(function (config) {
      applyLoadingTitle(config);

      var sheetKeys = getEnabledSheetKeys(config);
      if (!sheetKeys.length) throw new Error("config.json sheets.cssSheets is empty");

      return loadRows(config, sheetKeys).then(function (rows) {
        return modelFromRows(rows, options.source || "sheet-refresh", sheetKeys, {
          upstreamSource: shouldUseBackend(config) ? "backend" : "csv"
        });
      });
    });
  }

  function refreshFromSheet(options) {
    options = options || {};
    var startedAt = Date.now();

    return fetchSheetModel({
      source: "sheet-refresh"
    }).then(function (model) {
      var result = applyCssModel(model, {
        source: "sheet-refresh",
        skipIfSame: true,
        refreshStatus: "success",
        refreshDurationMs: Date.now() - startedAt,
        lastRefreshAt: nowTaipeiText(),
        eventName: "skhps-css-runtime-refreshed"
      });

      writeCache(Object.assign({}, model, {
        source: "sheet-refresh"
      }));
      setSessionReady();

      setStatus(
        result.applied
          ? "CSS Sheet：背景刷新完成並已套用新版 CSS（hash " + model.hash + "）"
          : "CSS Sheet：背景刷新完成，CSS 無變更（hash " + model.hash + "）",
        true
      );

      rlog("OK", "sheetRefresh", {
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
      setStatus("CSS Sheet：背景刷新失敗，保留目前 CSS：" + (error.message || String(error)), false);
      rlog("WARN", "sheetRefresh", {
        error: error && error.message ? error.message : String(error)
      });
      return {
        applied: false,
        error: error
      };
    });
  }

  function startBackgroundRefresh() {
    refreshFromSheet({
      reason: "runtime-background",
      apply: false
    }).catch(function (error) {
      console.warn("CSS Sheet background refresh failed:", error);
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
      3. 背景刷新 Sheet
      4. cache 沒命中才讀 Sheet
      5. Sheet 失敗才 default fallback
    */
    if (applyCacheIfAvailable()) {
      setStatus("CSS：已套用 localStorage cache，背景刷新 Sheet。", true);
      startBackgroundRefresh();
      return;
    }

    load({
      silent: false
    }).catch(function (sheetError) {
      applyDefaultFallback(sheetError);
    });
  }

  ready(function () {
    /*
      核心規則：
      - 每次進頁面都先讀 skhpsv2/uni-CSS.CSS。
      - uni-CSS.CSS 失敗才讀 localStorage cache。
      - uni-CSS.CSS/localStorage 都失敗才讀 Sheet；Sheet 也失敗才套 DEFAULT CSS。
      - Sheet refresh 由 CSS-fetch.js 背景執行，不阻塞已套用快取的主畫面。
    */
    initialLoad();
  });

  window.SKHPSCssSheetRuntimeLoader = {
    load: load,
    initialLoad: initialLoad,
    loadCssFileCache: loadCssFileCache,
    applyCssModel: applyCssModel,
    normalizeCssModel: normalizeCssModel,
    fetchSheetModel: fetchSheetModel,
    refreshFromSheet: refreshFromSheet,
    writeCache: writeCache,
    clearCache: clearCache,
    clearSession: clearSessionReady,
    cacheKey: CACHE_KEY,
    legacyCacheKey: LEGACY_CACHE_KEY,
    sessionReadyKey: SESSION_READY_KEY
  };
  rlog("OK", "moduleReady", "css-sheet-runtime.js");
})();

