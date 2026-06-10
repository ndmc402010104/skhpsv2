/*
檔案位置：skhpsv2/assets/js/app-entry.js
時間戳記：2026-06-11 UTC+8
用途：外部專案接入 skhpsv2 水庫的共用入口。

設計：
- 不依賴 app-registry.js。
- 支援 window.SKHPS_APP_CARD_URL，例如 app-card.json。
- app-card.json 可用 versionUrl 指向 version.json。
- version.json.version 會回填到 SKHPS_APP_CONFIG.version。
- index.html 仍可用 window.SKHPS_APP_CONFIG 做臨時覆蓋。
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

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(String(url || ""));
  }

  function resolveRelativeUrl(baseUrl, path) {
    if (!path) return "";
    if (isAbsoluteUrl(path)) return path;

    try {
      return new URL(path, baseUrl || window.location.href).toString();
    } catch (error) {
      return path;
    }
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

  function fetchJson(url) {
    return fetch(url, {
      cache: "no-store"
    }).then(function (response) {
      if (!response.ok) {
        throw new Error("fetch json failed: " + url + " (" + response.status + ")");
      }

      return response.json();
    });
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

  function mergeObjects(base, override) {
    var output = {};

    Object.keys(base || {}).forEach(function (key) {
      output[key] = base[key];
    });

    Object.keys(override || {}).forEach(function (key) {
      output[key] = override[key];
    });

    return output;
  }

  function pickEnvValue(value, env) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[env] || value.prod || value.dev || value["local-dev"] || "";
    }

    return value;
  }

  function getAppCardUrl() {
    var url = window.SKHPS_APP_CARD_URL || "";

    if (!url) {
      return "";
    }

    return resolveRelativeUrl(window.location.href, url);
  }

  function loadAppCard() {
    var cardUrl = getAppCardUrl();

    if (!cardUrl) {
      return Promise.resolve({});
    }

    return fetchJson(cardUrl).then(function (card) {
      window.SKHPS_APP_CARD = card || {};
      window.SKHPS_APP_CARD_URL_RESOLVED = cardUrl;
      return card || {};
    });
  }

  function loadVersionForCard(card) {
    var versionUrl = card && card.versionUrl ? String(card.versionUrl || "").trim() : "";

    if (!versionUrl) {
      return Promise.resolve(null);
    }

    var baseUrl = window.SKHPS_APP_CARD_URL_RESOLVED || window.location.href;
    var resolvedVersionUrl = resolveRelativeUrl(baseUrl, versionUrl);

    return fetchJson(resolvedVersionUrl)
      .then(function (versionInfo) {
        window.SKHPS_APP_VERSION_INFO = versionInfo || {};
        window.SKHPS_APP_VERSION_URL_RESOLVED = resolvedVersionUrl;
        return versionInfo || {};
      })
      .catch(function (error) {
        console.warn("[SKHPSAppEntry] version.json load failed:", error);
        return null;
      });
  }

  function buildAppConfig(card, versionInfo, env) {
    var inlineConfig = window.SKHPS_APP_CONFIG || {};
    var config = mergeObjects(card || {}, inlineConfig || {});

    var versionFromJson = "";
    if (versionInfo && versionInfo.version) {
      versionFromJson = String(versionInfo.version || "").trim();
    }

    if (versionFromJson) {
      config.version = versionFromJson;
    } else if (!config.version) {
      config.version = getVersion();
    }

    if (config.href && typeof config.href === "object" && !Array.isArray(config.href)) {
      config.hrefMap = config.href;
      config.href = pickEnvValue(config.href, env);
    }

    if (!config.href) {
      config.href = window.location.href;
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

    return config;
  }

  function getAppId(config) {
    var fromConfig = config && (config.appId || config.id);
    var fromWindow = window.SKHPS_APP_ID;
    var fromScript = currentScript && currentScript.getAttribute("data-skhps-app");

    return String(fromConfig || fromWindow || fromScript || "").trim();
  }

  function init() {
    var env = inferEnvFromPageLocation();
    var sharedBaseUrl = normalizeBaseUrl(window.SKHPS_ENTRY_BASE_URL || inferSharedBaseUrl());

    if (!sharedBaseUrl || sharedBaseUrl === "/") {
      throw new Error("shared base url missing");
    }

    return loadAppCard()
      .then(function (card) {
        return loadVersionForCard(card).then(function (versionInfo) {
          return {
            card: card,
            versionInfo: versionInfo
          };
        });
      })
      .then(function (loaded) {
        var appConfig = buildAppConfig(loaded.card, loaded.versionInfo, env);
        var appId = getAppId(appConfig);

        if (!appId) {
          throw new Error("SKHPS appId missing");
        }

        if (!appConfig.appId) {
          appConfig.appId = appId;
        }

        if (!appConfig.id) {
          appConfig.id = appId;
        }

        if (!appConfig.title && document.title) {
          appConfig.title = document.title;
        }

        window.SKHPS_APP_ID = appId;
        window.SKHPS_APP_CONFIG = appConfig;

        window.SKHPS_APP_ENV = {
          appId: appId,
          env: env,
          requestedRuntime: getRuntimeParam() || "",
          sharedBaseUrl: sharedBaseUrl,
          version: appConfig.version || getVersion() || "",
          title: appConfig.title || appId,
          href: appConfig.href || window.location.href,
          appType: appConfig.appType || "前台",
          group: appConfig.group || "",
          order: appConfig.order || 9999,
          coreScripts: appConfig.coreScripts || null,
          afterScripts: appConfig.afterScripts || []
        };

        /*
          讓 config.js 在外部專案頁面中穩定抓 skhpsv2/config.json，
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
      });
  }

  window.SKHPSAppEntry = {
    init: init,
    getRuntimeParam: getRuntimeParam,
    inferEnvFromPageLocation: inferEnvFromPageLocation
  };

  init().catch(markFailed);
})();