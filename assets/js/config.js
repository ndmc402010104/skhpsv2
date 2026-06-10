/*
檔案位置：skhpsv2/assets/js/config.js
時間戳記：2026-06-10 UTC+8
用途：SKHPS config loader。
原則：
- 不在 config.js 寫死整包設定。
- config.js 只負責讀取 skhpsv2/config.json。
- 成功後設定 window.SKHPS_CONFIG。
*/

(function () {
  "use strict";

  var currentScript = document.currentScript;
  var cachedConfigPromise = null;

  function stripQueryAndHash(url) {
    return String(url || "").split("#")[0].split("?")[0];
  }

  function inferBaseUrlFromCurrentScript() {
    var src = currentScript && currentScript.src ? currentScript.src : "";

    if (!src) {
      return "";
    }

    return stripQueryAndHash(src)
      .replace(/\/assets\/js\/config\.js$/i, "/");
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
  }

  function getConfigUrl() {
    if (window.SKHPS_CONFIG_URL) {
      return window.SKHPS_CONFIG_URL;
    }

    var baseUrl = window.SKHPS_CONFIG_BASE_URL || inferBaseUrlFromCurrentScript();

    if (baseUrl) {
      return joinUrl(baseUrl, "config.json");
    }

    return "config.json";
  }

  function loadConfig(force) {
    if (!force && window.SKHPS_CONFIG) {
      return Promise.resolve(window.SKHPS_CONFIG);
    }

    if (!force && cachedConfigPromise) {
      return cachedConfigPromise;
    }

    cachedConfigPromise = fetch(getConfigUrl(), {
      cache: "no-store"
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("config.json HTTP " + res.status);
      }

      return res.json();
    }).then(function (config) {
      window.SKHPS_CONFIG = config;
      return config;
    });

    return cachedConfigPromise;
  }

  function getEnv(config) {
    config = config || window.SKHPS_CONFIG || {};

    if (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env) {
      return window.SKHPS_APP_ENV.env;
    }

    return config.env || "prod";
  }

  function getEnvValue(value, config) {
    var env = getEnv(config);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[env] || value.prod || value.dev || value["local-dev"] || "";
    }

    return value || "";
  }

  function getSiteBaseUrl(config) {
    config = config || window.SKHPS_CONFIG || {};

    return getEnvValue(
      config.site && config.site.baseUrl,
      config
    );
  }

  function joinConfigUrl(base, path) {
    if (!base) return path || "";
    if (!path) return base || "";

    var rawPath = String(path);

    if (/^https?:\/\//i.test(rawPath)) {
      return rawPath;
    }

    return String(base).replace(/\/+$/, "") + "/" + rawPath.replace(/^\/+/, "");
  }

  window.SKHPSConfig = window.SKHPSConfig || {};
  window.SKHPSConfig.loadConfig = loadConfig;
  window.SKHPSConfig.reloadConfig = function () {
    cachedConfigPromise = null;
    return loadConfig(true);
  };
  window.SKHPSConfig.getConfigUrl = getConfigUrl;
  window.SKHPSConfig.getEnv = getEnv;
  window.SKHPSConfig.getEnvValue = getEnvValue;
  window.SKHPSConfig.getSiteBaseUrl = getSiteBaseUrl;
  window.SKHPSConfig.joinUrl = joinConfigUrl;
})();
