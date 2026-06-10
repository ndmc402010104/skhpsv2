/*
File: skhpsv2/assets/js/bootstrap.js
Purpose: shared bootstrap for SKHPS child apps.
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
      appId: appEnv.appId || "unknown",
      env: appEnv.env || "prod",
      sharedBaseUrl: normalizeBaseUrl(appEnv.sharedBaseUrl),
      version: version,
      coreScripts: appEnv.coreScripts || CORE_SCRIPTS.slice(),
      afterScripts: appEnv.afterScripts || []
    };
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = function () { resolve(src); };
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

  function load() {
    var options = getAppEnv();
    window.SKHPS_BOOTSTRAP_OPTIONS = options;

    return loadSequential(resolveCoreUrls(options))
      .then(function () {
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
    load: load
  };

  load().catch(markFailed);
})();
