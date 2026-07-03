/*
檔案位置：skhpsv2/assets/js/backend-client.js
時間戳記：2026-07-01 23:59 UTC+8
用途：全站唯一後端呼叫入口；external registry 可競速讀取，CSS Registry runtime、saveCssSheetRows 與 uploadFile 固定走 Cloudflare Worker。CSS Setting Studio 存檔（saveCssSheetRows）已retire Google Sheet 那條路，只寫 Supabase CssRegistryRule，Sheet 不再維護。
*/

(function () {
  "use strict";

  var DEFAULT_TIMEOUT_MS = 15000;
  var configPromise = null;

  var WORKER_READ_RACE_ACTIONS = {
    listExternalProjects: true,
    listExternalApps: true,
    listExternalProjectsForLauncher: true
  };

  var WORKER_DUAL_WRITE_ACTIONS = {
    registerExternalApp: true,
    updateExternalProjectActivation: true,
    updateExternalAppSettings: true,
    setExternalAppActive: true
  };

  /*
    注意（2026-07-03）：saveCssSheetRows 必須走 Worker → Supabase CssRegistryRule。
    若 worker 設定失效，call() 會落到最後的 callJsonp fallback → GAS → Google Sheet（殭屍路徑），
    而且 css-setting 的狀態文字仍會顯示「已寫入 Supabase」，等於無聲寫錯地方。
    TODO(拆除 Sheet 殭屍路徑)：改成 saveCssSheetRows 在 worker 不可用時直接 reject，不得退回 JSONP。
  */
  var WORKER_JSON_ACTIONS = {
    getCssRegistryRuntime: true,
    getCssSheetRuntime: true,
    saveCssSheetRows: true
  };

  function runtime() {
    return window.SKHPSRuntime || null;
  }

  function rlog(status, action, detail, durationMs) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "backend-client.js",
          category: "backend",
          action: action,
          status: status,
          detail: detail || "",
          durationMs: durationMs
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "backend-client.js");


  function currentPageHint() {
    var html = document.documentElement;
    var body = document.body || {};
    var values = [
      html && html.getAttribute && html.getAttribute("data-skhps-page-id"),
      html && html.getAttribute && html.getAttribute("data-page-id"),
      body && body.getAttribute && body.getAttribute("data-skhps-page-id"),
      body && body.getAttribute && body.getAttribute("data-page-id"),
      window.SKHPS_PAGE_ID,
      window.SKHPS_CURRENT_PAGE_ID,
      location && location.pathname,
      location && location.href
    ];

    return values.map(function (value) {
      return String(value || "").toLowerCase();
    }).join(" | ");
  }

  function isBackendProjectLauncherPage() {
    var hint = currentPageHint();

    return Boolean(
      hint.indexOf("backend-project-launcher") >= 0 ||
      hint.indexOf("project-launcher") >= 0 ||
      document.querySelector("[data-backend-project-launcher-list]") ||
      document.querySelector("[data-backend-project-launcher-editor]") ||
      document.querySelector("[data-backend-project-launcher-status]")
    );
  }

  function normalizeLauncherRegistryReadAction(action, payload) {
    var normalizedAction = String(action || "");
    var normalizedPayload = Object.assign({}, payload || {});

    /*
      後台專案啟動器是管理頁，必須讀完整 registry。
      舊版前端仍可能呼叫首頁用 listExternalProjects，這裡強制轉成專用 action，避免只拿到前台啟用項目。
    */
    if (
      isBackendProjectLauncherPage() &&
      (normalizedAction === "listExternalProjects" || normalizedAction === "listExternalApps")
    ) {
      normalizedAction = "listExternalProjectsForLauncher";
      normalizedPayload.activeOnly = false;
      normalizedPayload.includeDisabled = true;
      normalizedPayload.includeInactive = true;
      normalizedPayload.launcherMode = true;
      normalizedPayload.forceFresh = true;
      normalizedPayload.source = normalizedPayload.source || "backend-client-launcher-force-all";

      rlog("INFO", "launcherRegistryActionForced", {
        fromAction: action,
        toAction: normalizedAction,
        payload: normalizedPayload
      });

      try {
        console.info("[SKHPSBackend] launcherRegistryActionForced", {
          fromAction: action,
          toAction: normalizedAction,
          payload: normalizedPayload
        });
      } catch (error) {}
    }

    return {
      action: normalizedAction,
      payload: normalizedPayload
    };
  }

  function runtimeStart(name) {
    if (runtime() && typeof runtime().start === "function") {
      runtime().start(name);
    }
  }

  function runtimeDone(name, data) {
    if (runtime() && typeof runtime().done === "function") {
      runtime().done(name, data);
    }
  }

  function runtimeFail(name, error, data) {
    if (runtime() && typeof runtime().fail === "function") {
      runtime().fail(name, error, data);
    }
  }

  function setRuntimeBackend(data) {
    if (runtime() && typeof runtime().setBackend === "function") {
      runtime().setBackend(data);
    }
  }

  function setRuntimeBackendCall(data) {
    if (runtime() && typeof runtime().setBackendCall === "function") {
      runtime().setBackendCall(data);
    }
  }

  function firstValue() {
    var values = Array.prototype.slice.call(arguments);
    var i;

    for (i = 0; i < values.length; i += 1) {
      if (values[i] !== undefined && values[i] !== null && String(values[i]).trim() !== "") {
        return values[i];
      }
    }

    return "";
  }

  function normalizeList(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return String(item || "").trim();
      }).filter(Boolean);
    }

    return String(value || "")
      .split(",")
      .map(function (item) {
        return String(item || "").trim();
      })
      .filter(Boolean);
  }

  function lookupSheetName(key, config) {
    var sheets = config && config.sheets ? config.sheets : {};
    var groups = [
      sheets.cssSheets || {},
      sheets.dataSheets || {},
      sheets.sheets || {}
    ];
    var i;
    var item;

    key = String(key || "").trim();
    if (!key) return "";

    for (i = 0; i < groups.length; i += 1) {
      item = groups[i][key];
      if (item) {
        return String(item.title || item.tabName || item.name || item.key || key);
      }
    }

    return key;
  }

  function lookupCalendarName(value, config) {
    var calendars = config && (config.calendars || (config.resources && config.resources.calendars)) || {};
    var key = String(value || "").trim();
    var item = calendars[key];

    if (!key) return "";
    if (item) return String(item.title || item.name || item.calendarName || item.id || key);

    return key;
  }

  function inferResource(action, payload, config) {
    payload = payload || {};

    var lowerAction = String(action || "").toLowerCase();
    var resourceType = String(payload.resourceType || "").trim();
    var sheetKeys = normalizeList(payload.sheetKeys || payload.sheets || payload.sheetKey || payload.sheetName);
    var calendarKeys = normalizeList(payload.calendarNames || payload.calendarIds || payload.calendarName || payload.calendarId);
    var resourceName = "";

    if (!resourceType) {
      if (lowerAction.indexOf("calendar") >= 0) {
        resourceType = "calendar";
      } else if (
        lowerAction.indexOf("sheet") >= 0 ||
        lowerAction.indexOf("css") >= 0 ||
        lowerAction.indexOf("staff") >= 0
      ) {
        resourceType = "sheet";
      } else if (lowerAction.indexOf("drive") >= 0 || lowerAction.indexOf("file") >= 0) {
        resourceType = "drive";
      } else if (lowerAction.indexOf("mail") >= 0 || lowerAction.indexOf("gmail") >= 0) {
        resourceType = "gmail";
      } else if (lowerAction.indexOf("registerexternalapp") >= 0) {
        resourceType = "registry";
      } else if (lowerAction === "health") {
        resourceType = "backend";
      } else {
        resourceType = "apps-script";
      }
    }

    if (payload.resourceName) {
      resourceName = String(payload.resourceName).trim();
    } else if (resourceType === "sheet" && sheetKeys.length) {
      resourceName = sheetKeys.map(function (key) {
        return lookupSheetName(key, config);
      }).join(", ");
    } else if (resourceType === "calendar" && calendarKeys.length) {
      resourceName = calendarKeys.map(function (key) {
        return lookupCalendarName(key, config);
      }).join(", ");
    } else {
      resourceName = String(firstValue(
        payload.calendarName,
        payload.calendarId,
        payload.sheetName,
        payload.sheetKey,
        payload.tabName,
        payload.appId,
        payload.title,
        action
      ) || "").trim();
    }

    return {
      resourceType: resourceType,
      resourceName: resourceName
    };
  }

  function traceFunction(functionName, status, data) {
    if (runtime() && typeof runtime().log === "function") {
      runtime().log({
        level: status === "error" ? "error" : "debug",
        module: "backend-client.js",
        message: "function-" + status,
        data: Object.assign({
          file: "backend-client.js",
          functionName: functionName,
          status: status
        }, data || {})
      });
    }
  }

  function loadConfig() {
    traceFunction("loadConfig", "start");

    if (window.SKHPSConfig && typeof window.SKHPSConfig.loadConfig === "function") {
      return window.SKHPSConfig.loadConfig();
    }

    if (window.SKHPS_CONFIG) {
      return Promise.resolve(window.SKHPS_CONFIG);
    }

    if (!configPromise) {
      configPromise = fetch("config.json", { cache: "no-store" }).then(function (response) {
        if (!response.ok) {
          throw new Error("config.json failed: HTTP " + response.status);
        }

        return response.json();
      }).then(function (config) {
        window.SKHPS_CONFIG = config;
        return config;
      });
    }

    return configPromise;
  }

  function endpointFromConfig(config) {
    if (!config || !config.api || !config.api.webAppUrl) {
      return "";
    }

    return String(config.api.webAppUrl).trim();
  }

  function getEndpoint() {
    var config =
      window.SKHPSConfig && typeof window.SKHPSConfig.getConfig === "function"
        ? window.SKHPSConfig.getConfig()
        : window.SKHPS_CONFIG;

    return endpointFromConfig(config);
  }

  function buildUrl(endpoint, action, payload, callbackName) {
    var parts = [];

    parts.push("action=" + encodeURIComponent(action));
    parts.push("callback=" + encodeURIComponent(callbackName));
    parts.push("ts=" + encodeURIComponent(String(Date.now())));

    if (payload !== undefined && payload !== null) {
      parts.push("payload=" + encodeURIComponent(JSON.stringify(payload)));
    }

    return endpoint + (endpoint.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
  }

  function callJsonp(endpoint, action, payload, options) {
    options = options || {};
    var jsonpStartedAt = Date.now();
    traceFunction("callJsonp", "start", {
      action: action,
      url: endpoint
    });
    rlog("RUN", "jsonpAppend", {
      action: action,
      endpoint: endpoint
    });

    return new Promise(function (resolve, reject) {
      if (!endpoint) {
        reject(new Error("找不到 config.json 裡的 api.webAppUrl"));
        return;
      }

      if (!action) {
        reject(new Error("Missing Apps Script action"));
        return;
      }

      var callbackName =
        "skhpsBackend_" +
        Date.now() +
        "_" +
        Math.floor(Math.random() * 100000);

      var script = document.createElement("script");
      var timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

      var timer = setTimeout(function () {
        cleanup();
        rlog("FAIL", "jsonpTimeout", {
          action: action,
          endpoint: endpoint,
          error: "JSONP timeout"
        }, Date.now() - jsonpStartedAt);
        reject(new Error("JSONP timeout: " + action + " @ " + endpoint));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);

        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }

        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function (result) {
        cleanup();
        rlog("OK", "jsonpResponse", {
          action: action,
          endpoint: endpoint
        }, Date.now() - jsonpStartedAt);
        traceFunction("callJsonp", "done", {
          action: action,
          url: endpoint
        });
        resolve(result);
      };

      script.onerror = function () {
        cleanup();
        rlog("FAIL", "jsonpError", {
          action: action,
          endpoint: endpoint,
          error: "JSONP failed"
        }, Date.now() - jsonpStartedAt);
        traceFunction("callJsonp", "error", {
          action: action,
          url: endpoint,
          error: "JSONP failed"
        });
        reject(new Error("JSONP failed: " + action + " @ " + endpoint));
      };

      script.async = true;
      script.src = buildUrl(endpoint, action, payload, callbackName);
      document.head.appendChild(script);
    });
  }

  function getBackendWorkerConfig(config) {
    var backend = config && config.backend ? config.backend : {};
    var worker = backend && backend.worker ? backend.worker : null;

    if (!worker && config && config.workerBackend) {
      worker = config.workerBackend;
    }

    return worker || null;
  }

  function getWorkerActionConfig(config, action) {
    var worker = getBackendWorkerConfig(config);
    var actions = worker && worker.actions ? worker.actions : {};
    return actions[String(action || "")] || null;
  }

  function getWorkerBaseUrl(config, env) {
    var worker = getBackendWorkerConfig(config);
    var baseUrlByEnv;
    var baseUrl = "";

    if (!worker || worker.enabled === false) {
      return "";
    }

    baseUrlByEnv = worker.baseUrlByEnv || {};

    baseUrl = firstValue(
      baseUrlByEnv[env],
      env === "local-dev" ? baseUrlByEnv.local : "",
      env === "local" ? baseUrlByEnv["local-dev"] : "",
      baseUrlByEnv[String(config && config.env || "")],
      worker.baseUrl,
      worker.url
    );

    return String(baseUrl || "").replace(/\/+$/, "");
  }

  function shouldUseWorkerAction(config, action) {
    var worker = getBackendWorkerConfig(config);
    var actionConfig = getWorkerActionConfig(config, action);

    if (String(action || "") !== "uploadFile") {
      return false;
    }

    if (!worker || worker.enabled === false) {
      return false;
    }

    if (!actionConfig || actionConfig.enabled === false) {
      return false;
    }

    return true;
  }

  function shouldUseWorkerJsonAction(config, action) {
    var worker = getBackendWorkerConfig(config);
    var actionConfig = getWorkerActionConfig(config, action);

    if (!WORKER_JSON_ACTIONS[String(action || "")]) {
      return false;
    }

    if (!worker || worker.enabled === false) {
      return false;
    }

    if (actionConfig && actionConfig.enabled === false) {
      return false;
    }

    return Boolean(getWorkerBaseUrl(config, getCurrentEnv(config)) || getWorkerBaseUrl(config, config && config.env));
  }

  function isBlobLike(value) {
    return (
      value &&
      typeof value === "object" &&
      typeof value.size === "number" &&
      typeof value.arrayBuffer === "function"
    );
  }

  function appendFormValue(form, key, value) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      form.append(key, String(value));
    }
  }

  function normalizeWorkerUploadPayload(payload, config, env) {
    payload = payload || {};

    var file = payload.file || payload.blob || payload.attachment;
    var meta = payload.meta || {};
    var appId = firstValue(
      payload.appId,
      payload.app_id,
      window.SKHPS_APP_ID,
      window.SKHPSAppId,
      config && config.app,
      "skhpsv2"
    );

    if (!isBlobLike(file)) {
      throw new Error("uploadFile 需要 payload.file，而且必須是 File 或 Blob");
    }

    return {
      file: file,
      filename: firstValue(payload.filename, payload.fileName, file.name, "upload.bin"),
      appId: String(appId),
      env: String(firstValue(payload.env, env, config && config.env, "unknown")),
      bucket: payload.bucket,
      path: payload.path || payload.objectPath || payload.object_path,
      meta: meta
    };
  }

  function callWorkerUploadFile(config, env, action, payload, options) {
    options = options || {};

    var actionConfig = getWorkerActionConfig(config, action) || {};
    var workerBase = getWorkerBaseUrl(config, env);
    var route = String(actionConfig.route || "/api/upload-file");
    var endpoint = workerBase + route;
    var uploadStartedAt = Date.now();
    var normalized;
    var form;
    var controller = null;
    var timer = null;
    var timeoutMs = Number(options.timeoutMs || actionConfig.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!workerBase) {
      throw new Error("找不到 config.json 裡的 backend.worker.baseUrlByEnv." + env);
    }

    normalized = normalizeWorkerUploadPayload(payload, config, env);

    form = new FormData();
    form.append("file", normalized.file, normalized.filename);
    form.append("appId", normalized.appId);
    form.append("env", normalized.env);

    appendFormValue(form, "bucket", normalized.bucket);
    appendFormValue(form, "path", normalized.path);

    form.append("meta", JSON.stringify(Object.assign({
      background: true,
      affectsGate: false,
      source: "backend-client.js"
    }, normalized.meta || {})));

    rlog("RUN", "workerUpload", {
      action: action,
      endpoint: endpoint,
      appId: normalized.appId,
      env: normalized.env,
      affectsGate: false
    });

    if (typeof AbortController !== "undefined" && timeoutMs > 0) {
      controller = new AbortController();
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (error) {}
      }, timeoutMs);
    }

    return fetch(endpoint, {
      method: String(actionConfig.method || "POST"),
      body: form,
      headers: {
        "X-SKHPS-App-Id": normalized.appId,
        "X-SKHPS-Env": normalized.env
      },
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;

        if (timer) {
          clearTimeout(timer);
        }

        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = {
            raw: text
          };
        }

        if (!response.ok || !data || data.ok === false) {
          var message =
            data && data.error
              ? data.error
              : "Worker upload failed: HTTP " + response.status;

          var workerError = new Error(message);
          workerError.status = response.status;
          workerError.response = data;
          throw workerError;
        }

        rlog("OK", "workerUpload", {
          action: action,
          endpoint: endpoint,
          path: data.path || "",
          bucket: data.bucket || "",
          affectsGate: false
        }, Date.now() - uploadStartedAt);

        return data;
      });
    }).catch(function (error) {
      if (timer) {
        clearTimeout(timer);
      }

      rlog("FAIL", "workerUpload", {
        action: action,
        endpoint: endpoint,
        error: error && error.message ? error.message : String(error),
        affectsGate: false
      }, Date.now() - uploadStartedAt);

      throw error;
    });
  }


  function workerActionEnabledForRegistry(config, action) {
    var worker = getBackendWorkerConfig(config);
    var actionConfig = getWorkerActionConfig(config, action);

    if (!worker || worker.enabled === false) {
      return false;
    }

    /*
      Registry action 預設可走 /api/action。
      若 config.json 有明確 actions[action].enabled=false，才關閉。
      這樣不需要為每個 registry action 都先寫死 route。
    */
    if (actionConfig && actionConfig.enabled === false) {
      return false;
    }

    return Boolean(getWorkerBaseUrl(config, getCurrentEnv(config)) || getWorkerBaseUrl(config, config && config.env));
  }

  function getCurrentEnv(config) {
    if (window.SKHPSConfig && typeof window.SKHPSConfig.getEnv === "function") {
      return window.SKHPSConfig.getEnv(config);
    }

    if (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env) {
      return window.SKHPS_APP_ENV.env;
    }

    if (document.documentElement && document.documentElement.getAttribute("data-skhps-runtime")) {
      return document.documentElement.getAttribute("data-skhps-runtime");
    }

    return config && (config.runtimeEnv || config.env) || "";
  }

  function normalizeWorkerEnv(env) {
    env = String(env || "").trim();

    if (env === "LOCAL") return "local-dev";
    if (env === "DEV") return "dev";
    if (env === "PROD") return "prod";

    return env || "prod";
  }

  function normalizeRegistryResponse(response, source) {
    response = response || {};

    var items =
      Array.isArray(response.apps) ? response.apps :
        Array.isArray(response.projects) ? response.projects :
          Array.isArray(response.items) ? response.items :
            response.data && Array.isArray(response.data.apps) ? response.data.apps :
              response.data && Array.isArray(response.data.projects) ? response.data.projects :
                response.data && Array.isArray(response.data.items) ? response.data.items :
                  [];

    if (!Array.isArray(response.apps)) {
      response.apps = items;
    }

    if (!Array.isArray(response.projects)) {
      response.projects = items;
    }

    response.count = Number(response.count || items.length || 0) || 0;
    response.source = response.source || source || "unknown";
    response.sourceLabel = response.sourceLabel ||
      (source === "cloudflare" ? "Supabase Registry / Cloudflare Worker" :
        source === "apps-script" ? "Google Sheet / Apps Script" :
          response.source);

    return response;
  }

  function isRegistryListResponseValid(response) {
    var items;

    if (!response || response.ok === false) {
      return false;
    }

    items = Array.isArray(response.apps) ? response.apps :
      Array.isArray(response.projects) ? response.projects :
        Array.isArray(response.items) ? response.items :
          response.data && Array.isArray(response.data.apps) ? response.data.apps :
            response.data && Array.isArray(response.data.projects) ? response.data.projects :
              response.data && Array.isArray(response.data.items) ? response.data.items :
                null;

    if (!Array.isArray(items)) {
      return false;
    }

    /*
      避免 Supabase 新表還沒匯入 CSV 時，空陣列太快回來，反而搶贏 Apps Script。
      若未來真的有合法空 registry，可在 response.allowEmptyRegistry=true 放行。
    */
    if (!items.length && response.allowEmptyRegistry !== true) {
      return false;
    }

    return true;
  }

  function callWorkerJsonAction(config, env, action, payload, options) {
    options = options || {};

    var actionConfig = getWorkerActionConfig(config, action) || {};
    var workerBase = getWorkerBaseUrl(config, env);
    var route = String(actionConfig.route || "/api/action");
    var endpoint = workerBase + route;
    var workerStartedAt = Date.now();
    var controller = null;
    var timer = null;
    var timeoutMs = Number(options.timeoutMs || actionConfig.timeoutMs || DEFAULT_TIMEOUT_MS);
    var normalizedEnv = normalizeWorkerEnv(env);

    if (!workerBase) {
      return Promise.reject(new Error("找不到 config.json 裡的 backend.worker.baseUrlByEnv." + env));
    }

    rlog("RUN", "workerAction", {
      action: action,
      endpoint: endpoint,
      env: normalizedEnv
    });

    if (typeof AbortController !== "undefined" && timeoutMs > 0) {
      controller = new AbortController();
      timer = setTimeout(function () {
        try {
          controller.abort();
        } catch (error) {}
      }, timeoutMs);
    }

    return fetch(endpoint, {
      method: String(actionConfig.method || "POST"),
      headers: {
        "Content-Type": "application/json",
        "X-SKHPS-App-Id": payload && payload.appId || payload && payload.projectId || "skhpsv2",
        "X-SKHPS-Env": normalizedEnv
      },
      body: JSON.stringify({
        action: action,
        env: normalizedEnv,
        payload: payload || {}
      }),
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;

        if (timer) {
          clearTimeout(timer);
        }

        try {
          data = text ? JSON.parse(text) : {};
        } catch (error) {
          data = {
            ok: false,
            error: "INVALID_WORKER_JSON",
            raw: text
          };
        }

        if (!response.ok || !data || data.ok === false) {
          var message =
            data && (data.message || data.error)
              ? (data.message || data.error)
              : "Worker action failed: HTTP " + response.status;

          var workerError = new Error(message);
          workerError.status = response.status;
          workerError.response = data;
          throw workerError;
        }

        rlog("OK", "workerAction", {
          action: action,
          endpoint: endpoint,
          env: normalizedEnv,
          source: data.source || "cloudflare"
        }, Date.now() - workerStartedAt);

        return data;
      });
    }).catch(function (error) {
      if (timer) {
        clearTimeout(timer);
      }

      rlog("FAIL", "workerAction", {
        action: action,
        endpoint: endpoint,
        env: normalizedEnv,
        error: error && error.message ? error.message : String(error)
      }, Date.now() - workerStartedAt);

      throw error;
    });
  }

  function firstSuccessfulRegistryRead(loaders) {
    return new Promise(function (resolve, reject) {
      var pending = loaders.length;
      var errors = [];
      var resolved = false;

      if (!pending) {
        reject(new Error("No registry source available"));
        return;
      }

      loaders.forEach(function (loader) {
        loader.promise
          .then(function (response) {
            var normalized = normalizeRegistryResponse(response, loader.source);

            if (!isRegistryListResponseValid(normalized)) {
              throw new Error(loader.source + " returned invalid registry payload");
            }

            if (resolved) {
              rlog("INFO", "registryLateSourceIgnored", {
                action: loader.action,
                source: loader.source,
                count: normalized.count
              });
              return;
            }

            resolved = true;
            normalized.winner = loader.source;
            normalized.mode = "parallel-first-available";
            resolve(normalized);
          })
          .catch(function (error) {
            errors.push({
              source: loader.source,
              error: error
            });

            pending -= 1;
            if (pending <= 0 && !resolved) {
              reject(new Error(
                "listExternalProjects all sources failed: " +
                  errors.map(function (item) {
                    return item.source + ": " + (item.error && item.error.message ? item.error.message : String(item.error));
                  }).join(" | ")
              ));
            }
          });
      });
    });
  }

  function callRegistryReadRace(config, env, endpoint, action, payload, options) {
    var loaders = [];
    var normalizedEnv = normalizeWorkerEnv(env);

    if (endpoint) {
      loaders.push({
        source: "apps-script",
        action: action,
        promise: callJsonp(endpoint, action, payload, options)
      });
    }

    if (workerActionEnabledForRegistry(config, action)) {
      loaders.push({
        source: "cloudflare",
        action: action,
        promise: callWorkerJsonAction(config, normalizedEnv, action, payload, options)
      });
    }

    if (loaders.length === 1) {
      return loaders[0].promise.then(function (response) {
        return normalizeRegistryResponse(response, loaders[0].source);
      });
    }

    return firstSuccessfulRegistryRead(loaders);
  }

  function resultOk(result) {
    return result && result.ok !== false;
  }

  function callRegistryDualWrite(config, env, endpoint, action, payload, options) {
    var loaders = [];
    var normalizedEnv = normalizeWorkerEnv(env);

    if (endpoint) {
      loaders.push({
        source: "apps-script",
        promise: callJsonp(endpoint, action, payload, options)
      });
    }

    if (workerActionEnabledForRegistry(config, action)) {
      loaders.push({
        source: "cloudflare",
        promise: callWorkerJsonAction(config, normalizedEnv, action, payload, options)
      });
    }

    if (!loaders.length) {
      return Promise.reject(new Error("No registry write source available"));
    }

    return Promise.all(loaders.map(function (loader) {
      return loader.promise
        .then(function (result) {
          return {
            source: loader.source,
            ok: resultOk(result),
            result: result
          };
        })
        .catch(function (error) {
          return {
            source: loader.source,
            ok: false,
            error: error && error.message ? error.message : String(error)
          };
        });
    })).then(function (results) {
      var okResults = results.filter(function (item) {
        return item.ok === true;
      });
      var writes = {};

      results.forEach(function (item) {
        writes[item.source] = item.error
          ? {
            ok: false,
            error: item.error
          }
          : Object.assign({
            ok: item.ok
          }, item.result || {});
      });

      if (!okResults.length) {
        return {
          ok: false,
          action: action,
          source: "dual-write",
          sourceLabel: "Sheet / Supabase 都失敗",
          error: results.map(function (item) {
            return item.source + ": " + (item.error || item.result && (item.result.message || item.result.error) || "ok=false");
          }).join(" | "),
          writes: writes
        };
      }

      return {
        ok: true,
        action: action,
        source: "dual-write",
        sourceLabel: "Google Sheet / Apps Script + Supabase Registry",
        primarySource: okResults[0].source,
        partialWrite: okResults.length < loaders.length,
        writes: writes,
        result: okResults[0].result || null,
        data: okResults[0].result && okResults[0].result.data || null
      };
    });
  }


  function call(action, payload, options) {
    var normalizedLauncherCall = normalizeLauncherRegistryReadAction(action, payload);
    action = normalizedLauncherCall.action;
    payload = normalizedLauncherCall.payload;

    var startedAt = Date.now();
    var resource = inferResource(action, payload);
    var callId =
      String(action || "unknown") +
      "::" +
      startedAt;

    setRuntimeBackendCall({
      callId: callId,
      action: action,
      resourceType: resource.resourceType,
      resourceName: resource.resourceName,
      status: "running",
      startedAt: new Date(startedAt).toISOString()
    });

    rlog("RUN", "call", {
      action: action,
      endpoint: getEndpoint() || "(pending config)"
    });

    traceFunction("call", "start", {
      action: action
    });

    if (action === "health") {
      runtimeStart("backend");
    }

    return loadConfig().then(function (config) {
      var endpoint = endpointFromConfig(config);
      var env =
        window.SKHPSConfig && typeof window.SKHPSConfig.getEnv === "function"
          ? window.SKHPSConfig.getEnv(config)
          : config && config.runtimeEnv || config && config.env || "";
      resource = inferResource(action, payload, config);

      setRuntimeBackend({
        loaded: true,
        endpoint: endpoint,
        env: env,
        durationMs: Date.now() - startedAt
      });

      setRuntimeBackendCall({
        callId: callId,
        action: action,
        resourceType: resource.resourceType,
        resourceName: resource.resourceName,
        status: "running",
        durationMs: Date.now() - startedAt
      });

      rlog("INFO", "endpoint", {
        action: action,
        endpoint: endpoint,
        env: env
      }, Date.now() - startedAt);

      if (WORKER_READ_RACE_ACTIONS[action]) {
        return callRegistryReadRace(config, env, endpoint, action, payload || {}, options);
      }

      if (WORKER_DUAL_WRITE_ACTIONS[action]) {
        return callRegistryDualWrite(config, env, endpoint, action, payload || {}, options);
      }

      if (shouldUseWorkerJsonAction(config, action)) {
        return callWorkerJsonAction(config, env, action, payload || {}, options);
      }

      if (shouldUseWorkerAction(config, action)) {
        return callWorkerUploadFile(config, env, action, payload, options);
      }

      /*
        TODO(拆除 Sheet 殭屍路徑，2026-07-03)：其他 action 走 JSONP→GAS 是正常路徑，
        但 saveCssSheetRows 落到這裡代表 worker 設定壞掉，會寫回已 retire 的 Google Sheet——應直接 reject。
      */
      return callJsonp(endpoint, action, payload, options);
    }).then(function (response) {
      if (response && response.ok === false && response.error) {
        console.warn("SKHPSBackend action returned ok=false:", action, response);
      }

      if (action === "health") {
        setRuntimeBackend({
          healthy: Boolean(response && response.ok === true),
          durationMs: Date.now() - startedAt
        });

        if (response && response.ok === true) {
          runtimeDone("backend", {
            action: action
          });
        } else {
          runtimeFail("backend", new Error(response && response.error ? response.error : "health returned ok=false"), {
            action: action
          });
        }
      }

      setRuntimeBackendCall({
        callId: callId,
        action: action,
        resourceType: resource.resourceType,
        resourceName: resource.resourceName,
        status: response && response.ok === false ? "fail" : "ok",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        error: response && response.ok === false && response.error ? response.error : ""
      });

      rlog(response && response.ok === false ? "FAIL" : "OK", "response", {
        action: action,
        endpoint: getEndpoint(),
        ok: !(response && response.ok === false),
        httpStatus: response && response.status ? response.status : "",
        error: response && response.ok === false && response.error ? response.error : ""
      }, Date.now() - startedAt);

      traceFunction("call", "done", {
        action: action
      });
      return response;
    }).catch(function (error) {
      if (action === "health") {
        setRuntimeBackend({
          healthy: false,
          durationMs: Date.now() - startedAt
        });
        runtimeFail("backend", error, {
          action: action
        });
      }

      traceFunction("call", "error", {
        action: action,
        error: error && error.message ? error.message : String(error)
      });
      setRuntimeBackendCall({
        callId: callId,
        action: action,
        resourceType: resource.resourceType,
        resourceName: resource.resourceName,
        status: "fail",
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        error: error && error.message ? error.message : String(error)
      });
      rlog("FAIL", "response", {
        action: action,
        endpoint: getEndpoint(),
        httpStatus: error && error.status ? error.status : "",
        error: error && error.message ? error.message : String(error)
      }, Date.now() - startedAt);
      throw error;
    });
  }

  function bindHealthButton(buttonId, resultId) {
    traceFunction("bindHealthButton", "start", {
      buttonId: buttonId,
      resultId: resultId
    });

    var button = document.getElementById(buttonId);
    var result = document.getElementById(resultId);

    if (!button || !result) {
      return;
    }

    button.addEventListener("click", function () {
      result.textContent = "測試中...";

      call("health")
        .then(function (response) {
          result.textContent = JSON.stringify({
            ok: response && response.ok === true,
            endpoint: getEndpoint(),
            response: response
          }, null, 2);
        })
        .catch(function (error) {
          result.textContent = JSON.stringify({
            ok: false,
            endpoint: getEndpoint() || null,
            error: error && error.message ? error.message : String(error)
          }, null, 2);
        });
    });
  }

  function listExternalProjects(payload, options) {
    return call("listExternalProjects", payload || {}, options);
  }

  function listExternalProjectsForLauncher(payload, options) {
    payload = Object.assign({
      activeOnly: false,
      includeDisabled: true,
      includeInactive: true,
      launcherMode: true,
      forceFresh: true
    }, payload || {});

    return call("listExternalProjectsForLauncher", payload, options);
  }

  function updateExternalProjectActivation(payload, options) {
    return call("updateExternalProjectActivation", payload || {}, options);
  }

  function updateExternalAppSettings(payload, options) {
    return call("updateExternalAppSettings", payload || {}, options);
  }

  function registerExternalApp(payload, options) {
    return call("registerExternalApp", payload || {}, options);
  }

  function uploadFile(payload, options) {
    return call("uploadFile", payload || {}, options);
  }

  window.SKHPSBackend = {
    loadConfig: loadConfig,
    getEndpoint: getEndpoint,
    call: call,
    listExternalProjects: listExternalProjects,
    listExternalProjectsForLauncher: listExternalProjectsForLauncher,
    updateExternalProjectActivation: updateExternalProjectActivation,
    updateExternalAppSettings: updateExternalAppSettings,
    registerExternalApp: registerExternalApp,
    uploadFile: uploadFile,
    bindHealthButton: bindHealthButton
  };
  rlog("OK", "moduleReady", "backend-client.js");
})();
