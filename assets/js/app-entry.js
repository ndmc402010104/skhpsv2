/*
檔案位置：skhpsv2/assets/js/app-entry.js
時間戳記：2026-06-11 UTC+8
用途：外部專案接入 skhpsv2 水庫的共用入口。

設計：
- 不再依賴 app-registry.js。
- 外部專案自己宣告 window.SKHPS_APP_ID 與 window.SKHPS_APP_CONFIG。
- app-entry 只負責建立 window.SKHPS_APP_ENV，然後載入 skhpsv2/assets/js/bootstrap.js。
- URL 參數 skhpsRuntime=local-dev|dev|prod 可指定使用哪個 skhpsv2 runtime。
*/

(function () {
  "use strict";

  var currentScript = document.currentScript;

  var ALLOWED_ENVS = {
    "local-dev": true,
    dev: true,
    prod: true
  };

  function stripQueryAndHash(url) {
    return String(url || "").split("#")[0].split("?")[0];
  }

  function inferSharedBaseUrl() {
    var src = currentScript && currentScript.src ? currentScript.src : "";

    if (!src) {
      return "";
    }

    return stripQueryAndHash(src)
      .replace(/\/assets\/js\/app-entry\.js$/i, "/");
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
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

  function withVersion(url, version) {
    if (!version) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function getRuntimeParam() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var runtime = String(params.get("skhpsRuntime") || "").trim();

      if (ALLOWED_ENVS[runtime]) {
        return runtime;
      }
    } catch (error) {}

    return "";
  }

  function inferEnvFromPageLocation() {
    var requestedRuntime = getRuntimeParam();

    if (requestedRuntime) {
      return requestedRuntime;
    }

    var host = String(window.location.hostname || "").toLowerCase();

    if (host === "127.0.0.1" || host === "localhost" || host === "") {
      return "local-dev";
    }

    if (
      host.indexOf("dev-") === 0 ||
      host.indexOf("dev.") === 0 ||
      host.indexOf("dev-skhps") >= 0
    ) {
      return "dev";
    }

    return "prod";
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
        reject(new Error("app-entry script load failed: " + src));
      };

      document.head.appendChild(script);
    });
  }

  function markFailed(error) {
    console.error("[SKHPSAppEntry]", error);

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("app-entry", error);
      return;
    }

    document.documentElement.classList.remove("skhps-css-loading");
    document.documentElement.classList.remove("skhps-loading");
  }

  function getAppId() {
    var fromWindow = window.SKHPS_APP_ID;
    var fromScript = currentScript && currentScript.getAttribute("data-skhps-app");
    var fromConfig = window.SKHPS_APP_CONFIG && (
      window.SKHPS_APP_CONFIG.appId ||
      window.SKHPS_APP_CONFIG.id
    );

    return String(fromWindow || fromScript || fromConfig || "").trim();
  }

  function normalizeAppConfig(appId) {
    var config = window.SKHPS_APP_CONFIG || {};

    if (!config || typeof config !== "object") {
      config = {};
    }

    if (!config.appId) {
      config.appId = appId;
    }

    if (!config.id) {
      config.id = appId;
    }

    if (!config.href) {
      config.href = window.location.href;
    }

    if (!config.title && document.title) {
      config.title = document.title;
    }

    if (!config.appType) {
      config.appType = "前台";
    }

    if (!config.group) {
      config.group = "";
    }

    if (!config.order) {
      config.order = 9999;
    }

    if (!Array.isArray(config.afterScripts)) {
      config.afterScripts = [];
    }

    window.SKHPS_APP_CONFIG = config;
    return config;
  }

  function init() {
    var appId = getAppId();
    var version = getVersion();
    var env = inferEnvFromPageLocation();

    if (!appId) {
      throw new Error("SKHPS_APP_ID missing");
    }

    var appConfig = normalizeAppConfig(appId);
    var sharedBaseUrl = normalizeBaseUrl(window.SKHPS_ENTRY_BASE_URL || inferSharedBaseUrl());

    if (!sharedBaseUrl || sharedBaseUrl === "/") {
      throw new Error("shared base url missing");
    }

    window.SKHPS_APP_ID = appId;

    window.SKHPS_APP_ENV = {
      appId: appId,
      env: env,
      requestedRuntime: getRuntimeParam() || "",
      sharedBaseUrl: sharedBaseUrl,
      version: version || appConfig.version || "",
      title: appConfig.title || appId,
      href: appConfig.href || window.location.href,
      appType: appConfig.appType || "前台",
      group: appConfig.group || "",
      order: appConfig.order || 9999,
      coreScripts: appConfig.coreScripts || null,
      afterScripts: appConfig.afterScripts || []
    };

    /*
      讓 config.js 在外部專案頁面中也能穩定抓 skhpsv2/config.json，
      不要誤抓外部專案自己的 config.json。
    */
    window.SKHPS_CONFIG_BASE_URL = window.SKHPS_APP_ENV.sharedBaseUrl;

    document.documentElement.setAttribute("data-skhps-app-id", appId);
    document.documentElement.setAttribute("data-skhps-runtime", env);

    window.SKHPS_APP_ENTRY_LOADED = true;

    return loadScript(
      withVersion(
        joinUrl(window.SKHPS_APP_ENV.sharedBaseUrl, "assets/js/bootstrap.js"),
        window.SKHPS_APP_ENV.version
      )
    );
  }

  window.SKHPSAppEntry = {
    init: init,
    getRuntimeParam: getRuntimeParam,
    inferEnvFromPageLocation: inferEnvFromPageLocation
  };

  init().catch(markFailed);
})();