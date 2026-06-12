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
  var STYLE_ID = "skhps-footer-runtime-guard-style";
  var resizeObserver = null;

  function rlog(status, action, detail) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "footer.js",
          category: "dom",
          action: action,
          status: status,
          detail: detail || ""
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "footer.js");

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

  function ensureFooterGuardStyle() {
    if (document.getElementById(STYLE_ID)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".skhps-footer{max-width:100%;overflow-x:hidden}",
      ".skhps-footer-left,.skhps-footer-center,.skhps-footer-right{min-width:0}",
      ".skhps-footer-left{overflow:hidden}",
      ".skhps-footer-page{overflow:hidden;text-overflow:ellipsis}",
      ".skhps-footer-right{min-width:0;flex-wrap:wrap}",
      ".skhps-footer-lamp,.skhps-footer-env,.skhps-footer-css-refresh,.skhps-footer-runtime-toggle{flex:0 0 auto}",
      ".skhps-footer-css-refresh{border:0;background:transparent;color:inherit;font:inherit;font-weight:750;cursor:pointer;padding:2px 4px;white-space:nowrap}",
      "html[data-skhps-footer-fixed='true'][data-skhps-footer-reserve='true'] body{padding-bottom:var(--skhps-footer-safe-bottom,0px)}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function updateFooterSafeArea() {
    var footer = findFooter();
    if (!footer || !document.body) return;

    try {
      var style = window.getComputedStyle ? window.getComputedStyle(footer) : null;
      var isFixed = style && style.position === "fixed";
      var shouldReserve = Boolean(panelOpen && isFixed);
      var footerHeight = Math.ceil(footer.getBoundingClientRect().height || footer.offsetHeight || 0);
      var height = shouldReserve ? footerHeight : 0;

      document.documentElement.setAttribute("data-skhps-footer-fixed", isFixed ? "true" : "false");
      document.documentElement.setAttribute("data-skhps-footer-reserve", shouldReserve ? "true" : "false");
      document.documentElement.style.setProperty("--skhps-footer-safe-bottom", height ? height + "px" : "0px");
      document.documentElement.style.setProperty("--skhps-footer-height", footerHeight ? footerHeight + "px" : "48px");
    } catch (error) {}
  }

  function observeFooterSize() {
    var footer = findFooter();
    if (!footer || resizeObserver || typeof ResizeObserver !== "function") return;

    resizeObserver = new ResizeObserver(function () {
      updateFooterSafeArea();
    });
    resizeObserver.observe(footer);
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
    if (host === "skhps.jonaminz.com" || host === "quick-login.skhps.jonaminz.com") return "PROD";
    if (host === "dev-skhps.jonaminz.com" || host === "dev-quick-login.skhps.jonaminz.com") return "DEV";
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
    rlog("RUN", "loadScript", script.src);
    script.onload = function () {
      rlog("OK", "scriptLoaded", script.src);
      render();
    };
    script.onerror = function () {
      rlog("WARN", "scriptError", script.src);
      render();
    };
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
    var data = state && state.data ? state.data : {};
    var task = pageDataTask(state);
    var completed = completedTasks(gate);
    var failed = failedTasks(gate);
    var dataTask = data.task || task || "Data";
    var dataMessage = data.message || dataTask;
    var status = String(data.status || "").toLowerCase();

    if (status === "ok" || status === "green" || status === "success") return traffic("green", "Data", dataMessage);
    if (status === "warn" || status === "warning" || status === "yellow") return traffic("yellow", "Data", dataMessage);
    if (status === "fail" || status === "failed" || status === "error" || status === "red") return traffic("red", "Data", dataMessage);
    if (status === "waiting" || status === "loading" || status === "pending" || status === "run") return traffic("yellow", "Data", dataMessage);
    if (status === "gray" || status === "idle") return traffic("gray", "Data", dataMessage);
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

  function forceReloadCssSheet(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    try {
      if (
        window.SKHPSCssSheetRuntimeLoader &&
        typeof window.SKHPSCssSheetRuntimeLoader.clearCache === "function"
      ) {
        window.SKHPSCssSheetRuntimeLoader.clearCache();
      } else {
        localStorage.removeItem("skhpsv2.cssSheetRuntimeCache.v1");
        sessionStorage.removeItem("skhpsv2.cssSheetRuntimeSessionReady.v1");
      }
    } catch (error) {
      console.warn("CSS Sheet force reload cache clear failed:", error);
    }

    try {
      if (runtime() && typeof runtime().log === "function") {
        runtime().log({
          level: "info",
          module: "footer",
          message: "force-css-sheet-reload",
          data: {
            source: "footer CSS button"
          }
        });
      }
    } catch (error) {}

    window.location.reload();
  }

  function createCssRefreshButton(item) {
    var button = document.createElement("button");
    button.className = "skhps-footer-css-refresh skhps-footer-lamp skhps-footer-lamp-" + item.status;
    button.type = "button";
    button.title = "清除 CSS cache 並重新從 CSS總表讀取";
    button.textContent = item.icon + " " + item.label;
    button.addEventListener("click", forceReloadCssSheet);
    return button;
  }

  function ensureRuntimePanel(open) {
    document.documentElement.setAttribute("data-skhps-runtime-panel-open", open ? "true" : "false");
    if (runtime() && typeof runtime().renderPanel === "function") {
      runtime().renderPanel();
    }

    if (!open) {
      resetRuntimePanelOffset();
    }
  }

  function focusRuntimeToggle() {
    var footer = findFooter();
    var toggle = footer ? footer.querySelector(".skhps-footer-runtime-toggle") : null;
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (!toggle || typeof toggle.focus !== "function") return;

    try {
      toggle.focus({
        preventScroll: true
      });
    } catch (error) {
      toggle.focus();
      try {
        window.scrollTo(scrollX, scrollY);
      } catch (scrollError) {}
    }
  }

  function resetRuntimePanelOffset() {
    var panel = document.getElementById("skhps-runtime-panel");
    if (panel) panel.style.marginTop = "";
  }

  function runtimePanelAnchor(panel) {
    if (!panel) return null;

    return panel.querySelector(".skhps-runtime-summary + .skhps-runtime-section") ||
      panel.querySelector(".skhps-runtime-section") ||
      panel.querySelector(".skhps-runtime-summary") ||
      panel;
  }

  function anchorEdgeTop(anchor) {
    if (!anchor) return 0;
    return anchor.getBoundingClientRect().top;
  }

  function placeRuntimeAnchorAtFooter() {
    var panel = document.getElementById("skhps-runtime-panel");
    var footer = findFooter();
    if (!panel) return;

    try {
      panel.style.marginTop = "";

      var anchor = runtimePanelAnchor(panel);
      var footerRect = footer ? footer.getBoundingClientRect() : null;
      var footerTop = footerRect ? footerRect.top : window.innerHeight;
      var gap = Math.max(0, Math.ceil(footerTop - anchorEdgeTop(anchor)));

      panel.style.marginTop = gap ? gap + "px" : "";
    } catch (error) {
      panel.style.marginTop = "";
    }
  }

  function scrollRuntimePanelIntoView() {
    var panel = document.getElementById("skhps-runtime-panel");
    var footer = findFooter();
    if (!panel) return;

    function alignRuntimeAnchorToFooterTop(behavior) {
      var top = window.pageYOffset || document.documentElement.scrollTop || 0;

      try {
        var anchor = runtimePanelAnchor(panel);
        var footerRect = footer ? footer.getBoundingClientRect() : null;
        var footerTop = footerRect ? footerRect.top : window.innerHeight;
        top = top + anchorEdgeTop(anchor) - footerTop;

        window.scrollTo({
          top: Math.max(0, top),
          left: 0,
          behavior: behavior || "auto"
        });
      } catch (error) {
        try {
          window.scrollTo(0, Math.max(0, top));
        } catch (scrollError) {}
      }
    }

    window.requestAnimationFrame(function () {
      updateFooterSafeArea();
      placeRuntimeAnchorAtFooter();
      alignRuntimeAnchorToFooterTop("smooth");
      window.requestAnimationFrame(function () {
        updateFooterSafeArea();
        placeRuntimeAnchorAtFooter();
        alignRuntimeAnchorToFooterTop("auto");
        window.setTimeout(function () {
          updateFooterSafeArea();
          placeRuntimeAnchorAtFooter();
          alignRuntimeAnchorToFooterTop("auto");
        }, 120);
      });
    });
  }

  function toggleRuntimePanel(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    panelOpen = !panelOpen;
    ensureRuntimePanel(panelOpen);
    render({
      restoreToggleFocus: true,
      scrollPanel: panelOpen
    });
  }

  function render(options) {
    options = options || {};
    var footer = findFooter();
    var state = getState();
    if (!footer) return;

    ensureFooterGuardStyle();
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
      right.appendChild(lamp.label === "CSS" ? createCssRefreshButton(lamp) : createStatusLamp(lamp));
    });

    var toggle = document.createElement("button");
    toggle.className = "skhps-footer-runtime-toggle";
    toggle.type = "button";
    toggle.textContent = panelOpen ? "▼" : "▲";
    toggle.title = panelOpen ? "收合 runtime panel" : "展開 runtime panel";
    toggle.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    toggle.setAttribute("aria-controls", "skhps-runtime-panel");
    toggle.addEventListener("click", toggleRuntimePanel);
    right.appendChild(toggle);

    footer.appendChild(left);
    footer.appendChild(center);
    footer.appendChild(right);
    ensureRuntimePanel(panelOpen);
    updateFooterSafeArea();
    observeFooterSize();

    if (options.restoreToggleFocus) {
      focusRuntimeToggle();
    }

    if (options.scrollPanel) {
      scrollRuntimePanelIntoView();
    }
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
    window.addEventListener("resize", updateFooterSafeArea);
    rlog("OK", "moduleReady", "footer.js");
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
    taskPending: function (taskName, detail) {
      if (runtime() && typeof runtime().setLoadingRequired === "function") {
        var state = getState();
        var required = state && state.loadingGate ? (state.loadingGate.requiredTasks || []).slice() : [];
        if (required.indexOf(taskName) < 0) required.push(taskName);
        runtime().setLoadingRequired(required);
      }
      logViaRuntime("info", taskName, "pending", detail || null);
    },
    taskDone: function (taskName, detail) {
      if (runtime() && typeof runtime().taskDone === "function") runtime().taskDone(taskName);
      logViaRuntime("info", taskName, "done", detail || null);
    },
    taskWarn: function (taskName, detail) { logViaRuntime("warn", taskName, "warning", detail); },
    taskError: function (taskName, detail) {
      if (runtime() && typeof runtime().taskFailed === "function") runtime().taskFailed(taskName, detail || "failed");
      logViaRuntime("error", taskName, "failed", detail || null);
    },
    taskReady: function (taskName, detail) {
      if (runtime() && typeof runtime().taskDone === "function") runtime().taskDone(taskName);
      setRuntimeStatus(taskName, "ok", detail || "done");
    },
    taskFailed: function (taskName, detail) {
      if (runtime() && typeof runtime().taskFailed === "function") runtime().taskFailed(taskName, detail || "failed");
      setRuntimeStatus(taskName, "error", detail || "failed");
    },
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
