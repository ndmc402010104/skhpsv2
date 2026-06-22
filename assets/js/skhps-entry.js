/*
檔案位置：skhpsv2/assets/js/skhps-entry.js
時間戳記：2026-06-22 15:06 UTC+8
用途：skhpsv2 本體頁唯一入口；只負責辨識 skhpsv2 本體頁身分，然後交給 entry-core.js。

責任切分：
- 本檔是 skhpsv2 本體頁 adapter。
- 不動態插入 loading style。
- loading 階段樣式由唯一固定 CSS：assets/css/skhps-loading.css 管理。
- 共通 JS 載入順序、shell/main 分層、header/footer/main release 由 entry-core.js + loading-gate.js 管理。

目前套用：
- skhpsv2/index.html
- index 額外載入 assets/js/external-apps-runtime.js
*/

(function () {
  "use strict";

  var currentScript = document.currentScript;
  var SOURCE = "skhps-entry.js";

  var PAGE_SCRIPTS = {
    index: [
      "assets/js/external-apps-runtime.js"
    ],
    home: [
      "assets/js/external-apps-runtime.js"
    ],
    admin: [
      "assets/js/admin.js"
    ],
    "backend-project-launcher": []
  };

  function installMinimalLoadingClasses() {
    var html = document.documentElement;

    html.classList.add("skhps-loading");
    html.classList.add("skhps-css-loading");
    html.classList.add("skhps-shell-loading");
    html.classList.add("skhps-main-loading");
    html.setAttribute("data-skhps-entry-guard", "true");

    if (html.getAttribute("data-skhps-shell-ready") !== "true") {
      html.setAttribute("data-skhps-shell-ready", "false");
    }

    if (html.getAttribute("data-skhps-page-ready") !== "true") {
      html.setAttribute("data-skhps-page-ready", "false");
    }
  }

  function earlyRuntimeLog(status, action, detail, durationMs) {
    try {
      window.SKHPSRuntimeLog = window.SKHPSRuntimeLog || {
        __queue: [],
        log: function (payload) {
          try {
            this.__queue.push(payload);
          } catch (error) {}
          return payload;
        }
      };

      if (typeof window.SKHPSRuntimeLog.log !== "function") {
        window.SKHPSRuntimeLog.log = function (payload) {
          try {
            this.__queue = this.__queue || [];
            this.__queue.push(payload);
          } catch (error) {}
          return payload;
        };
      }

      window.SKHPSRuntimeLog.log({
        source: SOURCE,
        category: "script",
        action: action,
        status: status,
        detail: detail || "",
        durationMs: durationMs
      });
    } catch (error) {}
  }

  function stripQueryAndHash(url) {
    return String(url || "").split("#")[0].split("?")[0];
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
  }

  function withVersion(url, version) {
    version = String(version || "").trim();

    if (!version) {
      return url;
    }

    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function inferSharedBaseUrl() {
    var src = currentScript && currentScript.src ? currentScript.src : "";

    if (window.SKHPS_ENTRY_BASE_URL) {
      return normalizeBaseUrl(window.SKHPS_ENTRY_BASE_URL);
    }

    if (src) {
      return normalizeBaseUrl(
        stripQueryAndHash(src).replace(/\/assets\/js\/skhps-entry\.js$/i, "/")
      );
    }

    return normalizeBaseUrl(window.location.origin + "/");
  }

  function getVersion() {
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

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var startedAt = Date.now();
      var script = document.createElement("script");

      earlyRuntimeLog("RUN", "loadScript", src);

      script.src = src;
      script.async = false;

      script.onload = function () {
        earlyRuntimeLog("OK", "scriptLoaded", src, Date.now() - startedAt);
        resolve(src);
      };

      script.onerror = function () {
        earlyRuntimeLog("FAIL", "scriptError", src, Date.now() - startedAt);
        reject(new Error("skhps-entry script load failed: " + src));
      };

      document.head.appendChild(script);
    });
  }

  function loadEntryCore(sharedBaseUrl, version) {
    if (window.SKHPSEntryCore && typeof window.SKHPSEntryCore.load === "function") {
      return Promise.resolve(window.SKHPSEntryCore);
    }

    return loadScript(
      withVersion(
        joinUrl(sharedBaseUrl, "assets/js/entry-core.js"),
        version
      )
    ).then(function () {
      if (!window.SKHPSEntryCore || typeof window.SKHPSEntryCore.load !== "function") {
        throw new Error("SKHPSEntryCore.load not available");
      }

      return window.SKHPSEntryCore;
    });
  }

  function getRuntimeParam() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var runtime = String(params.get("skhpsRuntime") || params.get("runtime") || "").trim();

      if (runtime === "local-dev" || runtime === "dev" || runtime === "prod") {
        return runtime;
      }
    } catch (error) {}

    return "";
  }

  function inferEnvFromLocation() {
    var requestedRuntime = getRuntimeParam();
    var host = String(window.location.hostname || "").toLowerCase();

    if (requestedRuntime) {
      return requestedRuntime;
    }

    if (host === "127.0.0.1" || host === "localhost" || host === "") {
      return "local-dev";
    }

    if (
      host === "dev-skhps.jonaminz.com" ||
      host.indexOf("dev-") === 0 ||
      host.indexOf("dev-skhps") >= 0
    ) {
      return "dev";
    }

    return "prod";
  }

  function inferPageId() {
    var fromHtml = String(document.documentElement.getAttribute("data-skhps-page-id") || "").trim();
    var filename;

    if (fromHtml) {
      return fromHtml;
    }

    filename = String(window.location.pathname || "").split("/").pop() || "index.html";

    if (!filename || filename === "index.html") {
      return "index";
    }

    return filename.replace(/\.html?$/i, "");
  }

  function getPageScripts(pageId) {
    var raw = String(document.documentElement.getAttribute("data-skhps-page-scripts") || "").trim();

    if (raw) {
      return raw.split(",").map(function (item) {
        return String(item || "").trim();
      }).filter(Boolean);
    }

    if (Array.isArray(window.SKHPS_PAGE_SCRIPTS)) {
      return window.SKHPS_PAGE_SCRIPTS.slice();
    }

    return (PAGE_SCRIPTS[pageId] || []).slice();
  }

  function getFailureTask(pageId) {
    if (pageId === "index" || pageId === "home") {
      return "external-apps-runtime";
    }

    if (pageId === "admin") {
      return "admin-backend-apps";
    }

    if (pageId === "backend-project-launcher") {
      return "backend-project-launcher";
    }

    return "skhps-entry";
  }

  function releaseAllForEntryFailure(error) {
    var html = document.documentElement;

    html.classList.remove("skhps-css-loading");
    html.classList.remove("skhps-loading");
    html.classList.remove("skhps-shell-loading");
    html.classList.remove("skhps-main-loading");

    html.setAttribute("data-skhps-css-ready", "false");
    html.setAttribute("data-skhps-shell-ready", "true");
    html.setAttribute("data-skhps-shell-ready-reason", "skhps-entry-failed");
    html.setAttribute("data-skhps-page-ready", "true");
    html.setAttribute("data-skhps-page-ready-reason", "skhps-entry-failed");

    try {
      document.dispatchEvent(new CustomEvent("skhps-entry-failed", {
        detail: {
          error: error && error.message ? error.message : String(error || "")
        }
      }));
    } catch (eventError) {}
  }

  function markFailed(error) {
    console.error("[SKHPSEntry]", error);
    earlyRuntimeLog("FAIL", "skhpsEntryFailed", error && error.message ? error.message : String(error));

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("skhps-entry", error);
      return;
    }

    releaseAllForEntryFailure(error);
  }

  function init() {
    var sharedBaseUrl = inferSharedBaseUrl();
    var version = getVersion();
    var pageId = inferPageId();
    var env = inferEnvFromLocation();
    var pageScripts = getPageScripts(pageId);
    var requestedRuntime = getRuntimeParam() || "";

    installMinimalLoadingClasses();

    window.SKHPS_ENTRY_BASE_URL = sharedBaseUrl;
    window.SKHPS_CONFIG_BASE_URL = sharedBaseUrl;

    window.SKHPS_PAGE_ENV = {
      pageId: pageId,
      env: env,
      requestedRuntime: requestedRuntime,
      sharedBaseUrl: sharedBaseUrl,
      version: version,
      pageScripts: pageScripts
    };

    document.documentElement.setAttribute("data-skhps-page-id", pageId);
    document.documentElement.setAttribute("data-skhps-runtime", env);
    document.documentElement.setAttribute("data-skhps-entry-scope", "skhps-core");

    earlyRuntimeLog("RUN", "init", {
      pageId: pageId,
      env: env,
      requestedRuntime: requestedRuntime,
      sharedBaseUrl: sharedBaseUrl,
      pageScripts: pageScripts
    });

    return loadEntryCore(sharedBaseUrl, version)
      .then(function () {
        return window.SKHPSEntryCore.load({
          scope: "skhps-core",
          pageId: pageId,
          env: env,
          requestedRuntime: requestedRuntime,
          sharedBaseUrl: sharedBaseUrl,
          coreVersion: version,
          specificBaseUrl: sharedBaseUrl,
          specificVersion: version,
          specificScripts: pageScripts,
          failureTask: getFailureTask(pageId)
        });
      })
      .then(function (options) {
        window.SKHPS_CORE_ENTRY_LOADED = true;

        document.dispatchEvent(new CustomEvent("skhps-entry-ready", {
          detail: options
        }));

        return options;
      });
  }

  window.SKHPSEntry = {
    init: init,
    inferPageId: inferPageId,
    getPageScripts: getPageScripts
  };

  installMinimalLoadingClasses();
  init().catch(markFailed);
})();
