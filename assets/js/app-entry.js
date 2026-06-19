/*
檔案位置：skhpsv2/assets/js/app-entry.js
時間戳記：2026-06-16 UTC+8
用途：外部專案接入 skhpsv2 水庫的共用入口；正式標準只讀 app.json manifest。

水庫標準：
- 新外部專案 manifest 一律使用 app.json。
- 本檔只讀 window.SKHPS_APP_MANIFEST_URL；未指定時預設 app.json。
- 不再讀 app-card.json / SKHPS_APP_CARD_URL。
- 不再建立 window.SKHPS_APP_CARD / window.SKHPS_APP_CONFIG。
- 外部專案資訊統一掛在 window.SKHPS_APP_MANIFEST。
- 外部專案腳本只讀 manifest.entry.afterScripts。
- 外部專案 loading task 只讀 manifest.entry.loadingTasks。
- version.js 建議宣告 window.SKHPS_APP_VERSION，並由 manifest.version.globalName 指定。
- registerExternalApp 是背景報到，不擋畫面。
*/

(function () {
  "use strict";

  var currentScript = document.currentScript;
  var SOURCE = "app-entry.js";

  var ALLOWED_ENVS = {
    "local-dev": true,
    dev: true,
    prod: true
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
        category: "external-app",
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

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(String(url || ""));
  }

  function resolveRelativeUrl(baseUrl, path) {
    if (!path) {
      return "";
    }

    if (isAbsoluteUrl(path)) {
      return path;
    }

    try {
      return new URL(path, baseUrl || window.location.href).toString();
    } catch (error) {
      return path;
    }
  }

  function inferSharedBaseUrl() {
    var src = currentScript && currentScript.src ? currentScript.src : "";

    if (window.SKHPS_ENTRY_BASE_URL) {
      return normalizeBaseUrl(window.SKHPS_ENTRY_BASE_URL);
    }

    if (!src) {
      return "";
    }

    return normalizeBaseUrl(
      stripQueryAndHash(src).replace(/\/assets\/js\/app-entry\.js$/i, "/")
    );
  }

  function inferAppBaseUrl() {
    try {
      return new URL("./", window.location.href).toString();
    } catch (error) {
      return window.location.href;
    }
  }

  function getEntryVersion() {
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
    version = String(version || "").trim();

    if (!version) {
      return url;
    }

    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function getRuntimeParam() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      var runtime = String(params.get("skhpsRuntime") || params.get("runtime") || "").trim();

      if (ALLOWED_ENVS[runtime]) {
        return runtime;
      }
    } catch (error) {}

    return "";
  }

  function inferEnvFromPageLocation() {
    var requestedRuntime = getRuntimeParam();
    var host = String(window.location.hostname || "").toLowerCase();

    if (requestedRuntime) {
      return requestedRuntime;
    }

    if (host === "127.0.0.1" || host === "localhost" || host === "") {
      return "local-dev";
    }

    if (
      host.indexOf("dev-") === 0 ||
      host.indexOf("dev.") === 0 ||
      host.indexOf("dev-skhps") >= 0 ||
      host === "dev-skhps.jonaminz.com"
    ) {
      return "dev";
    }

    return "prod";
  }

  function withRuntimeParam(url, env) {
    if (!url || !env) {
      return url || "";
    }

    try {
      var output = new URL(url, window.location.href);
      output.searchParams.set("skhpsRuntime", env);
      return output.toString();
    } catch (error) {
      return String(url) +
        (String(url).indexOf("?") >= 0 ? "&" : "?") +
        "skhpsRuntime=" +
        encodeURIComponent(env);
    }
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
        reject(new Error("app-entry script load failed: " + src));
      };

      document.head.appendChild(script);
    });
  }

  function loadEntryCore(sharedBaseUrl, coreVersion) {
    if (window.SKHPSEntryCore && typeof window.SKHPSEntryCore.load === "function") {
      return Promise.resolve(window.SKHPSEntryCore);
    }

    return loadScript(
      withVersion(
        joinUrl(sharedBaseUrl, "assets/js/entry-core.js"),
        coreVersion
      )
    ).then(function () {
      if (!window.SKHPSEntryCore || typeof window.SKHPSEntryCore.load !== "function") {
        throw new Error("SKHPSEntryCore.load not available");
      }

      return window.SKHPSEntryCore;
    });
  }

  function releaseAllForEntryFailure(error) {
    var html = document.documentElement;

    html.classList.remove("skhps-css-loading");
    html.classList.remove("skhps-loading");
    html.classList.remove("skhps-shell-loading");
    html.classList.remove("skhps-main-loading");

    html.setAttribute("data-skhps-css-ready", "false");
    html.setAttribute("data-skhps-shell-ready", "true");
    html.setAttribute("data-skhps-shell-ready-reason", "app-entry-failed");
    html.setAttribute("data-skhps-page-ready", "true");
    html.setAttribute("data-skhps-page-ready-reason", "app-entry-failed");

    try {
      document.dispatchEvent(new CustomEvent("skhps-app-entry-failed", {
        detail: {
          error: error && error.message ? error.message : String(error || "")
        }
      }));
    } catch (eventError) {}
  }

  function markFailed(error) {
    console.error("[SKHPSAppEntry]", error);
    earlyRuntimeLog("FAIL", "appEntryFailed", error && error.message ? error.message : String(error));

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail("app-entry", error);
      return;
    }

    releaseAllForEntryFailure(error);
  }

  function pickEnvValue(value, env) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[env] || value.prod || value.dev || value["local-dev"] || "";
    }

    return value;
  }

  function getCurrentPageId() {
    var html = document.documentElement;
    var body = document.body;

    return String(
      html.getAttribute("data-skhps-page-id") ||
      html.getAttribute("data-page-id") ||
      body && body.getAttribute("data-skhps-page-id") ||
      body && body.getAttribute("data-page-id") ||
      ""
    ).trim();
  }

  function mergeObject(base, override) {
    return Object.assign({}, base || {}, override || {});
  }

  function normalizeHrefForEnv(value, env, fallback) {
    var href = pickEnvValue(value, env) || fallback || window.location.href;
    return withRuntimeParam(href, env);
  }

  function getVersionGlobalName(manifest) {
    var versionConfig = manifest && manifest.version && typeof manifest.version === "object"
      ? manifest.version
      : {};
    return String(versionConfig.globalName || "SKHPS_APP_VERSION").trim() || "SKHPS_APP_VERSION";
  }

  function getVersionTextFromObject(info) {
    if (!info || typeof info !== "object") {
      return "";
    }

    return String(
      info.version ||
      info.appVersion ||
      info.buildVersion ||
      info.buildTime ||
      ""
    ).trim();
  }

  function getLoadedAppVersion(manifest, versionInfo) {
    var globalName = getVersionGlobalName(manifest);
    var candidates = [
      versionInfo,
      window.SKHPS_APP_VERSION_INFO,
      window[globalName],
      window.SKHPS_APP_VERSION
    ];
    var i;
    var version;

    for (i = 0; i < candidates.length; i += 1) {
      version = getVersionTextFromObject(candidates[i]);
      if (version) {
        return version;
      }
    }

    return "";
  }

  function resolveEffectiveManifest(rootManifest, env) {
    var pageId = getCurrentPageId();
    var pages = rootManifest && rootManifest.pages && typeof rootManifest.pages === "object" && !Array.isArray(rootManifest.pages)
      ? rootManifest.pages
      : {};
    var page = pageId && pages[pageId] && typeof pages[pageId] === "object" && !Array.isArray(pages[pageId])
      ? pages[pageId]
      : null;
    var entry;
    var effective;

    window.SKHPS_APP_ROOT_MANIFEST = rootManifest;

    if (!page) {
      window.SKHPS_APP_EFFECTIVE_MANIFEST = rootManifest;
      return rootManifest;
    }

    entry = page.entry || rootManifest.entry || {};

    var rootAppId = String(rootManifest.appId || "").trim();
    var currentAppId = String(page.appId || page.projectId || page.pageId || pageId || rootAppId).trim();

    effective = Object.assign({}, rootManifest, page, {
      appId: currentAppId,
      projectId: currentAppId,
      rootAppId: rootAppId,
      pageId: page.pageId || pageId || currentAppId,
      title: page.title || rootManifest.title || "",
      description: page.description || rootManifest.description || "",
      group: page.group || rootManifest.group || "",
      href: normalizeHrefForEnv(page.href, env, rootManifest.href || window.location.href),
      version: rootManifest.version || {},
      entry: {
        afterScripts: normalizeScriptList(entry.afterScripts || [], "afterScripts"),
        loadingTasks: normalizeTaskList(entry.loadingTasks || [])
      },
      features: mergeObject(rootManifest.features, page.features),
      backend: mergeObject(rootManifest.backend, page.backend),
      pages: rootManifest.pages
    });

    if (page.registerExternalApp !== undefined) {
      effective.registerExternalApp = page.registerExternalApp;
    } else {
      effective.registerExternalApp = rootManifest.registerExternalApp;
    }

    if (page.configUrl === undefined && rootManifest.configUrl !== undefined) {
      effective.configUrl = rootManifest.configUrl;
    }

    if (page.signPageUrl === undefined && rootManifest.signPageUrl !== undefined) {
      effective.signPageUrl = rootManifest.signPageUrl;
    }

    window.SKHPS_APP_EFFECTIVE_MANIFEST = effective;

    earlyRuntimeLog("OK", "resolveEffectiveManifest", {
      appId: rootManifest.appId || "",
      pageId: pageId,
      title: effective.title || "",
      afterScripts: effective.entry.afterScripts || [],
      loadingTasks: effective.entry.loadingTasks || []
    });

    return effective;
  }

  function getAppManifestUrl() {
    var url = String(window.SKHPS_APP_MANIFEST_URL || "app.json").trim();
    return resolveRelativeUrl(window.location.href, url);
  }

  function loadAppManifest() {
    var manifestUrl = getAppManifestUrl();

    if (!manifestUrl) {
      throw new Error("SKHPS app manifest url missing");
    }

    earlyRuntimeLog("RUN", "loadAppManifest", manifestUrl);

    return fetchJson(manifestUrl).then(function (manifest) {
      window.SKHPS_APP_MANIFEST = manifest || {};
      window.SKHPS_APP_MANIFEST_URL_RESOLVED = manifestUrl;
      earlyRuntimeLog("OK", "loadAppManifest", manifestUrl);
      return manifest || {};
    });
  }

  function normalizeScriptList(list, fieldName) {
    if (!Array.isArray(list)) {
      throw new Error("app.json entry." + fieldName + " must be an array");
    }

    return list.slice().filter(function (item) {
      if (typeof item === "string") {
        return String(item || "").trim();
      }

      return item && typeof item === "object" && String(item.path || "").trim();
    });
  }

  function normalizeTaskList(list) {
    if (!Array.isArray(list)) {
      throw new Error("app.json entry.loadingTasks must be an array");
    }

    return list.map(function (item) {
      return String(item || "").trim();
    }).filter(Boolean);
  }

  function normalizeManifest(rawManifest, env) {
    var manifest = rawManifest || {};
    var entry = manifest.entry || {};

    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      throw new Error("app.json manifest must be an object");
    }

    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("app.json entry must be an object");
    }

    manifest.entry = entry;
    manifest.entry.afterScripts = normalizeScriptList(entry.afterScripts || [], "afterScripts");
    manifest.entry.loadingTasks = normalizeTaskList(entry.loadingTasks || []);

    if (manifest.href && typeof manifest.href === "object" && !Array.isArray(manifest.href)) {
      manifest.hrefMap = manifest.href;
      manifest.href = pickEnvValue(manifest.href, env);
    }

    if (!manifest.href) {
      manifest.href = window.location.href;
    }

    manifest.href = withRuntimeParam(manifest.href, env);

    if (!manifest.group) {
      manifest.group = "";
    }

    return manifest;
  }

  function loadVersionForManifest(manifest) {
    var versionConfig = manifest && manifest.version ? manifest.version : null;
    var versionUrl = "";
    var globalName = "SKHPS_APP_VERSION";

    if (!versionConfig || typeof versionConfig !== "object" || Array.isArray(versionConfig)) {
      return Promise.resolve(null);
    }

    versionUrl = String(versionConfig.source || "").trim();
    globalName = String(versionConfig.globalName || globalName).trim() || globalName;

    if (!versionUrl) {
      return Promise.resolve(null);
    }

    var baseUrl = window.SKHPS_APP_MANIFEST_URL_RESOLVED || window.location.href;
    var resolvedVersionUrl = resolveRelativeUrl(baseUrl, versionUrl);

    return loadScript(resolvedVersionUrl)
      .then(function () {
        var versionInfo = window[globalName] || {};
        window.SKHPS_APP_VERSION_INFO = versionInfo || {};
        window.SKHPS_APP_VERSION_URL_RESOLVED = resolvedVersionUrl;
        return versionInfo || {};
      })
      .catch(function (error) {
        console.warn("[SKHPSAppEntry] version.js load failed:", error);
        earlyRuntimeLog("WARN", "versionLoadFailed", error && error.message ? error.message : String(error));
        return null;
      });
  }

  function applyManifestLoadingTasks(manifest) {
    var html = document.documentElement;
    var existing = String(html.getAttribute("data-skhps-loading-tasks") || "")
      .split(",")
      .map(function (item) { return String(item || "").trim(); })
      .filter(Boolean);
    var tasks = (manifest.entry && manifest.entry.loadingTasks) || [];
    var seen = {};
    var merged = [];

    existing.concat(tasks).forEach(function (task) {
      if (!task || seen[task]) {
        return;
      }
      seen[task] = true;
      merged.push(task);
    });

    if (merged.length) {
      html.setAttribute("data-skhps-loading-tasks", merged.join(","));
    }
  }

  function getAppId(manifest) {
    var fromManifest = manifest && manifest.appId;
    var fromWindow = window.SKHPS_APP_ID;
    var fromScript = currentScript && currentScript.getAttribute("data-skhps-app");
    var fromHtml = document.documentElement.getAttribute("data-skhps-app-id");

    return String(fromManifest || fromWindow || fromScript || fromHtml || "").trim();
  }

  function buildAppVersion(manifest, versionInfo) {
    var loadedVersion = getLoadedAppVersion(manifest, versionInfo);

    if (loadedVersion) {
      return loadedVersion;
    }

    if (manifest && manifest.version && typeof manifest.version === "object" && manifest.version.value) {
      return String(manifest.version.value || "").trim();
    }

    /*
      SKHPS_ENTRY_VERSION 是水庫資源 cache buster，不是外部 App 業務版本。
      沒讀到 version.js 時讓 register payload 自己顯示 unknown，
      不要把 coreVersion / Date.now() 當成 App 版本。
    */
    return "";
  }


  function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function firstRegistryText() {
    var values = Array.prototype.slice.call(arguments);
    var i;
    var value;

    for (i = 0; i < values.length; i += 1) {
      value = values[i];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }

    return "";
  }

  function registryBoolean(value, fallback) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 1) return true;
    if (value === 0) return false;

    var text = String(value === undefined || value === null ? "" : value).trim().toLowerCase();

    if (text === "true" || text === "1" || text === "yes" || text === "y" || text === "on" || text === "是" || text === "顯示") return true;
    if (text === "false" || text === "0" || text === "no" || text === "n" || text === "off" || text === "否" || text === "不顯示") return false;

    return Boolean(fallback);
  }

  function normalizeRegistryOptions(rootManifest, effectiveManifest) {
    var rootRegistry = isObject(rootManifest && rootManifest.registry) ? rootManifest.registry : {};
    var pageRegistry = isObject(effectiveManifest && effectiveManifest.registry) ? effectiveManifest.registry : {};
    var registry = Object.assign({}, rootRegistry, pageRegistry);
    var registerExternalApp = effectiveManifest && effectiveManifest.registerExternalApp;
    var showInLauncher = registry.showInLauncher;

    if (showInLauncher === undefined || showInLauncher === null || String(showInLauncher).trim() === "") {
      showInLauncher = registerExternalApp === false ? false : true;
    } else {
      showInLauncher = registryBoolean(showInLauncher, true);
    }

    return {
      showInLauncher: showInLauncher,
      role: firstRegistryText(registry.role, registry.registryRole),
      reason: firstRegistryText(registry.reason, registry.registryReason, registry.hiddenReason),
      defaultPosition: firstRegistryText(registry.defaultPosition, registry.defaultDisplayPosition, registry.displayPosition, registry.position)
    };
  }


  function normalizeRegisterPayload(options) {
    var effectiveManifest = options.manifest || window.SKHPS_APP_EFFECTIVE_MANIFEST || window.SKHPS_APP_MANIFEST || {};
    var rootManifest = options.rootManifest || window.SKHPS_APP_ROOT_MANIFEST || window.SKHPS_APP_MANIFEST || effectiveManifest || {};
    var appId = String(rootManifest.appId || effectiveManifest.rootAppId || effectiveManifest.appId || options.appId || window.SKHPS_APP_ID || "").trim();
    var title = String(rootManifest.title || rootManifest.name || appId || "").trim();
    var href = String(rootManifest.href || options.href || window.location.href || "").trim();
    var group = String(rootManifest.group || options.group || "").trim();
    var pageId = String(effectiveManifest.pageId || options.pageId || getCurrentPageId() || "").trim();
    var pageTitle = String(effectiveManifest.title || options.title || document.title || "").trim();
    var pageHref = String(effectiveManifest.href || window.location.href || "").trim();
    var version = String(getLoadedAppVersion(rootManifest) || options.appVersion || "").trim();
    var registry = normalizeRegistryOptions(rootManifest, effectiveManifest);

    return {
      appId: appId,
      title: title,
      href: href,
      group: group,
      displayPosition: "",
      "顯示位置": "",
      order: 9999,
      version: version,
      env: options.env || "",
      requestedRuntime: options.requestedRuntime || "",
      rootAppId: appId,
      pageId: pageId,
      pageTitle: pageTitle,
      pageHref: pageHref,
      registry: registry,
      showInLauncher: registry.showInLauncher,
      registryRole: registry.role,
      registryReason: registry.reason,
      defaultPosition: registry.defaultPosition,
      origin: window.location.origin || "",
      pageUrl: window.location.href || "",
      userAgent: navigator.userAgent || ""
    };
  }

  function registerExternalAppIfNeeded(options) {
    var manifest = window.SKHPS_APP_MANIFEST || {};
    var payload;

    if (!manifest || typeof manifest !== "object") {
      return;
    }

    if (manifest.registerExternalApp === false) {
      return;
    }

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      console.warn("[SKHPSAppEntry] registerExternalApp skipped: SKHPSBackend.call not available");
      earlyRuntimeLog("WARN", "registerExternalAppSkipped", "SKHPSBackend.call not available");
      return;
    }

    payload = normalizeRegisterPayload(options || {});

    if (!payload.appId || !payload.title || !payload.href) {
      console.warn("[SKHPSAppEntry] registerExternalApp skipped: missing appId/title/href", payload);
      earlyRuntimeLog("WARN", "registerExternalAppSkipped", "missing appId/title/href");
      return;
    }

    earlyRuntimeLog("RUN", "registerExternalApp", payload.appId);

    window.SKHPS_EXTERNAL_APP_REGISTER_PROMISE = window.SKHPSBackend
      .call("registerExternalApp", payload, {
        timeoutMs: 8000
      })
      .then(function (result) {
        window.SKHPS_EXTERNAL_APP_REGISTER_RESULT = result;
        earlyRuntimeLog("OK", "registerExternalApp", payload.appId);
        return result;
      })
      .catch(function (error) {
        window.SKHPS_EXTERNAL_APP_REGISTER_ERROR = error;
        console.warn("[SKHPSAppEntry] registerExternalApp failed:", error);
        earlyRuntimeLog("WARN", "registerExternalAppFailed", error && error.message ? error.message : String(error));
        return {
          ok: false,
          error: error && error.message ? error.message : String(error)
        };
      });
  }

  function init() {
    var env = inferEnvFromPageLocation();
    var sharedBaseUrl = normalizeBaseUrl(window.SKHPS_ENTRY_BASE_URL || inferSharedBaseUrl());
    var appBaseUrl = inferAppBaseUrl();
    var coreVersion = String(window.SKHPS_ENTRY_VERSION || getEntryVersion() || "").trim();

    installMinimalLoadingClasses();

    if (!sharedBaseUrl || sharedBaseUrl === "/") {
      throw new Error("shared base url missing");
    }

    return loadAppManifest()
      .then(function (rawManifest) {
        var rootManifest = normalizeManifest(rawManifest, env);
        var effectiveManifest = resolveEffectiveManifest(rootManifest, env);

        window.SKHPS_APP_MANIFEST = rootManifest;
        window.SKHPS_APP_ROOT_MANIFEST = rootManifest;
        window.SKHPS_APP_EFFECTIVE_MANIFEST = effectiveManifest;

        applyManifestLoadingTasks(effectiveManifest);

        return loadVersionForManifest(rootManifest).then(function (versionInfo) {
          return {
            rootManifest: rootManifest,
            manifest: effectiveManifest,
            versionInfo: versionInfo
          };
        });
      })
      .then(function (loaded) {
        var rootManifest = loaded.rootManifest || loaded.manifest;
        var manifest = loaded.manifest;
        var rootAppId = getAppId(rootManifest);
        var currentAppId = String(
          manifest.appId ||
          manifest.projectId ||
          manifest.pageId ||
          getCurrentPageId() ||
          rootAppId ||
          ""
        ).trim();
        var currentPageId = String(manifest.pageId || getCurrentPageId() || currentAppId || "").trim();
        var appVersion = buildAppVersion(rootManifest, loaded.versionInfo);

        if (!rootAppId) {
          throw new Error("SKHPS appId missing in app.json");
        }

        rootManifest.appId = rootAppId;
        manifest.appId = currentAppId || rootAppId;
        manifest.projectId = manifest.projectId || manifest.appId;
        manifest.rootAppId = rootAppId;
        manifest.pageId = currentPageId;

        if (!rootManifest.title && document.title) {
          rootManifest.title = document.title;
        }

        if (!manifest.title && document.title) {
          manifest.title = document.title;
        }

        /*
          SKHPS_APP_ID 保留 root app id 作 legacy identity。
          目前頁面 / registry project identity 另外使用 currentAppId / projectId / pageId。
        */
        window.SKHPS_APP_ID = rootAppId;
        window.SKHPS_ROOT_APP_ID = rootAppId;
        window.SKHPS_CURRENT_APP_ID = manifest.appId;
        window.SKHPS_CURRENT_PROJECT_ID = manifest.projectId || manifest.appId;
        window.SKHPS_APP_MANIFEST = rootManifest;
        window.SKHPS_APP_ROOT_MANIFEST = rootManifest;
        window.SKHPS_APP_EFFECTIVE_MANIFEST = manifest;

        window.SKHPS_APP_ENV = {
          appId: manifest.appId,
          projectId: manifest.projectId || manifest.appId,
          rootAppId: rootAppId,
          env: env,
          requestedRuntime: getRuntimeParam() || "",
          sharedBaseUrl: sharedBaseUrl,
          appBaseUrl: appBaseUrl,
          coreVersion: coreVersion,
          appVersion: appVersion,
          version: appVersion || coreVersion,
          title: manifest.title || appId,
          href: manifest.href || window.location.href,
          group: manifest.group || "",
          order: 9999,
          displayPosition: "",
          manifest: manifest,
          rootManifest: rootManifest,
          pageId: manifest.pageId || getCurrentPageId() || "",
          manifestUrl: window.SKHPS_APP_MANIFEST_URL_RESOLVED || "",
          afterScripts: manifest.entry.afterScripts || [],
          loadingTasks: manifest.entry.loadingTasks || []
        };

        window.SKHPS_ENTRY_BASE_URL = sharedBaseUrl;
        window.SKHPS_CONFIG_BASE_URL = sharedBaseUrl;

        document.documentElement.setAttribute("data-skhps-app-id", manifest.appId);
        document.documentElement.setAttribute("data-skhps-project-id", manifest.projectId || manifest.appId);
        document.documentElement.setAttribute("data-skhps-root-app-id", rootAppId);
        document.documentElement.setAttribute("data-skhps-page-id", manifest.pageId || getCurrentPageId() || manifest.appId);
        document.documentElement.setAttribute("data-skhps-runtime", env);
        document.documentElement.setAttribute("data-skhps-entry-scope", "external-app");

        window.SKHPS_APP_ENTRY_LOADED = true;

        earlyRuntimeLog("RUN", "init", {
          appId: manifest.appId,
          rootAppId: rootAppId,
          projectId: manifest.projectId || manifest.appId,
          pageId: manifest.pageId || "",
          env: env,
          sharedBaseUrl: sharedBaseUrl,
          appBaseUrl: appBaseUrl,
          appVersion: appVersion,
          afterScripts: manifest.entry.afterScripts || [],
          loadingTasks: manifest.entry.loadingTasks || []
        });

        return loadEntryCore(sharedBaseUrl, coreVersion)
          .then(function () {
            return window.SKHPSEntryCore.load({
              scope: "external-app",
              appId: manifest.appId,
              rootAppId: rootAppId,
              projectId: manifest.projectId || manifest.appId,
              pageId: manifest.pageId || "",
              env: env,
              requestedRuntime: getRuntimeParam() || "",
              sharedBaseUrl: sharedBaseUrl,
              coreVersion: coreVersion,
              specificBaseUrl: appBaseUrl,
              specificVersion: appVersion || coreVersion,
              specificScripts: manifest.entry.afterScripts || [],
              coreScripts: null,
              failureTask: manifest.appId || rootAppId || "external-app"
            });
          })
          .then(function (options) {
            /*
              registerExternalApp 需要 backend-client.js 已經由 entry-core 載好。
              這裡只啟動背景 promise，不等待、不擋畫面。
            */
            registerExternalAppIfNeeded(window.SKHPS_APP_ENV);

            document.dispatchEvent(new CustomEvent("skhps-app-entry-ready", {
              detail: options || window.SKHPS_APP_ENV
            }));

            return options;
          });
      });
  }

  window.SKHPSAppEntry = {
    init: init,
    getRuntimeParam: getRuntimeParam,
    inferEnvFromPageLocation: inferEnvFromPageLocation,
    getAppManifestUrl: getAppManifestUrl,
    loadAppManifest: loadAppManifest,
    loadVersionForManifest: loadVersionForManifest,
    resolveEffectiveManifest: resolveEffectiveManifest,
    getLoadedAppVersion: getLoadedAppVersion
  };

  installMinimalLoadingClasses();
  init().catch(markFailed);
})();
