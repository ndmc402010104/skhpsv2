/*
File: skhpsv2/assets/js/external-app-loader.js
Purpose: include loader for SKHPS external child apps.

設計：
- 這支檔案是外部 App 接入 skhpsv2 共用 runtime 的 include loader。
- skhpsv2 是水庫 / 共通地基；外部 App 只透過此 loader 接入共用 runtime。
- 載入 skhpsv2 核心水庫資源後，背景 registerExternalApp，再載入外部 App 自己的 afterScripts。
- registerExternalApp 失敗只 console.warn，不阻斷外部專案 afterScripts。
- window.SKHPSBootstrap 僅保留為 legacy alias，新的使用者請改用 window.SKHPSExternalAppLoader。
*/

(function () {
  "use strict";

  var CORE_SCRIPTS = [
    {
      path: "assets/js/runtime-tracer.js",
      optional: true
    },
    "assets/js/loading-gate.js",
    "assets/js/config.js",
    "assets/js/backend-client.js",
    "assets/js/css-sheet-runtime.js",
    "assets/js/header.js",
    "assets/js/footer.js"
  ];

  function mark(name, detail) {
    if (window.SKHPSRuntime && typeof window.SKHPSRuntime.mark === "function") {
      window.SKHPSRuntime.mark(name, detail);
    }
  }

  function warn(name, detail) {
    if (window.SKHPSRuntime && typeof window.SKHPSRuntime.warn === "function") {
      window.SKHPSRuntime.warn(name, detail);
    }
  }

  function runtimeError(name, detail) {
    if (window.SKHPSRuntime && typeof window.SKHPSRuntime.error === "function") {
      window.SKHPSRuntime.error(name, detail);
    }
  }

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

  function normalizeScriptEntry(entry) {
    if (typeof entry === "string") {
      return {
        path: entry,
        optional: false
      };
    }

    return {
      path: entry && entry.path ? entry.path : "",
      optional: Boolean(entry && entry.optional)
    };
  }

  function getAppEnv() {
    var appEnv = window.SKHPS_APP_ENV || {};
    var version = appEnv.version || currentScriptVersion() || Date.now();

    mark("external-app-loader:init", {
      href: window.location.href
    });

    if (!appEnv.sharedBaseUrl) {
      throw new Error("SKHPS_APP_ENV.sharedBaseUrl missing");
    }

    var options = {
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

    mark("external-app-loader:env", options);
    return options;
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
        reject(new Error("external app loader script load failed: " + src));
      };

      document.head.appendChild(script);
    });
  }

  function loadSequential(entries, eventBaseName) {
    var chain = Promise.resolve();

    entries.forEach(function (entry) {
      chain = chain.then(function () {
        mark(eventBaseName + "-start", entry);
        return loadScript(entry.url)
          .then(function (src) {
            mark(eventBaseName + "-loaded", entry);
            return src;
          })
          .catch(function (error) {
            var detail = {
              entry: entry,
              error: error && error.message ? error.message : String(error)
            };

            if (entry.optional) {
              console.warn("[SKHPSExternalAppLoader] optional script load failed:", entry.url, error);
              warn(eventBaseName + "-error", detail);
              return null;
            }

            runtimeError(eventBaseName + "-error", detail);
            throw error;
          });
      });
    });

    return chain;
  }

  function resolveCoreUrls(options) {
    return options.coreScripts.map(function (entry) {
      var normalized = normalizeScriptEntry(entry);
      return {
        path: normalized.path,
        optional: normalized.optional,
        url: withVersion(joinUrl(options.sharedBaseUrl, normalized.path), options.version)
      };
    }).filter(function (entry) {
      return Boolean(entry.path);
    });
  }

  function resolveAfterUrls(options) {
    return options.afterScripts.map(function (path) {
      var url = "";

      if (isAbsoluteUrl(path)) {
        url = withVersion(path, options.version);
      } else {
        /*
          afterScripts 是外部專案自己的 script。
          相對路徑應該相對於外部專案頁面，而不是 skhpsv2 sharedBaseUrl。
        */
        url = withVersion(path, options.version);
      }

      return {
        path: path,
        optional: false,
        url: url
      };
    });
  }

  function markFailed(error) {
    console.error("[SKHPSExternalAppLoader]", error);
    runtimeError("external-app-loader:error", {
      error: error && error.message ? error.message : String(error)
    });

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("external-app-loader", error);
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
      console.warn("[SKHPSExternalAppLoader] registerExternalApp skipped: SKHPSBackend.call not available");
      return;
    }

    var payload = normalizeRegisterPayload(options);

    if (!payload.appId || !payload.title || !payload.href) {
      console.warn("[SKHPSExternalAppLoader] registerExternalApp skipped: missing appId/title/href", payload);
      return;
    }

    mark("external-app-loader:register-start", payload);

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
        console.info("[SKHPSExternalAppLoader] external app registered:", result);
        mark("external-app-loader:register-done", result);
        return result;
      })
      .catch(function (error) {
        window.SKHPS_EXTERNAL_APP_REGISTER_ERROR = error;
        console.warn("[SKHPSExternalAppLoader] registerExternalApp failed:", error);
        warn("external-app-loader:register-error", {
          error: error && error.message ? error.message : String(error)
        });
        return {
          ok: false,
          error: error && error.message ? error.message : String(error)
        };
      });
  }

  function load() {
    var options = getAppEnv();

    window.SKHPS_BOOTSTRAP_OPTIONS = options;
    window.SKHPS_EXTERNAL_APP_LOADER_OPTIONS = options;

    /*
      確保 config.js 從 skhpsv2 sharedBaseUrl 抓 config.json。
    */
    window.SKHPS_CONFIG_BASE_URL = options.sharedBaseUrl;

    return loadSequential(resolveCoreUrls(options), "external-app-loader:core-script")
      .then(function () {
        mark("external-app-loader:core-ready", options);
        registerExternalAppIfNeeded(options);
        return loadSequential(resolveAfterUrls(options), "external-app-loader:after-script");
      })
      .then(function () {
        window.SKHPS_BOOTSTRAP_LOADED = true;
        window.SKHPS_EXTERNAL_APP_LOADER_LOADED = true;

        mark("external-app-loader:ready", options);

        document.dispatchEvent(new CustomEvent("skhps-bootstrap-ready", {
          detail: options
        }));

        document.dispatchEvent(new CustomEvent("skhps-external-app-loader-ready", {
          detail: options
        }));

        return options;
      });
  }

  window.SKHPSExternalAppLoader = {
    getAppEnv: getAppEnv,
    load: load,
    registerExternalAppIfNeeded: registerExternalAppIfNeeded
  };

  /*
    Legacy alias for pages that still listen for the old bootstrap object name.
    New external child apps should use window.SKHPSExternalAppLoader.
  */
  window.SKHPSBootstrap = window.SKHPSExternalAppLoader;

  load().catch(markFailed);
})();
