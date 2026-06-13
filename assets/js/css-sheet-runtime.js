/*
檔案位置：skhpsv2/assets/js/css-sheet-runtime.js
時間戳記：2026-06-11 UTC+8
用途：統一 CSS Sheet runtime；固定使用 CSS總表 / gid 0 作為 CSS 來源。第一次進入網域一定重新抓 Sheet，同一次瀏覽流程換頁才使用 localStorage cache；loading title 由 config.json / pages / document.title 自動帶入。正式預設走 CSV，避免後端 action 尚未完成時噴 JSONP failed。CSS 載入狀態被動回報給 SKHPSLoading gate。
*/

(function () {
  "use strict";

  var STYLE_ID = "skhps-css-sheet-runtime";
  var STATUS_ATTR = "data-css-sheet-runtime-status";
  var LOADING_CLASS = "skhps-css-loading";

  /*
    localStorage：
    保存 CSS 文字，讓同一次瀏覽流程切到 admin/css-setting/其他頁時可以立即套用。

    sessionStorage：
    只記錄「這次開網域後是否已經抓過一次 Sheet」。
    關閉分頁/瀏覽器後，下次第一次進網域會重新抓 Sheet。
  */
  var CACHE_KEY = "skhpsv2.cssSheetRuntimeCache.v1";
  var SESSION_READY_KEY = "skhpsv2.cssSheetRuntimeSessionReady.v1";
  var cssRuntimeStartedAt = 0;

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
    if (runtime() && typeof runtime().setCssRuntime === "function") {
      runtime().setCssRuntime({
        loaded: true,
        source: source || "",
        durationMs: cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null
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
      raw.indexOf("@media") === 0
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
      var selector = normalizeSelector(row.className, row.component);
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

    latest.forEach(function (row) {
      var selector = row.selector;

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

    return {
      cssText: css.join("\n"),
      latestRows: latest
    };
  }

  function injectCss(cssText) {
    var style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-source", "css-sheet-runtime");
      document.head.appendChild(style);
    }

    style.textContent = cssText || "";
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      var cache = JSON.parse(raw);
      if (!cache || !cache.cssText) return null;

      return cache;
    } catch (error) {
      console.warn("CSS Sheet runtime cache read failed:", error);
      return null;
    }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        source: data.source,
        sheetKeys: data.sheetKeys,
        rowsCount: data.rows ? data.rows.length : 0,
        latestRowsCount: data.latestRows ? data.latestRows.length : 0,
        cssText: data.cssText
      }));
    } catch (error) {
      console.warn("CSS Sheet runtime cache write failed:", error);
    }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (error) {
      console.warn("CSS Sheet runtime cache clear failed:", error);
    }

    clearSessionReady();
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

    injectCss(cache.cssText);
    markCssRuntimeDone();

    setStatus(
      "CSS Sheet：已套用本次瀏覽快取 " +
      (cache.sheetKeys ? cache.sheetKeys.length : "?") +
      " 張 / " +
      (cache.latestRowsCount || "?") +
      " 組樣式",
      true
    );

    window.SKHPSCssSheetRuntime = {
      source: "cache",
      sheetKeys: cache.sheetKeys || [],
      rows: [],
      latestRows: [],
      cssText: cache.cssText,
      reload: load,
      clearCache: clearCache,
      clearSession: clearSessionReady
    };

    runtimeDone("cache");
    traceFunction("applyCacheIfAvailable", "done", {
      source: "cache"
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
      var built = buildCss(result.rows);
      rlog("OK", "applyRows", {
        source: result.source,
        sheetKeys: result.sheetKeys,
        rowsCount: result.rows.length,
        latestRowsCount: built.latestRows.length
      });

      injectCss(built.cssText);
      markCssRuntimeDone();

      window.SKHPSCssSheetRuntime = {
        source: result.source,
        sheetKeys: result.sheetKeys,
        rows: result.rows,
        latestRows: built.latestRows,
        cssText: built.cssText,
        reload: load,
        clearCache: clearCache,
        clearSession: clearSessionReady
      };

      runtimeDone(result.source);
      traceFunction("load", "done", {
        source: result.source
      });
      rlog("OK", "done", "css-runtime", cssRuntimeStartedAt ? Date.now() - cssRuntimeStartedAt : null);

      writeCache(window.SKHPSCssSheetRuntime);
      setSessionReady();

      setStatus(
        "CSS Sheet：已重新讀取 " +
        result.sheetKeys.length +
        " 張 / " +
        built.latestRows.length +
        " 組樣式（" +
        result.source +
        "）",
        true
      );

      document.dispatchEvent(new CustomEvent("skhps-css-sheet-runtime-ready", {
        detail: window.SKHPSCssSheetRuntime
      }));

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

  ready(function () {
    /*
      核心規則：
      - 第一次進入這個網域/分頁 session：一定 loading + 重新抓 Sheet。
      - 同一次 session 換頁：如果有 cache，就直接用 cache，不跳 loading。
      - CSS Setting save 成功後會 clearCache()，也會清 session flag，所以下次會重新抓。
    */
    if (getSessionReady() && applyCacheIfAvailable()) {
      return;
    }

    keepLoading();
    load({
      silent: false
    }).catch(function () {});
  });

  window.SKHPSCssSheetRuntimeLoader = {
    load: load,
    clearCache: clearCache,
    clearSession: clearSessionReady,
    cacheKey: CACHE_KEY,
    sessionReadyKey: SESSION_READY_KEY
  };
  rlog("OK", "moduleReady", "css-sheet-runtime.js");
})();
