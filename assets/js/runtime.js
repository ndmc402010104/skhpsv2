/*
檔案位置：skhpsv2/assets/js/runtime.js
時間戳記：2026-06-11 UTC+8
用途：SKHPS runtime diagnostics state；集中記錄環境、config/backend/css/loading gate、模組狀態與最近 logs。
*/

(function () {
  "use strict";

  var MAX_LOGS = 200;
  var PANEL_ID = "skhps-runtime-panel";
  var STYLE_ID = "skhps-runtime-panel-style";
  var expandedFlowCards = {};
  var expandAllFlowCards = false;
  var preRuntimeLogQueue = window.SKHPSRuntimeLog && Array.isArray(window.SKHPSRuntimeLog.__queue)
    ? window.SKHPSRuntimeLog.__queue.slice()
    : [];

  function nowIso() {
    return new Date().toISOString();
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function normalizeError(error) {
    if (!error) return "";
    if (error.message) return String(error.message);
    return String(error);
  }

  function inferCategory(source) {
    source = String(source || "").toLowerCase();
    if (source.indexOf("backend") >= 0) return "backend";
    if (source.indexOf("css") >= 0) return "css";
    if (source.indexOf("loading") >= 0) return "loading";
    if (source.indexOf("config") >= 0) return "runtime";
    if (source.indexOf("external-app") >= 0) return "external-app";
    if (source.indexOf("bootstrap") >= 0 || source.indexOf("loader") >= 0) return "script";
    return "runtime";
  }

  function normalizeStatus(status, level, message) {
    status = String(status || "").trim().toUpperCase();
    if (status === "RUNNING" || status === "PENDING" || status === "START") return "RUN";
    if (status === "DONE" || status === "LOADED" || status === "SUCCESS") return "OK";
    if (status === "ERROR" || status === "FAILED") return "FAIL";
    if (status === "INFO") return "INFO";
    if (status === "RUN" || status === "OK" || status === "FAIL" || status === "WARN") return status;

    level = String(level || "").toLowerCase();
    message = String(message || "").toLowerCase();
    if (level === "error" || message.indexOf("error") >= 0 || message.indexOf("failed") >= 0) return "FAIL";
    if (level === "warn" || message.indexOf("warn") >= 0 || message.indexOf("fallback") >= 0) return "WARN";
    if (message === "done" || message.indexOf("-done") >= 0 || message.indexOf("ready") >= 0 || message.indexOf("loaded") >= 0) return "OK";
    if (message === "started" || message.indexOf("start") >= 0 || message.indexOf("pending") >= 0) return "RUN";
    return "INFO";
  }

  function normalizeRuntimeEntry(payload) {
    payload = payload || {};
    var data = payload.data || payload.detail || null;
    var dataObject = data && typeof data === "object" ? data : {};
    var source = payload.source || dataObject.source || dataObject.file || payload.module || "runtime";
    var action = payload.action || dataObject.action || payload.message || "";
    var status = normalizeStatus(payload.status || dataObject.status, payload.level, payload.message || action);
    var detail = payload.detail !== undefined ? payload.detail : data;

    if (detail && typeof detail === "object" && detail.detail !== undefined) {
      detail = detail.detail;
    }

    return {
      timestamp: payload.timestamp || nowIso(),
      level: payload.level || (status === "FAIL" ? "error" : status === "WARN" ? "warn" : status === "RUN" ? "debug" : "info"),
      module: payload.module || source,
      message: payload.message || action || "",
      data: data,
      source: source,
      category: payload.category || dataObject.category || inferCategory(source),
      action: action || payload.message || "",
      status: status,
      detail: detail === undefined ? null : detail,
      durationMs: payload.durationMs !== undefined ? payload.durationMs : dataObject.durationMs
    };
  }

  function hostEnvFromLocation() {
    var protocol = String(window.location.protocol || "").toLowerCase();
    var host = String(window.location.hostname || "").toLowerCase();

    if (protocol === "file:" || host === "" || host === "localhost" || host === "127.0.0.1") {
      return "LOCAL";
    }

    if (host === "skhps.jonaminz.com" || host === "quick-login.skhps.jonaminz.com") {
      return "PROD";
    }

    if (host === "dev-skhps.jonaminz.com" || host === "dev-quick-login.skhps.jonaminz.com") {
      return "DEV";
    }

    return "UNKNOWN";
  }

  function normalizeRuntime(value) {
    value = String(value || "").trim().toLowerCase();

    if (value === "local-dev" || value === "local") return "LOCAL";
    if (value === "dev") return "DEV";
    if (value === "prod" || value === "production") return "PROD";
    if (value === "auto" || value === "none" || value === "") return "";

    return value.toUpperCase();
  }

  function queryRuntime() {
    try {
      var params = new URLSearchParams(window.location.search || "");
      return params.get("runtime") || params.get("skhpsRuntime") || "";
    } catch (error) {
      return "";
    }
  }

  function initialRequestedRuntime() {
    return normalizeRuntime(queryRuntime()) || "auto";
  }

  function runtimeDecision(hostEnv, requested, defaultRuntime) {
    var requestedRuntime = normalizeRuntime(requested);
    var fallback = normalizeRuntime(defaultRuntime) || "PROD";

    if (requestedRuntime) {
      return {
        effective: requestedRuntime,
        overrideReason: "URL parameter override",
        fallbackReason: ""
      };
    }

    if (hostEnv && hostEnv !== "UNKNOWN") {
      return {
        effective: hostEnv,
        overrideReason: "",
        fallbackReason: ""
      };
    }

    return {
      effective: fallback,
      overrideReason: "",
      fallbackReason: "Host Env UNKNOWN; fallback to " + fallback
    };
  }

  var state = {
    startedAt: nowIso(),
    host: {
      hostname: window.location.hostname || "",
      env: hostEnvFromLocation()
    },
    runtime: {
      requested: initialRequestedRuntime(),
      effective: "",
      overrideReason: "",
      fallbackReason: ""
    },
    config: {
      loaded: false,
      source: "",
      durationMs: null
    },
    backend: {
      loaded: false,
      endpoint: "",
      env: "",
      healthy: null,
      durationMs: null,
      calls: []
    },
    cssRuntime: {
      loaded: false,
      source: "",
      durationMs: null
    },
    externalApps: {
      loaded: false,
      count: null,
      env: "",
      error: "",
      durationMs: null
    },
    loadingGate: {
      requiredTasks: [],
      completedTasks: [],
      failedTasks: [],
      releaseReason: ""
    },
    data: {
      task: "",
      status: "",
      message: "",
      detail: null,
      updatedAt: ""
    },
    modules: {},
    logs: []
  };

  state.runtime = Object.assign(
    state.runtime,
    runtimeDecision(state.host.env, state.runtime.requested, "")
  );

  function emitUpdated() {
    try {
      document.dispatchEvent(new CustomEvent("skhps-runtime-updated", {
        detail: getState()
      }));
    } catch (error) {}

    scheduleRender();
  }

  function log(payload) {
    var entry;

    try {
      entry = normalizeRuntimeEntry(payload || {});
    } catch (error) {
      entry = {
        timestamp: nowIso(),
        level: "error",
        module: "runtime",
        message: "runtime log normalize failed",
        data: normalizeError(error),
        source: "runtime.js",
        category: "runtime",
        action: "log",
        status: "FAIL",
        detail: normalizeError(error),
        durationMs: null
      };
    }

    state.logs.push(entry);

    if (state.logs.length > MAX_LOGS) {
      state.logs = state.logs.slice(state.logs.length - MAX_LOGS);
    }

    emitUpdated();
    return entry;
  }

  function start(moduleName) {
    moduleName = String(moduleName || "").trim();
    if (!moduleName) return;

    state.modules[moduleName] = Object.assign({}, state.modules[moduleName] || {}, {
      status: "waiting",
      startedAt: nowIso(),
      doneAt: "",
      durationMs: null,
      error: ""
    });

    log({
      level: "info",
      module: moduleName,
      message: "started",
      source: moduleName,
      category: inferCategory(moduleName),
      action: "moduleStart",
      status: "RUN"
    });
  }

  function done(moduleName, extraData) {
    moduleName = String(moduleName || "").trim();
    if (!moduleName) return;

    var moduleState = state.modules[moduleName] || {};
    var started = moduleState.startedAt ? Date.parse(moduleState.startedAt) : NaN;
    var finishedAt = nowIso();

    state.modules[moduleName] = Object.assign({}, moduleState, extraData || {}, {
      status: "ok",
      doneAt: finishedAt,
      durationMs: isNaN(started) ? moduleState.durationMs || null : Date.now() - started,
      error: ""
    });

    log({
      level: "info",
      module: moduleName,
      message: "done",
      data: extraData || null,
      source: moduleName,
      category: inferCategory(moduleName),
      action: "moduleReady",
      status: "OK"
    });
  }

  function fail(moduleName, error, extraData) {
    moduleName = String(moduleName || "").trim();
    if (!moduleName) return;

    var moduleState = state.modules[moduleName] || {};
    var started = moduleState.startedAt ? Date.parse(moduleState.startedAt) : NaN;
    var failedAt = nowIso();
    var message = normalizeError(error);

    state.modules[moduleName] = Object.assign({}, moduleState, extraData || {}, {
      status: "fail",
      doneAt: failedAt,
      durationMs: isNaN(started) ? moduleState.durationMs || null : Date.now() - started,
      error: message
    });

    log({
      level: "error",
      module: moduleName,
      message: message || "failed",
      data: extraData || null,
      source: moduleName,
      category: inferCategory(moduleName),
      action: "moduleFail",
      status: "FAIL"
    });
  }

  function mergeSection(name, data) {
    state[name] = Object.assign({}, state[name] || {}, data || {});
    emitUpdated();
  }

  function setHost(data) {
    mergeSection("host", data);
  }

  function setRuntime(data) {
    data = data || {};

    var patch = Object.assign({}, data);
    if (patch.requested) patch.requested = normalizeRuntime(patch.requested) || patch.requested;

    var requested = normalizeRuntime(patch.requested || state.runtime.requested);
    var proposedEffective = normalizeRuntime(patch.effective);
    var defaultRuntime = normalizeRuntime(patch.defaultRuntime || patch.fallback || "");
    var decision;

    if (requested) {
      decision = runtimeDecision(state.host && state.host.env, requested, defaultRuntime);
    } else if (proposedEffective) {
      decision = {
        effective: proposedEffective,
        overrideReason: patch.overrideReason || "",
        fallbackReason: patch.fallbackReason ||
          (state.host && state.host.env === "UNKNOWN" ? "Host Env UNKNOWN; fallback to " + proposedEffective : state.runtime.fallbackReason || "")
      };
    } else {
      decision = runtimeDecision(state.host && state.host.env, "", defaultRuntime);
    }

    patch.effective = decision.effective;
    patch.overrideReason = patch.overrideReason || decision.overrideReason || "";
    patch.fallbackReason = patch.fallbackReason || decision.fallbackReason || "";

    mergeSection("runtime", patch);
  }

  function setConfig(data) {
    mergeSection("config", data);
  }

  function setBackend(data) {
    mergeSection("backend", data);
  }

  function setBackendCall(data) {
    data = data || {};

    var callId = String(
      data.callId ||
      data.id ||
      [
        data.action || "unknown",
        data.resourceType || "resource",
        data.resourceName || "",
        data.startedAt || ""
      ].join("::")
    );
    var calls = state.backend.calls || [];
    var index = -1;

    calls.forEach(function (item, itemIndex) {
      if (String(item.callId || "") === callId) {
        index = itemIndex;
      }
    });

    var next = Object.assign({
      callId: callId,
      action: "",
      resourceType: "unknown",
      resourceName: "",
      status: "running",
      durationMs: null,
      error: "",
      startedAt: nowIso(),
      finishedAt: ""
    }, index >= 0 ? calls[index] : {}, data, {
      callId: callId
    });

    if (index >= 0) {
      calls[index] = next;
    } else {
      calls.push(next);
    }

    if (calls.length > 80) {
      calls = calls.slice(calls.length - 80);
    }

    state.backend.calls = calls;
    emitUpdated();
  }

  function setDataStatus(data) {
    data = data || {};

    var status = String(data.status || data.state || "").trim().toLowerCase();
    var allowed = {
      ok: true,
      green: true,
      success: true,
      warn: true,
      warning: true,
      yellow: true,
      fail: true,
      failed: true,
      error: true,
      red: true,
      waiting: true,
      loading: true,
      pending: true,
      run: true,
      gray: true,
      idle: true
    };

    if (!allowed[status]) status = status ? "warn" : "";

    mergeSection("data", {
      task: String(data.task || data.name || state.data.task || "").trim(),
      status: status,
      message: String(data.message || data.error || "").trim(),
      detail: data.detail || data.data || null,
      updatedAt: nowIso()
    });

    log({
      level: status === "fail" || status === "failed" || status === "error" || status === "red" ? "error" : "info",
      module: "data",
      message: data.message || data.task || "data status updated",
      data: data.detail || data.data || null,
      source: data.source || "runtime.js",
      category: "data",
      action: "setDataStatus",
      status: status === "fail" || status === "failed" || status === "error" || status === "red" ? "FAIL" :
        status === "warn" || status === "warning" || status === "yellow" ? "WARN" :
          status === "waiting" || status === "loading" || status === "pending" || status === "run" ? "RUN" : "OK"
    });
  }

  function setCssRuntime(data) {
    mergeSection("cssRuntime", data);
  }

  function setExternalApps(data) {
    mergeSection("externalApps", data);
  }

  function uniqueList(items) {
    var out = [];
    (Array.isArray(items) ? items : String(items || "").split(",")).forEach(function (item) {
      item = String(item || "").trim();
      if (item && out.indexOf(item) < 0) out.push(item);
    });
    return out;
  }

  function setLoadingRequired(tasks) {
    state.loadingGate.requiredTasks = uniqueList(tasks);
    emitUpdated();
  }

  function setLoadingGate(data) {
    state.loadingGate = Object.assign({}, state.loadingGate || {}, data || {});
    emitUpdated();
  }

  function taskDone(taskName) {
    taskName = String(taskName || "").trim();
    if (!taskName) return;

    if (state.loadingGate.requiredTasks.indexOf(taskName) < 0) {
      state.loadingGate.requiredTasks.push(taskName);
    }

    if (state.loadingGate.completedTasks.indexOf(taskName) < 0) {
      state.loadingGate.completedTasks.push(taskName);
    }

    state.loadingGate.failedTasks = state.loadingGate.failedTasks.filter(function (item) {
      return item.task !== taskName;
    });

    emitUpdated();
  }

  function taskFailed(taskName, error) {
    taskName = String(taskName || "").trim();
    if (!taskName) return;

    if (state.loadingGate.requiredTasks.indexOf(taskName) < 0) {
      state.loadingGate.requiredTasks.push(taskName);
    }

    if (state.loadingGate.completedTasks.indexOf(taskName) < 0) {
      state.loadingGate.completedTasks.push(taskName);
    }

    state.loadingGate.failedTasks = state.loadingGate.failedTasks.filter(function (item) {
      return item.task !== taskName;
    });
    state.loadingGate.failedTasks.push({
      task: taskName,
      error: normalizeError(error) || "failed"
    });

    emitUpdated();
  }

  function getState() {
    return clone(state);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    if (!document.head) return;

    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".skhps-runtime-panel{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#101820;color:#f5f7fb;border-top:1px solid rgba(255,255,255,.14);padding:16px;line-height:1.5;font-size:13px;max-width:100%;box-sizing:border-box;overflow-x:hidden}",
      ".skhps-runtime-panel *{box-sizing:border-box;min-width:0}",
      ".skhps-runtime-panel a,.skhps-runtime-panel span,.skhps-runtime-panel div,.skhps-runtime-panel p{max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-panel pre,.skhps-runtime-panel code{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-panel table{width:100%;table-layout:fixed}",
      ".skhps-runtime-panel td,.skhps-runtime-panel th{overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-panel.is-hidden{display:none}",
      ".skhps-runtime-section{margin:0 0 14px}",
      ".skhps-runtime-title{font-weight:700;margin:0 0 6px;color:#ffffff}",
      ".skhps-runtime-row{display:grid;grid-template-columns:minmax(120px,auto) minmax(0,1fr);gap:8px;border-bottom:1px solid rgba(255,255,255,.08);padding:3px 0;align-items:start}",
      ".skhps-runtime-row strong{color:#b8d7ff;overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-row-value{display:block;max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:8px;margin:0 0 14px}",
      ".skhps-runtime-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:8px;padding:10px;min-width:0;max-width:100%}",
      ".skhps-runtime-card-label{display:block;color:#9fb1c7;font-size:12px;margin:0 0 3px}",
      ".skhps-runtime-card-value{display:block;font-weight:700;color:#fff;max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-checklist{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr));gap:6px}",
      ".skhps-runtime-checkitem{display:flex;align-items:flex-start;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:7px;background:rgba(255,255,255,.035);min-width:0;max-width:100%}",
      ".skhps-runtime-checkmark{flex:0 0 auto;width:22px;text-align:center;font-weight:700}",
      ".skhps-runtime-checkbody{min-width:0;max-width:100%;flex:1 1 auto}",
      ".skhps-runtime-checkname{font-weight:700;color:#fff;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-checkmeta{color:#aebbd0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-flow{display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%}",
      ".skhps-runtime-flow-card{position:relative;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:8px;padding:10px;width:100%;box-sizing:border-box}",
      ".skhps-runtime-flow-card.is-collapsed{padding-bottom:8px}",
      ".skhps-runtime-flow-card.is-collapsed .skhps-runtime-flow-head{border-bottom:0;margin-bottom:0;padding-bottom:0}",
      ".skhps-runtime-flow-card.is-collapsed .skhps-runtime-flow-steps{display:none}",
      ".skhps-runtime-flow-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:7px;margin-bottom:7px}",
      ".skhps-runtime-flow-head>div:first-child{min-width:0;max-width:100%;flex:1 1 auto}",
      ".skhps-runtime-flow-toggle{appearance:none;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;margin:0;cursor:pointer;display:block;width:100%}",
      ".skhps-runtime-flow-toggle:hover .skhps-runtime-flow-title,.skhps-runtime-flow-toggle:focus-visible .skhps-runtime-flow-title{color:#d6e8ff}",
      ".skhps-runtime-flow-number{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;border-radius:999px;background:rgba(184,215,255,.16);color:#b8d7ff;font-size:12px;font-weight:700;margin-right:6px}",
      ".skhps-runtime-flow-title{font-weight:700;color:#fff;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-flow-meta{color:#aebbd0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;white-space:normal;margin-top:2px}",
      ".skhps-runtime-flow-status{font-weight:700;white-space:nowrap;flex:0 0 auto}",
      ".skhps-runtime-flow-steps{position:relative;display:flex;flex-direction:column;gap:0;padding:4px 0 2px}",
      ".skhps-runtime-flow-step{position:relative;display:grid;grid-template-columns:84px minmax(0,1fr);gap:16px;align-items:start;padding:8px 0}",
      ".skhps-runtime-flow-step::before{content:'';position:absolute;left:15px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.18)}",
      ".skhps-runtime-flow-step:first-child::before{top:16px}",
      ".skhps-runtime-flow-step:last-child::before{bottom:calc(100% - 16px)}",
      ".skhps-runtime-flow-step:only-child::before{display:none}",
      ".skhps-runtime-flow-step-status{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;min-width:70px;width:max-content;padding:0 10px;border-radius:0;background:#101820;font-weight:800;font-size:12px;white-space:nowrap}",
      ".skhps-runtime-flow-step-body{min-width:0}",
      ".skhps-runtime-flow-step-name{color:#eef4ff;overflow-wrap:anywhere;word-break:break-word;white-space:normal;font-weight:700;font-size:14px}",
      ".skhps-runtime-flow-step-detail{color:#aebbd0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-flow-note{color:#aebbd0;font-size:12px;margin:-4px 0 8px}",
      "@media (max-width:720px){.skhps-runtime-row{grid-template-columns:1fr;gap:2px}.skhps-runtime-flow-step{grid-template-columns:70px minmax(0,1fr);gap:10px}.skhps-runtime-flow-step-status{min-width:58px;padding:0 6px}.skhps-runtime-flow-step::before{left:13px}}",
      ".skhps-runtime-call-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:8px}",
      ".skhps-runtime-call{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);border-radius:8px;padding:9px;min-width:0;max-width:100%}",
      ".skhps-runtime-call-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}",
      ".skhps-runtime-call-title{font-weight:700;color:#fff;min-width:0;flex:1 1 auto;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-call-status{font-weight:700;white-space:nowrap;flex:0 0 auto}",
      ".skhps-runtime-call-meta{color:#aebbd0;font-size:12px;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-ok{color:#8ee69f}",
      ".skhps-runtime-fail{color:#ff9a9a}",
      ".skhps-runtime-waiting{color:#ffd479}",
      ".skhps-runtime-log{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#d8e1ef;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-title-row{display:flex;align-items:center;justify-content:space-between;gap:10px}",
      ".skhps-runtime-copy-btn{border:1px solid rgba(255,255,255,.16);border-radius:6px;background:rgba(255,255,255,.06);color:#d8e1ef;font:inherit;font-size:12px;font-weight:800;padding:5px 9px;cursor:pointer;white-space:nowrap}",
      ".skhps-runtime-copy-btn:hover,.skhps-runtime-copy-btn:focus-visible{background:rgba(255,255,255,.12);color:#fff}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function statusClass(status) {
    status = String(status || "").toLowerCase();
    if (status === "ok" || status === "done" || status === "loaded" || status === "true") {
      return "skhps-runtime-ok";
    }
    if (status === "fail" || status === "failed" || status === "error" || status === "false") {
      return "skhps-runtime-fail";
    }
    return "skhps-runtime-waiting";
  }

  function text(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return String(value);
  }

  function compactText(value, maxLength) {
    value = text(value);
    maxLength = maxLength || 140;

    if (value.length > maxLength) {
      return value.slice(0, maxLength - 3) + "...";
    }

    return value;
  }

  function logSource(entry) {
    var data = entry && entry.data ? entry.data : {};
    var file = data.file || data.sourceFile || "";
    var fn = data.functionName || data.function || data.fn || "";

    if (file && fn) return file + "::" + fn;
    if (file) return file;
    if (fn) return entry.module + "::" + fn;

    return entry.module || "runtime";
  }

  function logDetail(entry) {
    var data = entry && entry.data ? entry.data : null;
    var parts = [];

    if (!data || typeof data !== "object") {
      return data ? " | " + compactText(data) : "";
    }

    if (data.scriptPath) parts.push("script=" + data.scriptPath);
    if (data.path && !data.scriptPath) parts.push("path=" + data.path);
    if (data.source) parts.push("source=" + data.source);
    if (data.action) parts.push("action=" + data.action);
    if (data.url || data.scriptUrl) parts.push("url=" + (data.url || data.scriptUrl));
    if (data.error) parts.push("error=" + data.error);

    if (!parts.length) {
      return " | data=" + compactText(data);
    }

    return " | " + compactText(parts.join(" | "), 220);
  }

  function addCard(parent, label, value, className) {
    var card = document.createElement("div");
    card.className = "skhps-runtime-card";

    var labelEl = document.createElement("span");
    labelEl.className = "skhps-runtime-card-label";
    labelEl.textContent = label;

    var valueEl = document.createElement("span");
    valueEl.className = "skhps-runtime-card-value " + (className || "");
    valueEl.textContent = text(value);

    card.appendChild(labelEl);
    card.appendChild(valueEl);
    parent.appendChild(card);
  }

  function addRow(parent, label, value, className) {
    var row = document.createElement("div");
    row.className = "skhps-runtime-row";

    var key = document.createElement("strong");
    key.textContent = label;

    var val = document.createElement("span");
    val.className = "skhps-runtime-row-value" + (className ? " " + className : "");
    val.textContent = text(value);

    row.appendChild(key);
    row.appendChild(val);
    parent.appendChild(row);
  }

  function addSection(panel, title) {
    var section = document.createElement("section");
    section.className = "skhps-runtime-section";
    section.setAttribute("data-skhps-runtime-section", String(title || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""));

    var heading = document.createElement("h2");
    heading.className = "skhps-runtime-title";
    heading.textContent = title;

    section.appendChild(heading);
    panel.appendChild(section);
    return section;
  }

  function formatRuntimeLog(entry) {
    return [
      entry.timestamp,
      "[" + entry.level + "] " + logSource(entry) + " - " + entry.message + logDetail(entry)
    ].filter(Boolean).join("\n");
  }

  function copyText(textValue, button) {
    function done(ok) {
      if (!button) return;
      var original = button.getAttribute("data-original-text") || button.textContent || "Copy";
      button.textContent = ok ? "Copied" : "Failed";
      window.setTimeout(function () {
        button.textContent = original;
      }, 1200);
    }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(textValue).then(function () {
        done(true);
      }).catch(function () {
        done(false);
      });
      return;
    }

    try {
      var textarea = document.createElement("textarea");
      textarea.value = textValue;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      done(document.execCommand("copy"));
      document.body.removeChild(textarea);
    } catch (error) {
      done(false);
    }
  }

  function addSectionAction(section, label, title, onClick) {
    var heading = section.querySelector(".skhps-runtime-title");
    if (!heading) return null;

    var row = document.createElement("div");
    row.className = "skhps-runtime-title-row";

    var button = document.createElement("button");
    button.type = "button";
    button.className = "skhps-runtime-copy-btn";
    button.textContent = label;
    button.setAttribute("data-original-text", label);
    button.title = title || label;
    button.addEventListener("click", onClick);

    section.insertBefore(row, heading);
    row.appendChild(heading);
    row.appendChild(button);
    return button;
  }

  function latestLogMatch(test) {
    var i;

    for (i = state.logs.length - 1; i >= 0; i -= 1) {
      if (test(state.logs[i])) {
        return state.logs[i];
      }
    }

    return null;
  }

  function summarizeLoadingGate() {
    var required = state.loadingGate.requiredTasks || [];
    var completed = state.loadingGate.completedTasks || [];
    var failed = state.loadingGate.failedTasks || [];

    if (failed.length) {
      return {
        label: "有任務失敗",
        className: "skhps-runtime-fail"
      };
    }

    if (required.length && completed.length >= required.length) {
      return {
        label: "全部完成",
        className: "skhps-runtime-ok"
      };
    }

    if (required.length) {
      return {
        label: "等待中 " + completed.length + "/" + required.length,
        className: "skhps-runtime-waiting"
      };
    }

    return {
      label: "尚未宣告任務",
      className: "skhps-runtime-waiting"
    };
  }

  function summarizeConfig() {
    if (state.config && state.config.error) {
      return {
        label: state.config.error,
        className: "skhps-runtime-fail",
        reason: state.config.error
      };
    }

    if (state.config && state.config.loaded) {
      return {
        label: "loaded",
        className: "skhps-runtime-ok",
        reason: state.config.source || "config loaded"
      };
    }

    return {
      label: "waiting",
      className: "skhps-runtime-waiting",
      reason: "config not loaded"
    };
  }

  function summarizeBackend() {
    if (state.backend && state.backend.healthy === false) {
      return {
        label: state.backend.error || "unhealthy",
        className: "skhps-runtime-fail",
        reason: state.backend.endpoint || state.backend.error || "backend unhealthy"
      };
    }

    if (state.backend && state.backend.loaded) {
      return {
        label: state.backend.healthy === true ? "healthy" : "loaded",
        className: "skhps-runtime-ok",
        reason: state.backend.endpoint || "backend loaded"
      };
    }

    return {
      label: "waiting",
      className: "skhps-runtime-waiting",
      reason: "backend not loaded"
    };
  }

  function summarizeCssRuntime() {
    if (state.cssRuntime && state.cssRuntime.loaded) {
      return {
        label: state.cssRuntime.source || "loaded",
        className: "skhps-runtime-ok",
        reason: state.cssRuntime.source || "css runtime loaded"
      };
    }

    return {
      label: "waiting",
      className: "skhps-runtime-waiting",
      reason: "css runtime not loaded"
    };
  }

  function summarizeData() {
    var data = state.data || {};
    var status = String(data.status || "").toLowerCase();
    var label = data.message || data.task || "not specified";

    if (status === "ok" || status === "green" || status === "success") {
      return {
        label: label,
        className: "skhps-runtime-ok",
        reason: data.task || "data ok"
      };
    }

    if (status === "fail" || status === "failed" || status === "error" || status === "red") {
      return {
        label: label,
        className: "skhps-runtime-fail",
        reason: data.task || "data failed"
      };
    }

    if (status === "warn" || status === "warning" || status === "yellow") {
      return {
        label: label,
        className: "skhps-runtime-waiting",
        reason: data.task || "data warning"
      };
    }

    if (status === "waiting" || status === "loading" || status === "pending" || status === "run") {
      return {
        label: label,
        className: "skhps-runtime-waiting",
        reason: data.task || "data loading"
      };
    }

    return {
      label: "not specified",
      className: "skhps-runtime-waiting",
      reason: "page data status not reported"
    };
  }

  function summarizeOverall() {
    var failedModule = Object.keys(state.modules).find(function (name) {
      return state.modules[name] && state.modules[name].status === "fail";
    });
    var latestError = latestLogMatch(function (entry) {
      return entry.level === "error";
    });
    var registerStart = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:register-start";
    });
    var registerDone = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:register-done";
    });
    var registerError = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:register-error";
    });
    var ready = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:ready";
    });
    var gate = summarizeLoadingGate();

    if (failedModule || latestError) {
      return {
        label: "有錯誤需要處理",
        className: "skhps-runtime-fail"
      };
    }

    if (registerError) {
      return {
        label: "App 已載入，報到失敗",
        className: "skhps-runtime-waiting"
      };
    }

    if (ready && registerStart && !registerDone) {
      return {
        label: "App 已載入，背景報到中",
        className: "skhps-runtime-waiting"
      };
    }

    if (ready) {
      return {
        label: "外部 App 已載入",
        className: "skhps-runtime-ok"
      };
    }

    if (gate.className === "skhps-runtime-ok") {
      return {
        label: "核心載入完成",
        className: "skhps-runtime-ok"
      };
    }

    return {
      label: "載入中",
      className: "skhps-runtime-waiting"
    };
  }

  function scriptStatusFromLogs() {
    var scripts = {};

    state.logs.forEach(function (entry, index) {
      var data = entry && entry.data ? entry.data : {};
      var scriptPath = data.scriptPath || data.scriptUrl || data.url || "";

      if (entry.category !== "script" && !scriptPath) return;
      if (!scriptPath && entry.detail) scriptPath = String(entry.detail || "");
      if (!scriptPath || entry.action === "bootstrapStart" || entry.action === "bootstrapDone") return;

      scripts[scriptPath] = scripts[scriptPath] || {
        path: scriptPath,
        url: data.scriptUrl || data.url || "",
        optional: Boolean(data.optional),
        status: "waiting",
        error: "",
        durationMs: null,
        firstIndex: index,
        lastIndex: index
      };

      scripts[scriptPath].lastIndex = index;

      if (entry.action === "loadScript" || entry.status === "RUN" || entry.message.indexOf("-start ") >= 0) {
        scripts[scriptPath].status = "waiting";
      }

      if (entry.action === "scriptLoaded" || entry.status === "OK" || entry.message.indexOf("-loaded ") >= 0) {
        scripts[scriptPath].status = "ok";
        scripts[scriptPath].error = "";
        scripts[scriptPath].durationMs = entry.durationMs;
      }

      if (entry.action === "scriptError" || entry.status === "FAIL" || entry.message.indexOf("-error") >= 0 || data.error) {
        scripts[scriptPath].status = data.optional ? "warn" : "fail";
        scripts[scriptPath].error = data.error || entry.message;
      }
    });

    return Object.keys(scripts).map(function (key) {
      return scripts[key];
    });
  }

  function getDomState() {
    var html = document.documentElement;
    var body = document.body;
    var header = document.querySelector("header, #header, [data-skhps-header]");
    var footer = document.querySelector("footer, [data-skhps-footer]");

    function visible(el) {
      if (!el) return false;
      var style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (!style) return true;
      return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    }

    return {
      readyState: document.readyState,
      htmlCssLoading: html.classList.contains("skhps-css-loading"),
      htmlLoading: html.classList.contains("skhps-loading"),
      shellLoading: html.classList.contains("skhps-shell-loading"),
      mainLoading: html.classList.contains("skhps-main-loading"),
      bodyVisible: visible(body),
      headerExists: Boolean(header),
      headerVisible: visible(header),
      footerExists: Boolean(footer),
      footerVisible: visible(footer),
      loadingReleased: html.getAttribute("data-skhps-loading-released") === "true",
      loadingReleaseReason: html.getAttribute("data-skhps-loading-release-reason") || "",
      shellReady: html.getAttribute("data-skhps-shell-ready") === "true",
      pageReady: html.getAttribute("data-skhps-page-ready") === "true",
      cssRuntimeReady: html.getAttribute("data-skhps-css-ready") === "true" || Boolean(state.cssRuntime.loaded)
    };
  }

  function actionStatusFromLogs() {
    var actions = {};

    state.logs.forEach(function (entry, index) {
      var data = entry && entry.data ? entry.data : {};
      var action = data.action || "";

      if (!action) return;

      actions[action] = actions[action] || {
        path: action,
        url: data.pageUrl || data.href || "",
        status: "waiting",
        error: "",
        firstIndex: index,
        lastIndex: index
      };

      actions[action].lastIndex = index;

      if (entry.message.indexOf("-start") >= 0) {
        actions[action].status = "waiting";
      }

      if (entry.message.indexOf("-done") >= 0 || entry.message.indexOf("-loaded") >= 0) {
        actions[action].status = "ok";
        actions[action].error = "";
      }

      if (entry.message.indexOf("-error") >= 0 || data.error) {
        actions[action].status = "fail";
        actions[action].error = data.error || entry.message;
      }
    });

    return Object.keys(actions).map(function (key) {
      return actions[key];
    });
  }

  function functionStatusFromLogs() {
    var functions = {};

    state.logs.forEach(function (entry, index) {
      var data = entry && entry.data ? entry.data : {};
      var file = data.file || data.sourceFile || "";
      var functionName = data.functionName || data.function || data.fn || "";
      var key;

      if (!file || !functionName) return;

      key = file + "::" + functionName;

      functions[key] = functions[key] || {
        path: key,
        file: file,
        functionName: functionName,
        url: "",
        status: "waiting",
        error: "",
        detail: "",
        firstIndex: index,
        lastIndex: index
      };

      functions[key].lastIndex = index;

      if (
        entry.level === "error" ||
        entry.message.indexOf("-error") >= 0 ||
        entry.message.indexOf("failed") >= 0 ||
        data.error
      ) {
        functions[key].status = "fail";
        functions[key].error = data.error || entry.message;
        functions[key].detail = data.action || data.source || data.task || "";
        return;
      }

      if (
        entry.message.indexOf("-done") >= 0 ||
        entry.message.indexOf("-loaded") >= 0 ||
        entry.message === "done" ||
        data.status === "done" ||
        data.status === "ok"
      ) {
        functions[key].status = "ok";
        functions[key].error = "";
        functions[key].detail = data.action || data.source || data.task || "";
        return;
      }

      if (functions[key].status !== "ok") {
        functions[key].status = "waiting";
        functions[key].detail = data.action || data.source || data.task || "";
      }
    });

    return Object.keys(functions).sort().map(function (key) {
      return inferFunctionStatus(functions[key]);
    });
  }

  function inferFunctionStatus(item) {
    if (!item || item.status !== "waiting") {
      return item;
    }

    var externalLoaderReady = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:ready";
    });
    var externalLoaderCoreReady = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:core-ready";
    });
    var externalRegisterDone = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:register-done";
    });
    var externalRegisterError = latestLogMatch(function (entry) {
      return entry.message === "external-app-loader:register-error";
    });

    if (
      item.file === "external-app-loader.js" &&
      item.functionName === "load" &&
      externalLoaderReady
    ) {
      item.status = "ok";
      item.detail = "inferred from external-app-loader:ready";
      return item;
    }

    if (
      item.file === "external-app-loader.js" &&
      item.functionName === "loadSequential" &&
      externalLoaderCoreReady
    ) {
      item.status = "ok";
      item.detail = "inferred from external-app-loader:core-ready";
      return item;
    }

    if (
      item.file === "external-app-loader.js" &&
      item.functionName === "getAppEnv" &&
      (externalLoaderCoreReady || externalLoaderReady)
    ) {
      item.status = "ok";
      item.detail = externalLoaderReady
        ? "inferred from external-app-loader:ready"
        : "inferred from external-app-loader:core-ready";
      return item;
    }

    if (
      item.file === "external-app-loader.js" &&
      item.functionName === "registerExternalAppIfNeeded"
    ) {
      if (externalRegisterDone) {
        item.status = "ok";
        item.detail = "inferred from external-app-loader:register-done";
        return item;
      }

      if (externalRegisterError) {
        item.status = "fail";
        item.error = "inferred from external-app-loader:register-error";
        return item;
      }
    }

    if (item.file === "config.js" && item.functionName === "loadConfig" && state.config.loaded) {
      item.status = "ok";
      item.detail = "inferred from config.loaded";
      return item;
    }

    if (
      item.file === "backend-client.js" &&
      (item.functionName === "loadConfig" || item.functionName === "call" || item.functionName === "callJsonp") &&
      state.backend.loaded
    ) {
      item.status = "ok";
      item.detail = "inferred from backend.loaded";
      return item;
    }

    if (
      item.file === "css-sheet-runtime.js" &&
      (item.functionName === "keepLoading" ||
        item.functionName === "markCssRuntimePending" ||
        item.functionName === "load" ||
        item.functionName === "applyCacheIfAvailable" ||
        item.functionName === "markCssRuntimeDone") &&
      state.cssRuntime.loaded
    ) {
      item.status = "ok";
      item.detail = "inferred from cssRuntime.loaded";
      return item;
    }

    if (
      item.file === "loading-gate.js" &&
      (item.functionName === "require" || item.functionName === "done" || item.functionName === "release") &&
      state.modules.loadingGate &&
      state.modules.loadingGate.status === "ok"
    ) {
      item.status = "ok";
      item.detail = "inferred from loadingGate released";
      return item;
    }

    return item;
  }

  function addChecklistItem(parent, item) {
    var row = document.createElement("div");
    var className = statusClass(item.status);
    row.className = "skhps-runtime-checkitem " + className;

    var markEl = document.createElement("div");
    markEl.className = "skhps-runtime-checkmark";
    markEl.textContent = item.status === "ok" ? "OK" : item.status === "fail" ? "FAIL" : item.status === "warn" ? "WARN" : "...";

    var body = document.createElement("div");
    body.className = "skhps-runtime-checkbody";

    var name = document.createElement("div");
    name.className = "skhps-runtime-checkname";
    name.textContent = item.path || item.name || "-";

    var meta = document.createElement("div");
    meta.className = "skhps-runtime-checkmeta";
    meta.textContent = item.error
      ? item.error
      : compactText(item.url || item.detail || item.status, 120);

    body.appendChild(name);
    body.appendChild(meta);
    row.appendChild(markEl);
    row.appendChild(body);
    parent.appendChild(row);
  }

  function baseName(path) {
    var clean = String(path || "").split("?")[0].split("#")[0].replace(/\\/g, "/");
    var parts = clean.split("/");
    return parts[parts.length - 1] || clean;
  }

  function statusLabel(status) {
    status = String(status || "").toLowerCase();
    if (status === "ok") return "OK";
    if (status === "fail" || status === "error") return "FAIL";
    if (status === "warn") return "WARN";
    return "RUN";
  }

  function mergeFlowStatus(current, next) {
    current = String(current || "waiting").toLowerCase();
    next = String(next || "waiting").toLowerCase();

    if (current === "fail" || next === "fail" || current === "error" || next === "error") return "fail";
    if (current === "warn" || next === "warn") return "warn";
    if (current === "waiting" || next === "waiting") return "waiting";
    return "ok";
  }

  function addFlowStep(card, step) {
    var row = document.createElement("div");
    row.className = "skhps-runtime-flow-step";

    var status = document.createElement("div");
    status.className = "skhps-runtime-flow-step-status " + statusClass(step.status);
    status.textContent = statusLabel(step.status);

    var body = document.createElement("div");
    body.className = "skhps-runtime-flow-step-body";

    var name = document.createElement("div");
    name.className = "skhps-runtime-flow-step-name";
    name.textContent = step.name || "-";

    var detail = document.createElement("div");
    detail.className = "skhps-runtime-flow-step-detail";
    detail.textContent = compactText(step.detail || step.error || "", 140);

    body.appendChild(name);
    if (detail.textContent) body.appendChild(detail);
    row.appendChild(status);
    row.appendChild(body);
    card.appendChild(row);
  }

  function addFlowCard(parent, flow, number) {
    var flowKey = String(flow.source || flow.title || number);
    var expanded = Boolean(expandAllFlowCards || expandedFlowCards[flowKey]);
    var card = document.createElement("article");
    card.className = "skhps-runtime-flow-card" + (expanded ? "" : " is-collapsed");

    var head = document.createElement("div");
    head.className = "skhps-runtime-flow-head";

    var titleWrap = document.createElement("div");
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "skhps-runtime-flow-toggle";
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.title = expanded ? "收合流程內容" : "展開流程內容";

    var title = document.createElement("div");
    title.className = "skhps-runtime-flow-title";

    var numberEl = document.createElement("span");
    numberEl.className = "skhps-runtime-flow-number";
    numberEl.textContent = String(number);

    title.appendChild(numberEl);
    title.appendChild(document.createTextNode(flow.title || "-"));

    var meta = document.createElement("div");
    meta.className = "skhps-runtime-flow-meta";
    meta.textContent = compactText(flow.meta || "", 160);

    var status = document.createElement("div");
    status.className = "skhps-runtime-flow-status " + statusClass(flow.status);
    status.textContent = statusLabel(flow.status);

    toggle.appendChild(title);
    if (meta.textContent) toggle.appendChild(meta);
    toggle.addEventListener("click", function () {
      var nextExpanded = card.classList.contains("is-collapsed");

      if (nextExpanded) {
        expandedFlowCards[flowKey] = true;
        card.classList.remove("is-collapsed");
        toggle.setAttribute("aria-expanded", "true");
        toggle.title = "收合流程內容";
      } else {
        delete expandedFlowCards[flowKey];
        card.classList.add("is-collapsed");
        toggle.setAttribute("aria-expanded", "false");
        toggle.title = "展開流程內容";
      }
    });

    titleWrap.appendChild(toggle);
    head.appendChild(titleWrap);
    head.appendChild(status);

    var steps = document.createElement("div");
    steps.className = "skhps-runtime-flow-steps";
    flow.steps.forEach(function (step) {
      addFlowStep(steps, step);
    });

    card.appendChild(head);
    card.appendChild(steps);
    parent.appendChild(card);
  }

  function backendCallStatusClass(status) {
    status = String(status || "").toLowerCase();
    if (status === "ok" || status === "done") return "ok";
    if (status === "fail" || status === "error") return "fail";
    if (status === "warn") return "warn";
    return "waiting";
  }

  function addBackendCall(parent, call) {
    var card = document.createElement("article");
    var normalized = backendCallStatusClass(call.status);
    card.className = "skhps-runtime-call " + statusClass(normalized);

    var head = document.createElement("div");
    head.className = "skhps-runtime-call-head";

    var title = document.createElement("div");
    title.className = "skhps-runtime-call-title";
    title.textContent = (call.resourceType || "unknown") + ": " + (call.resourceName || call.action || "-");

    var status = document.createElement("div");
    status.className = "skhps-runtime-call-status " + statusClass(normalized);
    status.textContent = statusLabel(normalized);

    var meta = document.createElement("div");
    meta.className = "skhps-runtime-call-meta";
    meta.textContent = [
      call.action ? "action=" + call.action : "",
      call.resourceName ? "name=" + call.resourceName : "",
      call.durationMs !== null && call.durationMs !== undefined ? "duration=" + call.durationMs + "ms" : "",
      call.error ? "error=" + call.error : ""
    ].filter(Boolean).join(" | ");

    head.appendChild(title);
    head.appendChild(status);
    card.appendChild(head);
    if (meta.textContent) card.appendChild(meta);
    parent.appendChild(card);
  }

  function buildFlowCards() {
    var cardsBySource = {};

    state.logs.forEach(function (entry, index) {
      var source = entry.source || entry.module || "";
      var action = entry.action || entry.message || "";
      var category = entry.category || inferCategory(source);
      var detail = entry.detail;

      if (!source || !action) return;
      if (source === "runtime" && action === "runtime initialized") return;

      cardsBySource[source] = cardsBySource[source] || {
        title: source,
        meta: category,
        status: "ok",
        firstIndex: index,
        steps: []
      };

      cardsBySource[source].firstIndex = Math.min(cardsBySource[source].firstIndex, index);
      cardsBySource[source].status = mergeFlowStatus(cardsBySource[source].status, entry.status === "INFO" ? "ok" : entry.status.toLowerCase());
      cardsBySource[source].steps.push({
        name: action,
        status: entry.status === "INFO" ? "ok" : entry.status.toLowerCase(),
        detail: [
          detail && typeof detail !== "object" ? detail : compactText(detail, 120),
          entry.durationMs !== null && entry.durationMs !== undefined ? entry.durationMs + "ms" : ""
        ].filter(Boolean).join(" | "),
        error: entry.status === "FAIL" ? compactText(detail || entry.data || "", 140) : "",
        firstIndex: index
      });
    });

    return Object.keys(cardsBySource).map(function (key) {
      var card = cardsBySource[key];
      card.steps.sort(function (a, b) {
        return (a.firstIndex || 0) - (b.firstIndex || 0);
      });
      return card;
    }).sort(function (a, b) {
      return (a.firstIndex || 0) - (b.firstIndex || 0);
    });
  }

  function findOrCreatePanel() {
    var panel = document.getElementById(PANEL_ID);

    if (panel) {
      return panel;
    }

    if (!document.body) {
      return null;
    }

    panel = document.createElement("div");
    panel.id = PANEL_ID;
    document.body.appendChild(panel);
    return panel;
  }

  function renderPanel() {
    var panel = findOrCreatePanel();
    if (!panel) return null;

    ensureStyle();
    panel.className = "skhps-runtime-panel" +
      (document.documentElement.getAttribute("data-skhps-runtime-panel-open") === "true" ? "" : " is-hidden");
    panel.innerHTML = "";

    var overall = summarizeOverall();
    var gateSummary = summarizeLoadingGate();
    var configSummary = summarizeConfig();
    var backendSummary = summarizeBackend();
    var cssSummary = summarizeCssRuntime();
    var dataSummary = summarizeData();
    var summary = document.createElement("div");
    summary.className = "skhps-runtime-summary";
    addCard(summary, "Gate", gateSummary.label, gateSummary.className);
    addCard(summary, "Config", configSummary.label, configSummary.className);
    addCard(summary, "Backend", backendSummary.label, backendSummary.className);
    addCard(summary, "CSS", cssSummary.label, cssSummary.className);
    addCard(summary, "Data", dataSummary.label, dataSummary.className);
    panel.appendChild(summary);

    var traffic = addSection(panel, "Traffic Lights");
    addRow(traffic, "Gate", gateSummary.reason || gateSummary.label, gateSummary.className);
    addRow(traffic, "Config", configSummary.reason || configSummary.label, configSummary.className);
    addRow(traffic, "Backend", backendSummary.reason || backendSummary.label, backendSummary.className);
    addRow(traffic, "CSS", cssSummary.reason || cssSummary.label, cssSummary.className);
    addRow(traffic, "Data", dataSummary.reason + " | " + dataSummary.label, dataSummary.className);
    addRow(traffic, "Overall", overall.label, overall.className);

    var env = addSection(panel, "Environment");
    addRow(env, "Host", state.host.hostname || "(file)");
    addRow(env, "Host Env", state.host.env, statusClass(state.host.env));
    addRow(env, "Runtime Requested", state.runtime.requested);
    addRow(env, "Runtime Effective", state.runtime.effective, statusClass(state.runtime.effective));
    addRow(env, "Override Reason", state.runtime.overrideReason || "-");
    addRow(env, "Fallback Reason", state.runtime.fallbackReason || "-");
    addRow(env, "Config URL", state.config.source || "not loaded", statusClass(String(state.config.loaded)));
    addRow(env, "Backend URL", state.backend.endpoint || "not loaded", statusClass(state.backend.healthy === false ? "fail" : state.backend.loaded ? "ok" : "waiting"));
    addRow(env, "CSS Runtime", state.cssRuntime.loaded ? state.cssRuntime.source : "not loaded", statusClass(String(state.cssRuntime.loaded)));

    var domState = getDomState();
    var dom = addSection(panel, "DOM State");
    addRow(dom, "document.readyState", domState.readyState);
    addRow(dom, "html.skhps-css-loading", String(domState.htmlCssLoading), statusClass(String(!domState.htmlCssLoading)));
    addRow(dom, "shell ready", domState.shellReady ? "ready" : "loading", statusClass(domState.shellReady ? "ok" : "waiting"));
    addRow(dom, "main ready", domState.pageReady ? "ready" : "loading", statusClass(domState.pageReady ? "ok" : "waiting"));
    addRow(dom, "body visible", String(domState.bodyVisible), statusClass(String(domState.bodyVisible)));
    addRow(dom, "header", domState.headerExists ? (domState.headerVisible ? "exists / visible" : "exists / hidden") : "missing", statusClass(domState.headerExists && domState.headerVisible ? "ok" : "waiting"));
    addRow(dom, "footer", domState.footerExists ? (domState.footerVisible ? "exists / visible" : "exists / hidden") : "missing", statusClass(domState.footerExists && domState.footerVisible ? "ok" : "waiting"));
    addRow(dom, "loading gate release", domState.loadingReleased ? ("released: " + (domState.loadingReleaseReason || "ready")) : "not released", statusClass(String(domState.loadingReleased)));
    addRow(dom, "css-runtime", domState.cssRuntimeReady ? "done" : "pending", statusClass(domState.cssRuntimeReady ? "ok" : "waiting"));

    var gate = addSection(panel, "Loading Gate");
    addRow(gate, "Required", state.loadingGate.requiredTasks.join(", ") || "-");
    addRow(gate, "Completed", state.loadingGate.completedTasks.join(", ") || "-");
    addRow(gate, "Failed", state.loadingGate.failedTasks.map(function (item) {
      return item.task + ": " + item.error;
    }).join(" | ") || "-", state.loadingGate.failedTasks.length ? "skhps-runtime-fail" : "skhps-runtime-ok");

    var dataDetail = state.data && state.data.detail ? state.data.detail : {};
    var calendarDetail = dataDetail.calendar || {};
    var diagnostics = dataDetail.diagnostics || dataDetail.detail && dataDetail.detail.diagnostics || {};
    var hasCalendarDetail = Boolean(
      calendarDetail.id ||
      calendarDetail.name ||
      diagnostics.calendarId ||
      diagnostics.calendarName ||
      diagnostics.visibleCalendarsSample
    );
    var dataSection = addSection(panel, "Data");
    addRow(dataSection, "Task", state.data && state.data.task || "-", dataSummary.className);
    addRow(dataSection, "Status", state.data && state.data.status || "-", dataSummary.className);
    addRow(dataSection, "Message", state.data && state.data.message || "-", dataSummary.className);
    if (hasCalendarDetail) {
      addRow(dataSection, "Calendar Name", calendarDetail.name || diagnostics.calendarName || "-");
      addRow(dataSection, "Calendar ID", calendarDetail.id || diagnostics.calendarId || "-");
      addRow(dataSection, "Running Window", calendarDetail.runningWindow ? ("before " + calendarDetail.runningWindow.beforeMinutes + " min / after " + calendarDetail.runningWindow.afterMinutes + " min") : "-");
      addRow(dataSection, "Calendar Settings", calendarDetail.settingsUrl || diagnostics.calendarSettingsUrl || "-");
      addRow(dataSection, "Calendar Subscribe", calendarDetail.subscribeUrl || diagnostics.calendarSubscribeUrl || "-");
      addRow(dataSection, "Can List Calendars", diagnostics.canListCalendars === undefined ? "-" : String(diagnostics.canListCalendars), statusClass(diagnostics.canListCalendars === false ? "fail" : diagnostics.canListCalendars === true ? "ok" : ""));
      addRow(dataSection, "Target Calendar Visible", diagnostics.targetCalendarVisible === undefined ? "-" : String(diagnostics.targetCalendarVisible), statusClass(diagnostics.targetCalendarVisible === false ? "fail" : diagnostics.targetCalendarVisible === true ? "ok" : ""));
      addRow(dataSection, "Accessible Calendar Count", diagnostics.accessibleCalendarCount === undefined ? "-" : diagnostics.accessibleCalendarCount);
      addRow(dataSection, "Visible Calendars Sample", diagnostics.visibleCalendarsSample || "-");
    }
    addRow(dataSection, "Raw Detail", dataDetail || "-");

    var scriptRows = scriptStatusFromLogs();
    if (scriptRows.length) {
      var scriptSection = addSection(panel, "Script Loader");
      var scriptList = document.createElement("div");
      scriptList.className = "skhps-runtime-checklist";
      scriptRows.forEach(function (script) {
        addChecklistItem(scriptList, {
          path: script.path,
          status: script.status,
          detail: [
            script.url && script.url !== script.path ? script.url : "",
            script.durationMs !== null && script.durationMs !== undefined ? script.durationMs + "ms" : "",
            script.optional ? "optional" : "",
            script.error || ""
          ].filter(Boolean).join(" | ")
        });
      });
      scriptSection.appendChild(scriptList);
    }

    var modules = addSection(panel, "Module Status");
    Object.keys(state.modules).sort().forEach(function (name) {
      var item = state.modules[name] || {};
      addRow(modules, name, (item.status || "waiting") + (item.error ? " - " + item.error : ""), statusClass(item.status));
    });

    if (state.backend.calls && state.backend.calls.length) {
      var backendCalls = addSection(panel, "Backend Calls");
      var callList = document.createElement("div");
      callList.className = "skhps-runtime-call-list";
      state.backend.calls.slice(-20).forEach(function (call) {
        addBackendCall(callList, call);
      });
      backendCalls.appendChild(callList);
    }

    var externalApps = addSection(panel, "External Apps");
    addRow(externalApps, "listExternalApps", state.externalApps.loaded ? (state.externalApps.count + " app(s)") : state.externalApps.error ? state.externalApps.error : "not loaded", statusClass(state.externalApps.error ? "fail" : state.externalApps.loaded ? "ok" : "waiting"));
    addRow(externalApps, "runtime env", state.externalApps.env || state.runtime.effective || "-");
    addRow(externalApps, "duration", state.externalApps.durationMs !== null && state.externalApps.durationMs !== undefined ? state.externalApps.durationMs + "ms" : "-");

    var flowCards = buildFlowCards();
    if (flowCards.length) {
      var flow = addSection(panel, "Flow");
      var allFlowExpanded = flowCards.every(function (item, index) {
        return Boolean(expandAllFlowCards || expandedFlowCards[String(item.source || item.title || index + 1)]);
      });
      addSectionAction(flow, allFlowExpanded ? "Collapse all" : "Expand all", allFlowExpanded ? "收起全部 Flow 卡片" : "展開全部 Flow 卡片", function () {
        var shouldExpand = !allFlowExpanded;
        expandAllFlowCards = shouldExpand;
        expandedFlowCards = {};

        if (shouldExpand) {
          flowCards.forEach(function (item, index) {
            expandedFlowCards[String(item.source || item.title || index + 1)] = true;
          });
        }

        renderPanel();
      });
      var note = document.createElement("div");
      note.className = "skhps-runtime-flow-note";
      note.textContent = "RUN 表示已開始但尚未收到完成回報，不一定是錯；FAIL 才代表錯誤。卡片依實際發生時間排序。";
      flow.appendChild(note);
      var flowGrid = document.createElement("div");
      flowGrid.className = "skhps-runtime-flow";
      flowCards.forEach(function (item, index) {
        addFlowCard(flowGrid, item, index + 1);
      });
      flow.appendChild(flowGrid);
    }

    var logs = addSection(panel, "Recent Logs");
    var recentLogs = state.logs.slice(-20);
    addSectionAction(logs, "Copy", "複製最近 20 筆 runtime logs", function () {
      copyText(recentLogs.map(formatRuntimeLog).join("\n"), this);
    });
    recentLogs.forEach(function (entry) {
      addRow(
        logs,
        entry.timestamp,
        "[" + entry.level + "] " + logSource(entry) + " - " + entry.message + logDetail(entry),
        "skhps-runtime-log"
      );
    });

    return panel;
  }

  var renderTimer = null;

  function scheduleRender() {
    if (renderTimer) return;

    renderTimer = window.setTimeout(function () {
      renderTimer = null;
      if (document.body || document.readyState !== "loading") {
        renderPanel();
      }
    }, 50);
  }

  function mark(name, detail) {
    try {
      log({
        level: "debug",
        module: detail && detail.file ? detail.file : "runtime",
        message: name,
        data: detail || null
      });
    } catch (error) {}
  }

  function warn(name, detail) {
    try {
      log({
        level: "warn",
        module: detail && detail.file ? detail.file : "runtime",
        message: name,
        data: detail || null
      });
    } catch (error) {}
  }

  function error(name, detail) {
    try {
      log({
        level: "error",
        module: detail && detail.file ? detail.file : "runtime",
        message: name,
        data: detail || null
      });
    } catch (error) {}
  }

  function runtimeLogMethod(status) {
    return function (payload) {
      try {
        payload = payload || {};
        if (typeof payload === "string") {
          payload = {
            source: "runtime",
            category: "runtime",
            action: payload,
            detail: ""
          };
        }
        payload.status = payload.status || status;
        return log(payload);
      } catch (error) {
        return null;
      }
    };
  }

  function flushQueuedRuntimeLogs() {
    preRuntimeLogQueue.forEach(function (payload) {
      try {
        log(payload);
      } catch (error) {}
    });
    preRuntimeLogQueue = [];
  }

  window.SKHPSRuntime = {
    log: log,
    start: start,
    done: done,
    fail: fail,
    setHost: setHost,
    setRuntime: setRuntime,
    setConfig: setConfig,
    setBackend: setBackend,
    setBackendCall: setBackendCall,
    setDataStatus: setDataStatus,
    setCssRuntime: setCssRuntime,
    setExternalApps: setExternalApps,
    setLoadingRequired: setLoadingRequired,
    setLoadingGate: setLoadingGate,
    taskDone: taskDone,
    taskFailed: taskFailed,
    getState: getState,
    renderPanel: renderPanel,
    mark: mark,
    warn: warn,
    error: error
  };

  window.SKHPSRuntimeLog = {
    start: runtimeLogMethod("RUN"),
    pending: runtimeLogMethod("RUN"),
    ok: runtimeLogMethod("OK"),
    done: runtimeLogMethod("OK"),
    fail: runtimeLogMethod("FAIL"),
    warn: runtimeLogMethod("WARN"),
    info: runtimeLogMethod("INFO"),
    log: function (payload) {
      try {
        return log(payload || {});
      } catch (error) {
        return null;
      }
    },
    getEntries: function () {
      try {
        return getState().logs || [];
      } catch (error) {
        return [];
      }
    },
    __queue: []
  };

  flushQueuedRuntimeLogs();

  log({
    level: "info",
    module: "runtime",
    message: "runtime initialized",
    source: "runtime.js",
    category: "runtime",
    action: "moduleReady",
    status: "OK"
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPanel);
  } else {
    renderPanel();
  }
})();
