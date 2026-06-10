/*
檔案位置：skhpsv2/assets/js/external-apps-runtime.js
用途：首頁讀取 Sheet「外部專案」，顯示目前 runtime 啟用中的前台外部專案。

Loading Gate：
- 任務名稱：external-apps-runtime
- 成功讀取並 render 完成：done
- 讀取失敗但錯誤訊息已 render：fail
*/

(function () {
  "use strict";

  var TASK_NAME = "external-apps-runtime";
  var CONTAINER_SELECTOR = "[data-skhps-external-apps]";
  var STATUS_SELECTOR = "[data-skhps-external-apps-status]";
  var WAIT_BACKEND_TIMEOUT_MS = 8000;
  var WAIT_BACKEND_INTERVAL_MS = 100;

  function $(selector) {
    return document.querySelector(selector);
  }

  function markReady() {
    document.documentElement.setAttribute("data-skhps-external-apps-runtime-ready", "true");

    if (window.SKHPSLoading && typeof window.SKHPSLoading.done === "function") {
      window.SKHPSLoading.done(TASK_NAME);
    }
  }

  function markFailed(error) {
    document.documentElement.setAttribute("data-skhps-external-apps-runtime-ready", "false");
    document.documentElement.setAttribute(
      "data-skhps-external-apps-runtime-error",
      error && error.message ? error.message : String(error || "unknown")
    );

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail(TASK_NAME, error);
    }
  }

  function getRuntime() {
    var fromHtml = document.documentElement.getAttribute("data-skhps-runtime");
    if (fromHtml) return fromHtml;

    if (window.SKHPSConfig && typeof window.SKHPSConfig.getEnv === "function") {
      return window.SKHPSConfig.getEnv(window.SKHPS_CONFIG);
    }

    if (window.SKHPS_CONFIG && window.SKHPS_CONFIG.env) {
      return window.SKHPS_CONFIG.env;
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

  function setStatus(text) {
    var el = $(STATUS_SELECTOR);
    if (el) el.textContent = text || "";
  }

  function clearContainer() {
    var container = $(CONTAINER_SELECTOR);
    if (container) container.innerHTML = "";
    return container;
  }

  function createAppButton(app) {
    var a = document.createElement("a");

    a.className = "skhps-btn skhps-btn-secondary skhps-btn-lg";
    a.href = app.href || "#";
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

  function renderApps(apps, runtime) {
    var container = clearContainer();

    if (!container) {
      throw new Error("missing external apps container: " + CONTAINER_SELECTOR);
    }

    if (!apps.length) {
      setStatus("目前沒有啟用中的外部前台專案（" + runtime + "）");
      return;
    }

    apps.forEach(function (app) {
      container.appendChild(createAppButton(app));
    });

    setStatus("已載入 " + apps.length + " 個外部前台專案（" + runtime + "）");
  }

  function renderError(error) {
    console.error("[SKHPSExternalAppsRuntime]", error);

    clearContainer();

    setStatus(
      "外部專案清單讀取失敗：" +
      (error && error.message ? error.message : String(error || "未知錯誤"))
    );
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

  function init() {
    var container = $(CONTAINER_SELECTOR);

    if (!container) {
      markReady();
      return;
    }

    var runtime = getRuntime();

    document.documentElement.setAttribute("data-skhps-runtime", runtime);
    setStatus("外部專案清單載入中...");

    callBackend("listExternalApps", {
      activeOnly: true,
      appType: "前台",
      env: runtime
    })
      .then(function (response) {
        console.info("[SKHPSExternalAppsRuntime] listExternalApps response:", response);
        renderApps(normalizeApps(response), runtime);
        markReady();
      })
      .catch(function (error) {
        renderError(error);
        markFailed(error);
      });
  }

  window.SKHPSExternalAppsRuntime = {
    init: init,
    getRuntime: getRuntime
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();