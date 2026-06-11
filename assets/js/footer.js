/*
檔案位置：skhpsv2/assets/js/footer.js
時間戳記：2026-06-12 UTC+8
用途：Footer 三區 runtime 摘要。只讀 SKHPSRuntime 狀態，不重做一套平行 runtime。
*/

(function () {
  "use strict";

  var booted = false;
  var versionLoadStarted = false;
  var panelOpen = false;

  var INFRA_TASKS = {
    "css-runtime": true,
    config: true,
    backend: true,
    runtime: true,
    header: true,
    footer: true,
    "loading-gate": true,
    loadingGate: true
  };

  function runtime() {
    return window.SKHPSRuntime || null;
  }

  function findFooter() {
    return document.querySelector("[data-skhps-footer]");
  }

  function getState() {
    if (runtime() && typeof runtime().getState === "function") {
      return runtime().getState();
    }

    return null;
  }

  function hostEnvFromLocation() {
    var host = String(window.location.hostname || "").toLowerCase();
    var protocol = String(window.location.protocol || "").toLowerCase();

    if (protocol === "file:" || host === "127.0.0.1" || host === "localhost" || host === "") return "LOCAL";
    if (host === "skhps.jonaminz.com") return "PROD";
    if (host === "dev-skhps.jonaminz.com") return "DEV";
    return "UNKNOWN";
  }

  function pageTitle() {
    var html = document.documentElement;
    return String(
      html.dataset.skhpsPageTitle ||
      html.dataset.loadingTitle ||
      document.title ||
      "SKHPS"
    ).trim();
  }

  function hostEnvLabel(state) {
    state = state || {};
    var host = state.host || {};
    var runtimeState = state.runtime || {};
    var hostEnv = host.env || hostEnvFromLocation();
    var effective = runtimeState.effective || "";

    if (hostEnv === "LOCAL" && effective && effective !== "LOCAL" && effective !== "UNKNOWN") {
      return "LOCAL→" + effective;
    }

    return hostEnv || "UNKNOWN";
  }

  function normalizeBaseUrl(url) {
    return String(url || "").replace(/\/+$/, "") + "/";
  }

  function appHrefForEnv(env) {
    var appEnv = window.SKHPS_APP_ENV || {};
    var config = window.SKHPS_APP_CONFIG || {};
    var hrefMap = config.hrefMap || appEnv.hrefMap || {};
    var href = "";

    if (hrefMap && hrefMap[env]) return hrefMap[env];
    if (env === "dev" && hrefMap["local-dev"] && hostEnvFromLocation() === "LOCAL") return hrefMap.dev || hrefMap["local-dev"];

    if (env === "dev") {
      href = appEnv.devHref || config.devHref || config.hrefDev || "";
    } else if (env === "prod") {
      href = appEnv.prodHref || config.prodHref || config.hrefProd || "";
    }

    if (href) return href;

    if (config.href && /^https?:\/\//i.test(String(config.href))) {
      try {
        var url = new URL(config.href);
        if (env === "dev") url.hostname = url.hostname.replace(/^quick-login\./, "quick-login.").replace(/^skhps\./, "dev-skhps.");
        if (env === "prod") url.hostname = url.hostname.replace(/^dev-skhps\./, "skhps.");
        return url.toString();
      } catch (error) {}
    }

    return "";
  }

  function siteBaseForEnv(env) {
    var config = window.SKHPS_CONFIG || {};
    var siteBase = config.site && config.site.baseUrl ? config.site.baseUrl : null;

    if (siteBase && siteBase[env]) {
      return siteBase[env];
    }

    if (env === "dev") return "https://dev-skhps.jonaminz.com/";
    if (env === "prod") return "https://skhps.jonaminz.com/";
    return "";
  }

  function toggleHref(state) {
    var label = hostEnvLabel(state);
    var targetEnv = label.indexOf("PROD") >= 0 ? "dev" : "prod";

    if (label.indexOf("LOCAL") >= 0) {
      targetEnv = "dev";
    }

    return appHrefForEnv(targetEnv) || siteBaseForEnv(targetEnv);
  }

  function loadVersionJsIfNeeded() {
    if (window.SKHPS_VERSION || versionLoadStarted) return;
    versionLoadStarted = true;

    var script = document.createElement("script");
    script.src = "version.js?v=" + encodeURIComponent(String(Date.now()));
    script.async = true;
    script.onload = render;
    script.onerror = render;
    document.head.appendChild(script);
  }

  function versionText() {
    return window.SKHPS_VERSION && window.SKHPS_VERSION.version
      ? String(window.SKHPS_VERSION.version)
      : "v.unknown";
  }

  function failedTasks(gate) {
    return (gate.failedTasks || []).concat(gate.failed || []);
  }

  function completedTasks(gate) {
    return gate.completedTasks || gate.done || [];
  }

  function requiredTasks(gate) {
    return gate.requiredTasks || gate.required || [];
  }

  function traffic(status, label, title) {
    var icons = {
      green: "🟢",
      yellow: "🟡",
      red: "🔴",
      gray: "⚪"
    };

    return {
      icon: icons[status] || icons.gray,
      status: status,
      label: label,
      title: title || label
    };
  }

  function deriveGate(state) {
    var gate = state && state.loadingGate ? state.loadingGate : {};
    var required = requiredTasks(gate);
    var completed = completedTasks(gate);
    var failed = failedTasks(gate);
    var releaseReason = gate.releaseReason || "";

    if (!required.length && !completed.length && !failed.length) return traffic("gray", "Gate", "沒有 loading gate 資料");
    if (failed.length || /timeout|error|force-release-with-error/i.test(releaseReason)) return traffic("red", "Gate", releaseReason || "loading gate failed");
    if (required.length && required.every(function (task) { return completed.indexOf(task) >= 0; }) && (!releaseReason || releaseReason === "all-ready")) return traffic("green", "Gate", "all-ready");
    return traffic("yellow", "Gate", "loading");
  }

  function deriveConfig(state) {
    var config = state && state.config ? state.config : {};
    var module = state && state.modules ? state.modules.config : null;
    if (module && module.status === "fail") return traffic("red", "Config", module.error || "config failed");
    if (config.loaded && config.source) return traffic("green", "Config", config.source);
    if (config.loaded) return traffic("yellow", "Config", "inferred");
    return traffic("gray", "Config", "unknown");
  }

  function deriveBackend(state) {
    var backend = state && state.backend ? state.backend : {};
    var calls = backend.calls || [];
    if (calls.some(function (call) { return call.status === "fail" || call.status === "error"; })) return traffic("red", "Backend", "backend call failed");
    if (calls.some(function (call) { return call.status === "ok" || call.status === "done"; })) return traffic("green", "Backend", "backend call ok");
    if (backend.loaded) return traffic("yellow", "Backend", "backend loaded, no successful call yet");
    return traffic("gray", "Backend", "unknown");
  }

  function deriveCss(state) {
    var css = state && state.cssRuntime ? state.cssRuntime : {};
    var module = state && state.modules ? state.modules.cssRuntime : null;
    if (module && module.status === "fail") return traffic("red", "CSS", module.error || "css failed");
    if (css.loaded && css.source === "cache") return traffic("yellow", "CSS", "cache");
    if (css.loaded) return traffic("green", "CSS", css.source || "live");
    if (module && module.status === "waiting") return traffic("yellow", "CSS", "loading");
    return traffic("gray", "CSS", "unknown");
  }

  function pageDataTask(state) {
    var html = document.documentElement;
    var configured = html.getAttribute("data-skhps-page-data-task");
    var required = state && state.loadingGate ? requiredTasks(state.loadingGate) : [];

    if (state && (state.pageDataTask || state.appDataTask)) return state.pageDataTask || state.appDataTask;
    if (configured) return configured;

    return required.find(function (task) {
      return !INFRA_TASKS[task];
    }) || "";
  }

  function deriveData(state) {
    var gate = state && state.loadingGate ? state.loadingGate : {};
    var task = pageDataTask(state);
    var completed = completedTasks(gate);
    var failed = failedTasks(gate);

    if (!task) return traffic("gray", "Data", "not specified");
    if (failed.some(function (entry) { return entry.task === task || entry === task; })) return traffic("red", "Data", task + " failed");
    if (completed.indexOf(task) >= 0) return traffic("green", "Data", task);
    return traffic("yellow", "Data", task + " loading");
  }

  function getFooterRuntimeSummary(state) {
    state = state || getState() || {};
    return [
      deriveGate(state),
      deriveConfig(state),
      deriveBackend(state),
      deriveCss(state),
      deriveData(state)
    ];
  }

  function createStatusLamp(item) {
    var span = document.createElement("span");
    span.className = "skhps-footer-lamp skhps-footer-lamp-" + item.status;
    span.title = item.title;
    span.textContent = item.icon + " " + item.label;
    return span;
  }

  function ensureRuntimePanel(open) {
    document.documentElement.setAttribute("data-skhps-runtime-panel-open", open ? "true" : "false");
    if (runtime() && typeof runtime().renderPanel === "function") {
      runtime().renderPanel();
    }
  }

  function toggleRuntimePanel() {
    panelOpen = !panelOpen;
    ensureRuntimePanel(panelOpen);
    render();
  }

  function render() {
    var footer = findFooter();
    var state = getState();
    if (!footer) return;

    loadVersionJsIfNeeded();
    footer.classList.add("skhps-footer");
    footer.innerHTML = "";

    var left = document.createElement("div");
    left.className = "skhps-footer-left";

    var page = document.createElement("span");
    page.className = "skhps-footer-page";
    page.textContent = pageTitle();

    var sep = document.createElement("span");
    sep.className = "skhps-footer-separator";
    sep.textContent = " · ";

    var env = document.createElement("button");
    env.className = "skhps-footer-env";
    env.type = "button";
    env.textContent = hostEnvLabel(state);
    env.title = "切換正式版 / 測試版";
    env.addEventListener("click", function () {
      var href = toggleHref(state);
      if (href) window.location.href = href;
    });

    left.appendChild(page);
    left.appendChild(sep);
    left.appendChild(env);

    var center = document.createElement("div");
    center.className = "skhps-footer-center";
    center.textContent = versionText();

    var right = document.createElement("div");
    right.className = "skhps-footer-right";

    getFooterRuntimeSummary(state).forEach(function (lamp) {
      right.appendChild(createStatusLamp(lamp));
    });

    var toggle = document.createElement("button");
    toggle.className = "skhps-footer-runtime-toggle";
    toggle.type = "button";
    toggle.textContent = panelOpen ? "▼" : "▲";
    toggle.title = panelOpen ? "收合 runtime panel" : "展開 runtime panel";
    toggle.addEventListener("click", toggleRuntimePanel);
    right.appendChild(toggle);

    footer.appendChild(left);
    footer.appendChild(center);
    footer.appendChild(right);
    ensureRuntimePanel(panelOpen);
  }

  function logViaRuntime(level, key, value, detail) {
    if (runtime() && typeof runtime().log === "function") {
      runtime().log({
        level: level,
        module: "footer",
        message: key + (value ? ": " + value : ""),
        data: detail || null
      });
    }
    render();
  }

  function setRuntimeStatus(name, status, detail, options) {
    options = options || {};

    if (runtime()) {
      if (status === "ok" && typeof runtime().done === "function") {
        runtime().done(name, { detail: detail || options.detail || "" });
      } else if ((status === "error" || status === "fail" || status === "failed") && typeof runtime().fail === "function") {
        runtime().fail(name, detail || "failed", options);
      } else if (typeof runtime().start === "function") {
        runtime().start(name);
      }
    }

    render();
  }

  function boot() {
    if (booted) {
      render();
      return;
    }

    booted = true;
    ensureRuntimePanel(false);
    render();

    document.addEventListener("skhps-runtime-updated", render);
    document.addEventListener("skhps-css-sheet-runtime-ready", render);
    document.addEventListener("skhps-external-app-loader-ready", render);
  }

  window.SKHPSFooter = {
    set: function (key, patch) { logViaRuntime("info", key, patch && patch.value, patch); },
    remove: render,
    ok: function (key, value, detail) { setRuntimeStatus(key, "ok", detail || value); },
    warn: function (key, value, detail) { logViaRuntime("warn", key, value, detail); },
    error: function (key, value, detail) { setRuntimeStatus(key, "error", detail || value); },
    pending: function (key, value, detail) { setRuntimeStatus(key, "pending", detail || value); },
    info: function (key, value, detail) { logViaRuntime("info", key, value, detail); },
    setRuntimeStatus: setRuntimeStatus,
    taskPending: function (taskName) {
      if (runtime() && typeof runtime().setLoadingRequired === "function") {
        var state = getState();
        var required = state && state.loadingGate ? (state.loadingGate.requiredTasks || []).slice() : [];
        if (required.indexOf(taskName) < 0) required.push(taskName);
        runtime().setLoadingRequired(required);
      }
    },
    taskDone: function (taskName) {
      if (runtime() && typeof runtime().taskDone === "function") runtime().taskDone(taskName);
    },
    taskWarn: function (taskName, detail) { logViaRuntime("warn", taskName, "warning", detail); },
    taskError: function (taskName, detail) {
      if (runtime() && typeof runtime().taskFailed === "function") runtime().taskFailed(taskName, detail || "failed");
    },
    quickLoginStaffPending: function (detail) { setRuntimeStatus("quick-login-staff", "pending", detail); },
    quickLoginStaffReady: function (count, detail) { setRuntimeStatus("quick-login-staff", "ok", detail || ("count: " + count)); },
    quickLoginStaffFailed: function (errorMessage) { setRuntimeStatus("quick-login-staff", "error", errorMessage); },
    getFooterRuntimeSummary: getFooterRuntimeSummary,
    toggleRuntimePanel: toggleRuntimePanel,
    render: render,
    boot: boot
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
