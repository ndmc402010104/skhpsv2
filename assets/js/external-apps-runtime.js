/*
檔案位置：skhpsv2/assets/js/external-apps-runtime.js
時間戳：2026-06-16 UTC+8
用途：首頁讀取 Sheet「外部專案」，只顯示目前 runtime、啟用=true、且「顯示位置」為前台的外部專案。

Loading Gate：
- 任務名稱：external-apps-runtime
- 成功讀取 listExternalProjects 並 render 完成：done
- 讀取失敗但錯誤訊息已 render：fail

規則：
- 功能資料 / backend 資料不使用 localStorage cache。
- 首頁系統入口是可操作功能，必須等 backend 回來並完成 render 後才放行。
- CSS 可以 cache；功能資料不要 cache。
*/

(function () {
  "use strict";

  var TASK_NAME = "external-apps-runtime";
  var CONTAINER_SELECTOR = "[data-skhps-external-apps]";
  var STATUS_SELECTOR = "[data-skhps-external-apps-status]";
  var COUNT_SELECTOR = "[data-skhps-external-apps-count]";
  var WAIT_BACKEND_TIMEOUT_MS = 8000;
  var WAIT_BACKEND_INTERVAL_MS = 100;

  var loadStartedAt = Date.now();
  var readyMarked = false;

  function rlog(status, action, detail, durationMs) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "external-apps-runtime.js",
          category: "external-app",
          action: action,
          status: status,
          detail: detail || "",
          durationMs: durationMs
        });
      }
    } catch (error) {}
  }

  function setRuntimeExternalApps(data) {
    try {
      if (window.SKHPSRuntime && typeof window.SKHPSRuntime.setExternalApps === "function") {
        window.SKHPSRuntime.setExternalApps(data || {});
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "external-apps-runtime.js");

  function $(selector) {
    return document.querySelector(selector);
  }

  function markReady() {
    if (readyMarked) {
      return;
    }

    readyMarked = true;

    document.documentElement.setAttribute("data-skhps-external-apps-runtime-ready", "true");
    document.documentElement.setAttribute("data-skhps-external-apps-runtime-ready-reason", "backend");

    rlog("OK", "moduleReady", "external-apps-runtime.js", Date.now() - loadStartedAt);

    if (window.SKHPSLoading && typeof window.SKHPSLoading.done === "function") {
      window.SKHPSLoading.done(TASK_NAME);
    }
  }

  function markFailed(error) {
    if (readyMarked) {
      return;
    }

    readyMarked = true;

    var message = error && error.message ? error.message : String(error || "unknown");

    document.documentElement.setAttribute("data-skhps-external-apps-runtime-ready", "false");
    document.documentElement.setAttribute("data-skhps-external-apps-runtime-error", message);

    rlog("FAIL", "moduleReady", {
      error: message
    }, Date.now() - loadStartedAt);

    setRuntimeExternalApps({
      loaded: false,
      source: "backend",
      error: message,
      durationMs: Date.now() - loadStartedAt
    });

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail(TASK_NAME, error);
    }
  }

  function normalizeRegistryEnv(value) {
    value = String(value || "").trim();

    if (value === "LOCAL") return "local-dev";
    if (value === "DEV") return "dev";
    if (value === "PROD") return "prod";

    return value;
  }

  function getRuntime() {
    if (window.SKHPSRuntime && typeof window.SKHPSRuntime.getState === "function") {
      var state = window.SKHPSRuntime.getState();
      if (state && state.runtime && state.runtime.effective) {
        return normalizeRegistryEnv(state.runtime.effective);
      }
    }

    var fromHtml = document.documentElement.getAttribute("data-skhps-runtime");
    if (fromHtml) {
      return normalizeRegistryEnv(fromHtml);
    }

    if (window.SKHPSConfig && typeof window.SKHPSConfig.getEnv === "function") {
      return normalizeRegistryEnv(window.SKHPSConfig.getEnv(window.SKHPS_CONFIG));
    }

    if (window.SKHPS_CONFIG && window.SKHPS_CONFIG.env) {
      return normalizeRegistryEnv(window.SKHPS_CONFIG.env);
    }

    return "";
  }

  function setStatus(text) {
    var el = $(STATUS_SELECTOR);
    if (el) {
      el.textContent = text || "";
    }
  }

  function setCount(value) {
    var el = $(COUNT_SELECTOR);
    if (el) {
      el.textContent = String(value);
    }
  }

  function clearContainer() {
    var container = $(CONTAINER_SELECTOR);

    if (container) {
      container.innerHTML = "";
    }

    return container;
  }

  function createAppButton(app) {
    var a = document.createElement("a");
    var href = app.href || "#";

    if (href !== "#" && window.SKHPSConfig && typeof window.SKHPSConfig.withRuntime === "function") {
      href = window.SKHPSConfig.withRuntime(href, window.SKHPS_CONFIG || {}, app.env || getRuntime());
    }

    a.className = "skhps-btn skhps-btn-secondary skhps-btn-lg";
    a.href = href;
    a.textContent = app.title || app.appId || "未命名外部專案";
    a.setAttribute("data-skhps-external-app-id", app.appId || "");
    a.setAttribute("data-skhps-external-app-env", app.env || "");

    return a;
  }

  function normalizeApps(response) {
    if (!response) return [];
    if (Array.isArray(response.apps)) return response.apps;
    if (response.data && Array.isArray(response.data.apps)) return response.data.apps;
    return [];
  }

  function isActive(app) {
    if (!app) return false;
    if (app.active === true || app.enabled === true) return true;

    var value = String(app.active || app.enabled || app["啟用"] || "").trim().toLowerCase();
    return value === "true" || value === "是" || value === "1" || value === "yes";
  }

  function normalizeDisplayLocation(app) {
    var value = app && (
      app["顯示位置"] ||
      app.displayPosition ||
      ""
    );

    var text = String(value || "").trim().toLowerCase();

    if (text === "front" || text === "frontend" || value === "前台") return "front";
    if (text === "back" || text === "backend" || text === "admin" || value === "後台") return "backend";

    return "";
  }

  function isFrontendApp(app) {
    return isActive(app) && normalizeDisplayLocation(app) === "front";
  }

  function getOrder(app) {
    var value = app && (
      app.order ||
      app.sort ||
      app["排序"] ||
      9999
    );

    var number = Number(value);

    if (Number.isFinite(number)) {
      return number;
    }

    return 9999;
  }

  function sortApps(apps) {
    return (apps || []).slice().sort(function (a, b) {
      var orderA = getOrder(a);
      var orderB = getOrder(b);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return String(a.title || a.appId || "").localeCompare(
        String(b.title || b.appId || ""),
        "zh-Hant"
      );
    });
  }

  function filterHomeApps(apps) {
    return sortApps((apps || []).filter(isFrontendApp));
  }

  function renderApps(apps, runtime) {
    var container = clearContainer();

    if (!container) {
      throw new Error("missing external apps container: " + CONTAINER_SELECTOR);
    }

    setCount(apps.length);

    if (!apps.length) {
      setStatus("目前沒有啟用中的外部專案（" + runtime + "）");
      return;
    }

    apps.forEach(function (app) {
      container.appendChild(createAppButton(app));
    });

    setStatus("已載入 " + apps.length + " 個外部專案（" + runtime + "）");
  }

  function renderError(error) {
    var message = error && error.message ? error.message : String(error || "未知錯誤");

    console.error("[SKHPSExternalAppsRuntime]", error);

    clearContainer();
    setCount("讀取失敗");
    setStatus("外部專案清單讀取失敗：" + message);
  }

  function waitForBackend() {
    var startedAt = Date.now();

    return new Promise(function (resolve, reject) {
      function check() {
        if (window.SKHPSBackend && typeof window.SKHPSBackend.call === "function") {
          resolve(window.SKHPSBackend);
          return;
        }

        if (Date.now() - startedAt >= WAIT_BACKEND_TIMEOUT_MS) {
          reject(new Error("SKHPSBackend.call not loaded"));
          return;
        }

        window.setTimeout(check, WAIT_BACKEND_INTERVAL_MS);
      }

      check();
    });
  }

  function callBackend(action, payload) {
    return waitForBackend().then(function (backend) {
      return backend.call(action, payload || {});
    });
  }

  function listExternalApps(runtime) {
    rlog("RUN", "listExternalApps", {
      env: runtime
    });

    return callBackend("listExternalProjects", {
      activeOnly: true,
      env: runtime
    }).then(function (response) {
      console.info("[SKHPSExternalAppsRuntime] listExternalApps response:", response);

      var apps = filterHomeApps(normalizeApps(response));

      rlog("OK", "listExternalApps", {
        env: runtime,
        count: apps.length
      }, Date.now() - loadStartedAt);

      return apps;
    });
  }

  function init() {
    var container = $(CONTAINER_SELECTOR);
    var runtime = getRuntime();

    if (!container) {
      markReady();
      return;
    }

    document.documentElement.setAttribute("data-skhps-runtime", runtime);

    setCount("載入中");
    setStatus("外部專案清單載入中...");

    listExternalApps(runtime)
      .then(function (apps) {
        renderApps(apps, runtime);

        setRuntimeExternalApps({
          loaded: true,
          source: "backend",
          count: apps.length,
          env: runtime,
          error: "",
          durationMs: Date.now() - loadStartedAt
        });

        markReady();
      })
      .catch(function (error) {
        renderError(error);

        rlog("FAIL", "listExternalApps", {
          env: runtime,
          error: error && error.message ? error.message : String(error)
        }, Date.now() - loadStartedAt);

        markFailed(error);
      });
  }

  window.SKHPSExternalAppsRuntime = {
    init: init,
    getRuntime: getRuntime,
    listExternalApps: listExternalApps
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();