/*
檔案位置：skhpsv2/assets/js/footer.js
時間戳記：2026-06-13 UTC+8
用途：Footer 三區 runtime 摘要與單一完整 runtime panel；只保留 closed/full；full 開啟時立刻展開 tail，滑到頁尾接點後從 docked 掛畫切回 flow 順接；短頁會補足 tail 前導距離，避免一開始沒有 scroll 時 flow 接點過早。
*/

(function () {
  "use strict";

  var booted = false;
  var versionLoadStarted = false;
  var STYLE_ID = "skhps-footer-runtime-guard-style";
  var resizeObserver = null;
  var runtimeResizeObserver = null;
  var runtimeState = "closed";
  var runtimeDocked = false;
  var lastScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  var lastScrollDirection = "none";
  var measureRaf = 0;
  var runtimeTailStart = 0;
  var runtimeOpenScrollY = 0;

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
      ".skhps-footer{max-width:100%;overflow-x:hidden;z-index:2147483000}",
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
      var footerRect = footer.getBoundingClientRect();
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      var footerHeight = Math.ceil(footerRect.height || footer.offsetHeight || 0) || 48;
      var footerDockBottom = Math.max(0, Math.ceil(viewportHeight - footerRect.top)) || footerHeight;

      /*
       * docked full 是 fixed 掛畫，不應該改變 document flow。
       * 只有 flow full 需要讓頁尾 runtime-tail 接續內容；如果 footer 是 fixed，才保留安全距離。
       */
      var shouldReserve = Boolean(runtimeState === "full" && !runtimeDocked && isFixed);
      var height = shouldReserve ? footerHeight : 0;

      document.documentElement.setAttribute("data-skhps-footer-fixed", isFixed ? "true" : "false");
      document.documentElement.setAttribute("data-skhps-footer-reserve", shouldReserve ? "true" : "false");
      document.documentElement.style.setProperty("--skhps-footer-safe-bottom", height ? height + "px" : "0px");
      document.documentElement.style.setProperty("--skhps-footer-height", footerHeight + "px");
      document.documentElement.style.setProperty("--skhps-footer-dock-bottom", footerDockBottom + "px");
    } catch (error) {}
  }

  function observeFooterSize() {
    var footer = findFooter();
    if (!footer || resizeObserver || typeof ResizeObserver !== "function") return;

    resizeObserver = new ResizeObserver(function () {
      updateFooterSafeArea();
      scheduleMeasureRuntimePanel();
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
    if (window.SKHPS_APP_ENV || window.SKHPS_APP_CONFIG) return "EXTERNAL";
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
    var effective = runtimeState.effective ||
      (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.env ? String(window.SKHPS_APP_ENV.env).toUpperCase() : "") ||
      String(document.documentElement.getAttribute("data-skhps-runtime") || "").toUpperCase();

    if (hostEnv === "LOCAL" && effective && effective !== "LOCAL" && effective !== "UNKNOWN") {
      return "LOCAL→" + effective;
    }

    if ((hostEnv === "UNKNOWN" || hostEnv === "EXTERNAL") && effective) {
      return "EXTERNAL→" + effective;
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
    var href = "";

    if (label.indexOf("LOCAL") >= 0) {
      targetEnv = "dev";
    }

    href = appHrefForEnv(targetEnv) || siteBaseForEnv(targetEnv);

    if (href && window.SKHPSConfig && typeof window.SKHPSConfig.withRuntime === "function") {
      return window.SKHPSConfig.withRuntime(href, window.SKHPS_CONFIG || {}, targetEnv);
    }

    return href;
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

  function loadingLocked() {
    var html = document.documentElement;

    return html.classList.contains("skhps-css-loading") ||
      html.classList.contains("skhps-loading") ||
      html.getAttribute("data-skhps-loading-released") !== "true";
  }

  function normalizeRuntimeState(state) {
    state = String(state || "").trim().toLowerCase();
    if (state === "full") return "full";
    return "closed";
  }

  function setRuntimeDocked(docked) {
    runtimeDocked = Boolean(docked && runtimeState === "full");
    document.documentElement.setAttribute("data-skhps-runtime-docked", runtimeDocked ? "true" : "false");
    return runtimeDocked;
  }

  function ensureRuntimeTail() {
    var tail = document.getElementById("skhps-runtime-tail");
    var footer = findFooter();

    if (tail) return tail;
    if (!document.body) return null;

    tail = document.createElement("div");
    tail.id = "skhps-runtime-tail";
    tail.className = "skhps-runtime-tail";
    tail.setAttribute("data-skhps-runtime-tail", "");

    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(tail, footer);
    } else {
      document.body.appendChild(tail);
    }

    return tail;
  }

  function ensureRuntimePanel(refresh) {
    var tail = ensureRuntimeTail();
    var panel = null;
    var host = null;

    document.documentElement.setAttribute("data-skhps-runtime-panel-open", runtimeState === "closed" ? "false" : "true");
    if (refresh && runtime() && typeof runtime().renderPanel === "function") {
      panel = runtime().renderPanel();
    } else {
      panel = document.getElementById("skhps-runtime-panel");
    }

    if (!panel && runtime() && typeof runtime().renderPanel === "function") {
      panel = runtime().renderPanel();
    }

    if (panel) {
      panel.style.removeProperty("margin-top");
      panel.style.removeProperty("position");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
      panel.style.removeProperty("left");
      panel.style.removeProperty("height");
      panel.style.removeProperty("max-height");
      panel.style.removeProperty("overflow");
      panel.style.removeProperty("z-index");
      panel.style.removeProperty("box-shadow");
    }

    /*
     * 單一 runtime panel，兩種掛法，只有 closed/full 狀態：
     * - full + docked：掛到 body，用 fixed 方式把整張 runtime 掛在 footer 下面，只露出 summary cards。
     * - full + flow：掛回 runtime-tail，恢復原本「頁尾順接、繼續往下滑看到 runtime」的 flow。
     */
    host = runtimeState === "full" && !runtimeDocked && tail ? tail : document.body;
    if (host && panel && panel.parentNode !== host) {
      host.appendChild(panel);
    }

    return panel;
  }

  function clearRuntimeStateClasses() {
    var html = document.documentElement;

    html.classList.remove("runtime-state-closed");
    html.classList.remove("runtime-state-full");
  }

  function setRuntimeState(state, options) {
    var html = document.documentElement;

    options = options || {};
    state = normalizeRuntimeState(state);

    if (loadingLocked()) {
      state = "closed";
    }

    if (state === "full" && runtimeState !== "full") {
      runtimeOpenScrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    }
    if (state === "closed") {
      runtimeOpenScrollY = 0;
      setRuntimeCssNumber("--skhps-runtime-tail-spacer", 0);
    }

    runtimeState = state;
    clearRuntimeStateClasses();
    html.classList.add("runtime-state-" + state);
    html.setAttribute("data-skhps-runtime-state", state);
    html.setAttribute("data-skhps-runtime-panel-open", state === "closed" ? "false" : "true");
    setRuntimeDocked(state === "full" ? options.docked !== false : false);

    ensureRuntimePanel(true);
    updateFooterSafeArea();
    measureRuntimePanel();

    if (!options.skipRender) {
      render({
        restoreToggleFocus: Boolean(options.restoreToggleFocus)
      });
      measureRuntimePanel();
    } else {
      scheduleMeasureRuntimePanel();
    }

    return runtimeState;
  }

  function setRuntimeCssNumber(name, value) {
    value = Math.max(0, Math.ceil(Number(value) || 0));
    document.documentElement.style.setProperty(name, value + "px");
    return value;
  }

  function measureRuntimePanel() {
    var footer = findFooter();
    var tail = ensureRuntimeTail();
    var panel = ensureRuntimePanel(false);
    var summary = panel ? panel.querySelector(".skhps-runtime-summary") : null;
    var traffic = panel ? panel.querySelector("[data-skhps-runtime-section='traffic-lights']") : null;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var footerHeight = 48;
    var footerDockBottom = 48;
    var panelTop = 0;
    var trafficTop = 0;
    var summaryHeight = 0;
    var fullHeight = 0;
    var tailHeight = 0;
    var tailSpacer = 0;
    var currentTailSpacer = 0;
    var naturalTailStart = 0;
    var dockedSummaryTop = 0;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var footerRect;
    var panelRect;
    var trafficRect;
    var tailRect;
    var tailStyle;

    if (footer) {
      footerRect = footer.getBoundingClientRect();
      footerHeight = Math.ceil(footerRect.height || footer.offsetHeight || 0) || 48;
      footerDockBottom = Math.max(0, Math.ceil(viewportHeight - footerRect.top)) || footerHeight;
    }

    if (panel) {
      panelRect = panel.getBoundingClientRect();
      panelTop = panelRect.top;
      trafficRect = traffic ? traffic.getBoundingClientRect() : null;
      trafficTop = trafficRect ? trafficRect.top : 0;

      if (traffic && typeof traffic.offsetTop === "number" && traffic.offsetTop > 0) {
        summaryHeight = Math.ceil(traffic.offsetTop);
      } else if (summary) {
        summaryHeight = Math.ceil((summary.offsetTop || 0) + (summary.offsetHeight || 0));
      } else if (trafficRect && trafficTop > panelTop) {
        summaryHeight = Math.max(0, Math.ceil(trafficTop - panelTop));
      } else {
        summaryHeight = 0;
      }

      fullHeight = Math.ceil(panel.scrollHeight || panelRect.height || 0);
    }

    if (tail) {
      tailRect = tail.getBoundingClientRect();
      try {
        tailStyle = window.getComputedStyle ? window.getComputedStyle(tail) : null;
        currentTailSpacer = tailStyle ? parseFloat(tailStyle.marginTop || "0") : cssPixelValue("--skhps-runtime-tail-spacer");
      } catch (error) {
        currentTailSpacer = cssPixelValue("--skhps-runtime-tail-spacer");
      }
      currentTailSpacer = isNaN(currentTailSpacer) ? 0 : currentTailSpacer;
      naturalTailStart = Math.max(0, Math.round(scrollY + tailRect.top - currentTailSpacer));
    } else {
      naturalTailStart = 0;
    }

    /*
     * 短頁修正：如果原本頁面高度不足、runtime-tail 的自然起點太高，
     * full 開啟時會一開始就切到奇怪的 flow 位置。
     * 這裡只在 full 狀態補一段 tail 前導距離，讓 flow 接點至少對齊
     * 「docked 掛畫時 summary cards 的上緣」。長頁 naturalTailStart 已經更低，spacer 會是 0。
     */
    if (runtimeState === "full" && fullHeight > 0) {
      dockedSummaryTop = Math.max(0, viewportHeight - (footerDockBottom || footerHeight || 48) - summaryHeight);
      tailSpacer = Math.max(0, Math.ceil((runtimeOpenScrollY || 0) + dockedSummaryTop - naturalTailStart));
    } else {
      tailSpacer = 0;
    }

    runtimeTailStart = naturalTailStart + tailSpacer;
    tailHeight = runtimeState === "full" ? fullHeight : 0;

    setRuntimeCssNumber("--skhps-footer-height", footerHeight || 48);
    setRuntimeCssNumber("--skhps-footer-dock-bottom", footerDockBottom || footerHeight || 48);
    setRuntimeCssNumber("--skhps-runtime-summary-height", summaryHeight);
    setRuntimeCssNumber("--skhps-runtime-full-height", fullHeight);
    setRuntimeCssNumber("--skhps-runtime-visible-height", fullHeight);
    setRuntimeCssNumber("--skhps-runtime-tail-height", tailHeight);
    setRuntimeCssNumber("--skhps-runtime-tail-spacer", tailSpacer);

    document.documentElement.setAttribute("data-skhps-runtime-tail-start", String(runtimeTailStart));
    document.documentElement.setAttribute("data-skhps-runtime-tail-spacer", String(tailSpacer));
    document.documentElement.setAttribute("data-skhps-runtime-flow-switch-y", String(Math.max(0, Math.round(runtimeTailStart - viewportHeight + (footerDockBottom || footerHeight || 48) + summaryHeight))));
    document.documentElement.setAttribute("data-skhps-footer-dock-bottom", String(footerDockBottom || footerHeight || 48));
    document.documentElement.setAttribute("data-skhps-runtime-visible-height", String(fullHeight));

    return {
      footerHeight: footerHeight,
      footerDockBottom: footerDockBottom,
      panelTop: panelTop,
      trafficTop: trafficTop,
      summaryHeight: summaryHeight,
      fullHeight: fullHeight,
      visibleHeight: fullHeight,
      maxVisibleHeight: Math.max(0, viewportHeight - (footerDockBottom || footerHeight || 48) - 8),
      tailHeight: tailHeight,
      tailSpacer: tailSpacer,
      naturalTailStart: naturalTailStart,
      progress: Math.max(0, scrollY - runtimeTailStart),
      viewportHeight: viewportHeight,
      runtimeTailStart: runtimeTailStart,
      flowSwitchY: Math.max(0, Math.round(runtimeTailStart - viewportHeight + (footerDockBottom || footerHeight || 48) + summaryHeight))
    };
  }

  function scheduleMeasureRuntimePanel() {
    if (measureRaf) return;

    measureRaf = window.requestAnimationFrame(function () {
      measureRaf = 0;
      measureRuntimePanel();
    });
  }

  function observeRuntimeSize() {
    var footer = findFooter();
    var tail = ensureRuntimeTail();
    var panel = document.getElementById("skhps-runtime-panel");
    var summary = panel ? panel.querySelector(".skhps-runtime-summary") : null;
    var traffic = panel ? panel.querySelector("[data-skhps-runtime-section='traffic-lights']") : null;

    if (typeof ResizeObserver !== "function") return;

    if (!runtimeResizeObserver) {
      runtimeResizeObserver = new ResizeObserver(scheduleMeasureRuntimePanel);
    }
    [footer, tail, panel, summary, traffic].forEach(function (node) {
      if (node) runtimeResizeObserver.observe(node);
    });
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

  function toggleRuntimePanel(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    if (runtimeState === "full") {
      var wasDocked = runtimeDocked;

      setRuntimeState("closed", {
        restoreToggleFocus: true
      });

      if (!wasDocked) {
        window.requestAnimationFrame(function () {
          window.scrollTo({
            top: 0,
            left: 0,
            behavior: "smooth"
          });
        });
      }
      return;
    }

    setRuntimeState("full", {
      docked: true,
      restoreToggleFocus: true
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
    toggle.textContent = runtimeState === "closed" ? "▲" : "▼";
    toggle.title = runtimeState === "closed" ? "展開 runtime" : (!runtimeDocked ? "關閉 runtime 並回到頁首" : "收合 runtime");
    toggle.setAttribute("aria-expanded", runtimeState === "closed" ? "false" : "true");
    toggle.setAttribute("aria-controls", "skhps-runtime-panel");
    toggle.addEventListener("click", toggleRuntimePanel);
    right.appendChild(toggle);

    footer.appendChild(left);
    footer.appendChild(center);
    footer.appendChild(right);
    ensureRuntimePanel(true);
    updateFooterSafeArea();
    observeFooterSize();
    observeRuntimeSize();
    scheduleMeasureRuntimePanel();

    if (options.restoreToggleFocus) {
      focusRuntimeToggle();
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

  function nearPageBottom() {
    var doc = document.documentElement;

    return (window.innerHeight || 0) + (window.scrollY || window.pageYOffset || doc.scrollTop || 0) >=
      doc.scrollHeight - 2;
  }

  function cssPixelValue(name) {
    var value = 0;

    try {
      value = parseFloat(
        (window.getComputedStyle ? window.getComputedStyle(document.documentElement) : document.documentElement.style)
          .getPropertyValue(name)
      );
    } catch (error) {
      value = 0;
    }

    return isNaN(value) ? 0 : value;
  }

  function runtimeFlowSwitchY() {
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var footerDockBottom = cssPixelValue("--skhps-footer-dock-bottom") || cssPixelValue("--skhps-footer-height") || 48;
    var summaryHeight = cssPixelValue("--skhps-runtime-summary-height");

    if (!runtimeTailStart) {
      measureRuntimePanel();
    }

    /*
     * docked → flow 的無跳接點：
     * docked panel 的 summary top = viewport bottom - footerDockBottom - summaryHeight。
     * flow panel 的 top = runtimeTailStart - scrollY。
     * 兩者相等時切換，視覺上同一張 runtime 會從 footer 掛畫自然接回頁尾 flow。
     */
    return Math.max(0, Math.round(runtimeTailStart - viewportHeight + footerDockBottom + summaryHeight));
  }

  function syncRuntimeDockingWithScroll(direction) {
    var currentY;
    var switchY;

    if (runtimeState !== "full") return;

    currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    switchY = runtimeFlowSwitchY();

    if (runtimeDocked && direction === "down" && currentY >= switchY - 2) {
      setRuntimeState("full", {
        docked: false,
        skipRender: true
      });
      scheduleMeasureRuntimePanel();
      return;
    }

    if (!runtimeDocked && direction === "up" && currentY < switchY - 2) {
      setRuntimeState("full", {
        docked: true,
        skipRender: true
      });
      scheduleMeasureRuntimePanel();
    }
  }

  function handleRuntimeWheel(event) {
    if (!event || loadingLocked()) {
      if (loadingLocked() && runtimeState !== "closed") {
        setRuntimeState("closed");
      }
      return;
    }

    /*
     * 重要：runtime 只能由 footer 箭頭開啟。
     * closed 狀態下即使使用者滑到頁面底部、繼續往下滾，也不可自動展開 runtime。
     * 只有已經由箭頭進入 full 後，才允許依 scroll 位置在 docked/flow 之間切換。
     */

    if (event.deltaY > 0 && runtimeState === "full" && runtimeDocked) {
      syncRuntimeDockingWithScroll("down");
      return;
    }

    if (event.deltaY < 0 && runtimeState === "full") {
      syncRuntimeDockingWithScroll("up");
      scheduleMeasureRuntimePanel();
    }
  }

  function handleRuntimeScroll() {
    var currentY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    var direction = currentY > lastScrollY ? "down" : currentY < lastScrollY ? "up" : lastScrollDirection;

    lastScrollDirection = direction;
    lastScrollY = currentY;

    if (loadingLocked()) {
      if (runtimeState !== "closed") {
        setRuntimeState("closed");
      }
      return;
    }

    if (runtimeState === "full") {
      syncRuntimeDockingWithScroll(direction);
      scheduleMeasureRuntimePanel();
    }
  }

  function handleLoadingReleased() {
    if (loadingLocked()) {
      setRuntimeState("closed");
      return;
    }

    if (!document.documentElement.getAttribute("data-skhps-runtime-state")) {
      setRuntimeState("closed");
    } else {
      scheduleMeasureRuntimePanel();
    }
  }

  function installRuntimeInteractions() {
    window.addEventListener("wheel", handleRuntimeWheel, {
      passive: true
    });
    window.addEventListener("scroll", handleRuntimeScroll, {
      passive: true
    });
    window.addEventListener("resize", scheduleMeasureRuntimePanel);
    window.addEventListener("orientationchange", scheduleMeasureRuntimePanel);

    if (document.fonts && typeof document.fonts.ready === "object") {
      document.fonts.ready.then(scheduleMeasureRuntimePanel).catch(function () {});
    }

    document.addEventListener("skhps-css-sheet-runtime-ready", scheduleMeasureRuntimePanel);
    document.addEventListener("skhps-external-app-loader-ready", scheduleMeasureRuntimePanel);
    document.addEventListener("skhps-runtime-updated", scheduleMeasureRuntimePanel);
  }

  function boot() {
    if (booted) {
      render();
      return;
    }

    booted = true;
    setRuntimeState("closed", {
      skipRender: true
    });
    ensureRuntimePanel(true);
    render();

    document.addEventListener("skhps-runtime-updated", render);
    document.addEventListener("skhps-css-sheet-runtime-ready", render);
    document.addEventListener("skhps-external-app-loader-ready", render);
    window.addEventListener("resize", updateFooterSafeArea);
    installRuntimeInteractions();
    handleLoadingReleased();
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
    setRuntimeState: setRuntimeState,
    setRuntimeDocked: setRuntimeDocked,
    measureRuntimePanel: measureRuntimePanel,
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
