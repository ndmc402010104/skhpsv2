/*
File: skhpsv2/assets/js/bootstrap.js
Purpose: shared bootstrap for SKHPS external child apps.

設計：
- 載入 skhpsv2 核心水庫資源。
- 載完 backend-client 後，若外部專案有 SKHPS_APP_CONFIG，背景呼叫 registerExternalApp。
- registerExternalApp 失敗只 console.warn，不阻斷外部專案 afterScripts。
*/

(function () {
  "use strict";

  var CORE_SCRIPTS = [
    "assets/js/config.js",
    "assets/js/loading-gate.js",
    "assets/js/backend-client.js",
    "assets/js/css-sheet-runtime.js",
    "assets/js/footer.js"
  ];

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
  }

  function withVersion(url, version) {
    if (!version) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(String(url || ""));
  }

  function currentScriptVersion() {
    var script = document.currentScript;
    if (!script || !script.src || script.src.indexOf("?") < 0) return "";

    try {
      return new URL(script.src).searchParams.get("v") || "";
    } catch (error) {
      return "";
    }
  }

  function getAppEnv() {
    var appEnv = window.SKHPS_APP_ENV || {};
    var version = appEnv.version || currentScriptVersion() || Date.now();

    if (!appEnv.sharedBaseUrl) {
      throw new Error("SKHPS_APP_ENV.sharedBaseUrl missing");
    }

    return {
      appId: appEnv.appId || window.SKHPS_APP_ID || "unknown",
      env: appEnv.env || "prod",
      requestedRuntime: appEnv.requestedRuntime || "",
      sharedBaseUrl: normalizeBaseUrl(appEnv.sharedBaseUrl),
      version: version,
      title: appEnv.title || "",
      href: appEnv.href || window.location.href,
      appType: appEnv.appType || "前台",
      group: appEnv.group || "",
      order: appEnv.order || 9999,
      coreScripts: appEnv.coreScripts || CORE_SCRIPTS.slice(),
      afterScripts: appEnv.afterScripts || []
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = false;

      script.onload = function () {
        resolve(src);
      };

      script.onerror = function () {
        reject(new Error("bootstrap script load failed: " + src));
      };

      document.head.appendChild(script);
    });
  }

  function loadSequential(urls) {
    var chain = Promise.resolve();

    urls.forEach(function (url) {
      chain = chain.then(function () {
        return loadScript(url);
      });
    });

    return chain;
  }

  function resolveCoreUrls(options) {
    return options.coreScripts.map(function (path) {
      return withVersion(joinUrl(options.sharedBaseUrl, path), options.version);
    });
  }

  function resolveAfterUrls(options) {
    return options.afterScripts.map(function (path) {
      if (isAbsoluteUrl(path)) {
        return withVersion(path, options.version);
      }

      /*
        afterScripts 是外部專案自己的 script。
        相對路徑應該相對於外部專案頁面，而不是 skhpsv2 sharedBaseUrl。
      */
      return withVersion(path, options.version);
    });
  }

  function markFailed(error) {
    console.error("[SKHPSBootstrap]", error);

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("bootstrap", error);
      return;
    }

    document.documentElement.classList.remove("skhps-css-loading");
    document.documentElement.classList.remove("skhps-loading");
  }

  function normalizeRegisterPayload(options) {
    var config = window.SKHPS_APP_CONFIG || {};

    var appId = String(
      config.appId ||
      config.id ||
      options.appId ||
      window.SKHPS_APP_ID ||
      ""
    ).trim();

    var title = String(
      config.title ||
      config.name ||
      options.title ||
      document.title ||
      appId ||
      ""
    ).trim();

    var href = String(
      config.href ||
      config.url ||
      options.href ||
      window.location.href ||
      ""
    ).trim();

    var appType = String(
      config.appType ||
      config.displayLocation ||
      options.appType ||
      "前台"
    ).trim();

    var group = String(
      config.group ||
      options.group ||
      ""
    ).trim();

    var order = Number(
      config.order ||
      options.order ||
      9999
    ) || 9999;

    var version = String(
      config.version ||
      options.version ||
      ""
    ).trim();

    return {
      appId: appId,
      title: title,
      href: href,
      appType: appType,
      group: group,
      order: order,
      version: version,
      env: options.env || "",
      requestedRuntime: options.requestedRuntime || "",
      origin: window.location.origin || "",
      pageUrl: window.location.href || "",
      userAgent: navigator.userAgent || ""
    };
  }

  function registerExternalAppIfNeeded(options) {
    var config = window.SKHPS_APP_CONFIG || {};
    var shouldRegister = config.registerExternalApp;

    /*
      預設：有 SKHPS_APP_CONFIG 且不是明確 false，就報到。
      若某些外部頁不想報到，可設：
      window.SKHPS_APP_CONFIG.registerExternalApp = false;
    */
    if (!config || typeof config !== "object") {
      return;
    }

    if (shouldRegister === false) {
      return;
    }

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      console.warn("[SKHPSBootstrap] registerExternalApp skipped: SKHPSBackend.call not available");
      return;
    }

    var payload = normalizeRegisterPayload(options);

    if (!payload.appId || !payload.title || !payload.href) {
      console.warn("[SKHPSBootstrap] registerExternalApp skipped: missing appId/title/href", payload);
      return;
    }

    /*
      重要：
      這是背景報到，不 await。
      報到失敗不能卡住 quick-login 或其他外部專案自己的功能。
    */
    window.SKHPS_EXTERNAL_APP_REGISTER_PROMISE = window.SKHPSBackend
      .call("registerExternalApp", payload, {
        timeoutMs: 8000
      })
      .then(function (result) {
        window.SKHPS_EXTERNAL_APP_REGISTER_RESULT = result;
        console.info("[SKHPSBootstrap] external app registered:", result);
        return result;
      })
      .catch(function (error) {
        window.SKHPS_EXTERNAL_APP_REGISTER_ERROR = error;
        console.warn("[SKHPSBootstrap] registerExternalApp failed:", error);
        return {
          ok: false,
          error: error && error.message ? error.message : String(error)
        };
      });
  }

  function load() {
    var options = getAppEnv();

    window.SKHPS_BOOTSTRAP_OPTIONS = options;

    /*
      確保 config.js 從 skhpsv2 sharedBaseUrl 抓 config.json。
    */
    window.SKHPS_CONFIG_BASE_URL = options.sharedBaseUrl;

    return loadSequential(resolveCoreUrls(options))
      .then(function () {
        registerExternalAppIfNeeded(options);
        return loadSequential(resolveAfterUrls(options));
      })
      .then(function () {
        window.SKHPS_BOOTSTRAP_LOADED = true;

        document.dispatchEvent(new CustomEvent("skhps-bootstrap-ready", {
          detail: options
        }));

        return options;
      });
  }

  window.SKHPSBootstrap = {
    getAppEnv: getAppEnv,
    load: load,
    registerExternalAppIfNeeded: registerExternalAppIfNeeded
  };

  load().catch(markFailed);
})();