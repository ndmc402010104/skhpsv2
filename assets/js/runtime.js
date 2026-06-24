/*
檔案位置：skhpsv2/assets/js/runtime.js
時間戳記：2026-06-21 UTC+8
用途：SKHPS runtime diagnostics state；集中記錄環境、config/backend/css/loading gate、data source、模組狀態與最近 logs；Data 區會顯示實際放行資料來源。
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


  function isLocalDevHost(host) {
    host = String(host || "").toLowerCase();

    return (
      host === "" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
    );
  }

  function hostEnvFromLocation() {
    var protocol = String(window.location.protocol || "").toLowerCase();
    var host = String(window.location.hostname || "").toLowerCase();

    if (protocol === "file:" || isLocalDevHost(host)) {
      return "LOCAL";
    }

    if (host === "skhps.jonaminz.com" || host === "quick-login.skhps.jonaminz.com") {
      return "PROD";
    }

    if (host === "dev-skhps.jonaminz.com" || host === "dev-quick-login.skhps.jonaminz.com") {
      return "DEV";
    }

    if (window.SKHPS_APP_ENV || window.SKHPS_APP_CONFIG) {
      return "EXTERNAL";
    }

    return "UNKNOWN";
  }

  function isAuthoritativeHostEnv(hostEnv) {
    hostEnv = normalizeRuntime(hostEnv);
    return hostEnv === "LOCAL" || hostEnv === "DEV" || hostEnv === "PROD";
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

    if (isAuthoritativeHostEnv(hostEnv)) {
      return {
        effective: hostEnv,
        overrideReason: "",
        fallbackReason: ""
      };
    }

    return {
      effective: fallback,
      overrideReason: "",
      fallbackReason: "Host Env " + (hostEnv || "UNKNOWN") + "; fallback to " + fallback
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
      taskStates: {},
      releaseReason: ""
    },
    data: {
      task: "",
      status: "",
      message: "",
      detail: null,
      source: "",
      sourceLabel: "",
      provider: "",
      transport: "",
      table: "",
      action: "",
      dataType: "",
      count: null,
      env: "",
      gateTask: "",
      winner: "",
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

    var currentHostEnv = state.host && state.host.env === "UNKNOWN" && (window.SKHPS_APP_ENV || window.SKHPS_APP_CONFIG)
      ? "EXTERNAL"
      : state.host && state.host.env;
    var requested = normalizeRuntime(patch.requested || state.runtime.requested);
    var proposedEffective = normalizeRuntime(patch.effective);
    var defaultRuntime = normalizeRuntime(patch.defaultRuntime || patch.fallback || "");
    var decision;

    if (requested) {
      decision = runtimeDecision(currentHostEnv, requested, defaultRuntime);
    } else if (proposedEffective) {
      decision = {
        effective: proposedEffective,
        overrideReason: patch.overrideReason || "",
        fallbackReason: patch.fallbackReason ||
          (!isAuthoritativeHostEnv(currentHostEnv) ? "Host Env " + (currentHostEnv || "UNKNOWN") + "; using runtime " + proposedEffective : state.runtime.fallbackReason || "")
      };
    } else {
      decision = runtimeDecision(currentHostEnv, "", defaultRuntime);
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

    var inputDetail = data.detail || data.data || null;
    var dataSourceInfo = normalizeDataSourceInfo(data, data.task || data.name || state.data.task || "");

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
      message: String(data.message || data.error || dataSourceInfo.sourceLabel || "").trim(),
      detail: inputDetail,
      source: dataSourceInfo.source || state.data.source || "",
      sourceLabel: dataSourceInfo.sourceLabel || state.data.sourceLabel || "",
      provider: dataSourceInfo.provider || state.data.provider || "",
      transport: dataSourceInfo.transport || state.data.transport || "",
      table: dataSourceInfo.table || state.data.table || "",
      action: dataSourceInfo.action || state.data.action || "",
      dataType: dataSourceInfo.dataType || state.data.dataType || "",
      count: dataSourceInfo.count !== null && dataSourceInfo.count !== undefined ? dataSourceInfo.count : state.data.count,
      env: dataSourceInfo.env || state.data.env || "",
      gateTask: dataSourceInfo.gateTask || state.data.gateTask || "",
      winner: dataSourceInfo.winner || state.data.winner || "",
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
    data = data || {};
    mergeSection("externalApps", data);

    if (data.loaded || data.source || data.sourceLabel || data.table || data.registryTable || data.count !== undefined) {
      promoteDataSource("external-apps-runtime", Object.assign({
        status: data.error ? "fail" : data.loaded ? "ok" : "waiting",
        message: data.message || data.sourceLabel || "外部專案資料",
        dataType: data.dataType || "external-project-registry",
        count: data.count
      }, data));
    }
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
    var required = uniqueList(tasks);
    var now = nowIso();

    state.loadingGate.requiredTasks = required;
    state.loadingGate.taskStates = state.loadingGate.taskStates || {};
    required.forEach(function (taskName) {
      state.loadingGate.taskStates[taskName] = Object.assign({
        task: taskName,
        status: "waiting",
        requiredAt: now,
        completedAt: "",
        durationMs: null,
        error: ""
      }, state.loadingGate.taskStates[taskName] || {}, {
        task: taskName
      });
    });
    emitUpdated();
  }

  function setLoadingGate(data) {
    state.loadingGate = Object.assign({}, state.loadingGate || {}, data || {});
    emitUpdated();
  }

  function taskDone(taskName, extraData) {
    extraData = extraData || {};
    taskName = String(taskName || "").trim();
    if (!taskName) return;
    state.loadingGate.taskStates = state.loadingGate.taskStates || {};

    if (state.loadingGate.requiredTasks.indexOf(taskName) < 0) {
      state.loadingGate.requiredTasks.push(taskName);
    }

    if (state.loadingGate.completedTasks.indexOf(taskName) < 0) {
      state.loadingGate.completedTasks.push(taskName);
    }

    state.loadingGate.failedTasks = state.loadingGate.failedTasks.filter(function (item) {
      return item.task !== taskName;
    });

    var now = nowIso();
    var taskState = state.loadingGate.taskStates[taskName] || {
      task: taskName,
      requiredAt: now
    };
    var started = taskState.requiredAt ? Date.parse(taskState.requiredAt) : NaN;
    state.loadingGate.taskStates[taskName] = Object.assign({}, taskState, extraData || {}, {
      status: "ok",
      completedAt: now,
      durationMs: isNaN(started) ? taskState.durationMs || null : Date.now() - started,
      error: ""
    });

    promoteDataSource(taskName, Object.assign({
      status: "ok",
      gateTask: taskName
    }, extraData || {}));

    emitUpdated();
  }

  function taskFailed(taskName, error, extraData) {
    extraData = extraData || {};
    taskName = String(taskName || "").trim();
    if (!taskName) return;
    state.loadingGate.taskStates = state.loadingGate.taskStates || {};

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

    var now = nowIso();
    var taskState = state.loadingGate.taskStates[taskName] || {
      task: taskName,
      requiredAt: now
    };
    var started = taskState.requiredAt ? Date.parse(taskState.requiredAt) : NaN;
    state.loadingGate.taskStates[taskName] = Object.assign({}, taskState, extraData || {}, {
      status: "fail",
      completedAt: now,
      durationMs: isNaN(started) ? taskState.durationMs || null : Date.now() - started,
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
      "html.runtime-state-closed,html.runtime-state-full{--skhps-footer-dock-bottom:var(--skhps-footer-height,48px);--skhps-runtime-summary-height:0px;--skhps-runtime-full-height:0px;--skhps-runtime-tail-height:0px;--skhps-runtime-visible-height:0px;--skhps-runtime-tail-spacer:0px}",
      ".skhps-runtime-tail{height:var(--skhps-runtime-tail-height,0px);margin-top:var(--skhps-runtime-tail-spacer,0px);min-height:0;max-height:none;max-width:100%;box-sizing:border-box;overflow:visible;flex:0 0 auto}",
      "html.runtime-state-closed .skhps-runtime-tail{height:0!important;margin-top:0!important;min-height:0!important;max-height:0!important;overflow:visible!important}",
      "html.runtime-state-full .skhps-runtime-tail{height:var(--skhps-runtime-full-height,0px);min-height:var(--skhps-runtime-full-height,0px);max-height:none}",
      ".skhps-runtime-panel{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#101820;color:#f5f7fb;border-top:1px solid rgba(255,255,255,.14);padding:16px;line-height:1.5;font-size:13px;max-width:100%;box-sizing:border-box;overflow-x:hidden}",
      ".skhps-runtime-panel *{box-sizing:border-box;min-width:0}",
      ".skhps-runtime-panel a,.skhps-runtime-panel span,.skhps-runtime-panel div,.skhps-runtime-panel p{max-width:100%;overflow-wrap:anywhere;word-break:break-word;white-space:normal}",
      ".skhps-runtime-panel pre,.skhps-runtime-panel code{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-panel table{width:100%;table-layout:fixed}",
      ".skhps-runtime-panel td,.skhps-runtime-panel th{overflow-wrap:anywhere;word-break:break-word}",
      ".skhps-runtime-panel.is-hidden{display:block}",
      "html:not(.runtime-state-full) .skhps-runtime-panel.is-hidden{position:fixed!important;left:0!important;right:0!important;bottom:var(--skhps-footer-dock-bottom,var(--skhps-footer-height,48px))!important;max-height:0!important;opacity:0;visibility:hidden;pointer-events:none;overflow:hidden}",
      "html.runtime-state-closed .skhps-runtime-panel{position:fixed!important;left:0!important;right:0!important;bottom:var(--skhps-footer-dock-bottom,var(--skhps-footer-height,48px))!important;max-height:0!important;opacity:0;visibility:hidden;pointer-events:none;overflow:hidden}",
      "html.runtime-state-full[data-skhps-runtime-docked='true'] .skhps-runtime-panel{position:fixed!important;left:0!important;right:0!important;bottom:calc(var(--skhps-footer-dock-bottom,var(--skhps-footer-height,48px)) + var(--skhps-runtime-summary-height,0px) - var(--skhps-runtime-full-height,0px))!important;height:auto!important;max-height:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;overflow:visible!important;z-index:2147482980!important;box-shadow:0 -14px 34px rgba(15,23,42,.16)!important}",
      "html.runtime-state-full:not([data-skhps-runtime-docked='true']) .skhps-runtime-panel{position:relative!important;left:auto!important;right:auto!important;bottom:auto!important;height:auto!important;max-height:none!important;opacity:1!important;visibility:visible!important;pointer-events:auto!important;overflow:visible!important;z-index:auto!important;box-shadow:none!important;overscroll-behavior:auto!important}",
      "html.skhps-css-loading .skhps-runtime-panel,html.skhps-loading .skhps-runtime-panel,html:not([data-skhps-loading-released='true']) .skhps-runtime-panel{max-height:0!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;overflow:hidden!important}",
      "html.skhps-css-loading .skhps-runtime-tail,html.skhps-loading .skhps-runtime-tail,html:not([data-skhps-loading-released='true']) .skhps-runtime-tail{height:0!important;margin-top:0!important;min-height:0!important;max-height:0!important}",
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


  function firstValue() {
    var i;

    for (i = 0; i < arguments.length; i += 1) {
      if (arguments[i] !== null && arguments[i] !== undefined && arguments[i] !== "") {
        return arguments[i];
      }
    }

    return "";
  }

  function objectValue(source, keys) {
    var i;

    if (!source || typeof source !== "object") return "";

    for (i = 0; i < keys.length; i += 1) {
      if (source[keys[i]] !== null && source[keys[i]] !== undefined && source[keys[i]] !== "") {
        return source[keys[i]];
      }
    }

    return "";
  }

  function normalizeSourceKey(value) {
    value = String(value || "").trim();

    if (!value || value === "runtime.js" || value === "runtime") return "";
    return value;
  }

  function cleanDataSourceLabel(value) {
    value = String(value || "").trim();
    if (!value) return "";

    value = value
      .replace(/\s*\/\s*Cloudflare Worker\s*/gi, "")
      .replace(/\s*\/\s*cloudflare-worker\s*/gi, "")
      .replace(/\s*\/\s*Worker\s*/gi, "")
      .replace(/\s*via\s+Cloudflare Worker\s*/gi, "")
      .replace(/\s*\|\s*transport=cloudflare-worker\s*/gi, "")
      .trim();

    if (/^Google Sheet\s*\/\s*Apps Script$/i.test(value)) return "Google Sheet";

    /*
      統一 Runtime Panel > Data 的來源格式：
      - Supabase / StaffMaster
      - Supabase / ExternalProject
      這裡只顯示「資料來源 / 資料表或資料集」，不把 Cloudflare Worker 這類傳輸層當 data source 顯示。
    */
    value = value.replace(/^Supabase\s+\/\s+/i, "Supabase / ");
    if (/^Supabase\s+[^/]+$/i.test(value)) {
      value = value.replace(/^Supabase\s+/i, "Supabase / ");
    }

    return value;
  }

  function sourceLabelFromSource(source, table, fallback) {
    var key = String(source || "").toLowerCase();
    var tableName = String(table || "").trim();

    if (fallback) return cleanDataSourceLabel(fallback);

    if (key.indexOf("supabase") >= 0) {
      return cleanDataSourceLabel(tableName ? "Supabase / " + tableName : "Supabase");
    }

    if (key.indexOf("apps-script") >= 0 || key.indexOf("appscript") >= 0 || key.indexOf("jsonp") >= 0) {
      return "Google Sheet";
    }

    if (key.indexOf("sheet") >= 0 || key === "csv") {
      return "Google Sheet";
    }

    if (key.indexOf("cloudflare") >= 0 || key.indexOf("worker") >= 0 || key.indexOf("skhps-backend") >= 0) {
      return cleanDataSourceLabel(tableName || "Backend");
    }

    return cleanDataSourceLabel(source || tableName || "");
  }

  function normalizeCount(value) {
    if (value === null || value === undefined || value === "") return null;
    if (Array.isArray(value)) return value.length;
    var numberValue = Number(value);
    return isNaN(numberValue) ? value : numberValue;
  }

  function normalizeDataSourceInfo(input, fallbackTask) {
    input = input || {};

    var detail = input.detail || input.data || null;
    var detailObject = detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};
    var nestedDetail = detailObject.detail && typeof detailObject.detail === "object" ? detailObject.detail : {};
    var diagnostics = detailObject.diagnostics && typeof detailObject.diagnostics === "object" ? detailObject.diagnostics : {};
    var source = normalizeSourceKey(firstValue(
      objectValue(input, ["sourceKey", "source", "winnerSource", "currentSource"]),
      objectValue(detailObject, ["sourceKey", "source", "winnerSource", "currentSource"]),
      objectValue(nestedDetail, ["sourceKey", "source", "winnerSource", "currentSource"]),
      objectValue(diagnostics, ["sourceKey", "source", "winnerSource", "currentSource"])
    ));
    var table = firstValue(
      objectValue(input, ["registryTable", "table", "tableName", "sheetName"]),
      objectValue(detailObject, ["registryTable", "table", "tableName", "sheetName"]),
      objectValue(nestedDetail, ["registryTable", "table", "tableName", "sheetName"]),
      objectValue(diagnostics, ["registryTable", "table", "tableName", "sheetName"])
    );
    var sourceLabel = firstValue(
      objectValue(input, ["sourceLabel", "winnerLabel", "label"]),
      objectValue(detailObject, ["sourceLabel", "winnerLabel", "label"]),
      objectValue(nestedDetail, ["sourceLabel", "winnerLabel", "label"]),
      objectValue(diagnostics, ["sourceLabel", "winnerLabel", "label"])
    );
    var action = firstValue(
      objectValue(input, ["action", "resourceName", "name"]),
      objectValue(detailObject, ["action", "resourceName", "name"]),
      objectValue(nestedDetail, ["action", "resourceName", "name"]),
      fallbackTask
    );
    var count = firstValue(
      objectValue(input, ["count", "rowsCount", "rowCount", "projectsCount", "appsCount", "total"]),
      objectValue(detailObject, ["count", "rowsCount", "rowCount", "projectsCount", "appsCount", "total"]),
      objectValue(nestedDetail, ["count", "rowsCount", "rowCount", "projectsCount", "appsCount", "total"])
    );

    if (count === "" && Array.isArray(input.projects)) count = input.projects.length;
    if (count === "" && Array.isArray(input.apps)) count = input.apps.length;
    if (count === "" && Array.isArray(detailObject.projects)) count = detailObject.projects.length;
    if (count === "" && Array.isArray(detailObject.apps)) count = detailObject.apps.length;

    return {
      task: String(fallbackTask || input.task || input.name || "").trim(),
      status: String(input.status || input.state || "").trim().toLowerCase(),
      source: source,
      sourceLabel: sourceLabelFromSource(source, table, sourceLabel),
      provider: firstValue(
        objectValue(input, ["provider"]),
        objectValue(detailObject, ["provider"]),
        source.indexOf("supabase") >= 0 ? "supabase" : ""
      ),
      transport: firstValue(
        objectValue(input, ["transport", "via"]),
        objectValue(detailObject, ["transport", "via"]),
        source.indexOf("supabase") >= 0 || source.indexOf("cloudflare") >= 0 || source.indexOf("skhps-backend") >= 0 ? "cloudflare-worker" : ""
      ),
      table: table,
      action: action,
      dataType: firstValue(
        objectValue(input, ["dataType", "type"]),
        objectValue(detailObject, ["dataType", "type"]),
        objectValue(nestedDetail, ["dataType", "type"])
      ),
      count: normalizeCount(count),
      env: firstValue(
        objectValue(input, ["env", "runtime", "runtimeEnv"]),
        objectValue(detailObject, ["env", "runtime", "runtimeEnv"]),
        objectValue(nestedDetail, ["env", "runtime", "runtimeEnv"])
      ),
      gateTask: firstValue(
        objectValue(input, ["gateTask", "task"]),
        objectValue(detailObject, ["gateTask", "task"]),
        fallbackTask
      ),
      winner: firstValue(
        objectValue(input, ["winner", "winnerSource"]),
        objectValue(detailObject, ["winner", "winnerSource"])
      ),
      updatedAt: firstValue(
        objectValue(input, ["updatedAt", "finishedAt", "completedAt", "timestamp"]),
        objectValue(detailObject, ["updatedAt", "finishedAt", "completedAt", "timestamp"])
      )
    };
  }

  function hasDataSourceInfo(info) {
    if (!info) return false;

    return Boolean(
      info.source ||
      info.sourceLabel ||
      info.provider ||
      info.transport ||
      info.table ||
      info.count !== null && info.count !== undefined ||
      info.action && isDataAction(info.action)
    );
  }

  function isDataAction(action) {
    action = String(action || "").toLowerCase();

    return Boolean(
      action.indexOf("externalprojects") >= 0 ||
      action.indexOf("externalapps") >= 0 ||
      action.indexOf("quickloginstaff") >= 0 ||
      action.indexOf("staff") >= 0 ||
      action.indexOf("signin") >= 0 ||
      action.indexOf("inventory") >= 0 ||
      action.indexOf("registry") >= 0 ||
      action.indexOf("launcher") >= 0
    );
  }

  function isDataGateTask(taskName, extraData) {
    taskName = String(taskName || "").toLowerCase();

    return Boolean(
      hasDataSourceInfo(normalizeDataSourceInfo(extraData || {}, taskName)) ||
      taskName.indexOf("external-apps") >= 0 ||
      taskName.indexOf("backend-project-launcher") >= 0 ||
      taskName.indexOf("quick-login-staff") >= 0 ||
      taskName.indexOf("qr-signin") >= 0 ||
      taskName.indexOf("dressing-inventory") >= 0
    );
  }

  function promoteDataSource(taskName, extraData) {
    var info;

    if (!isDataGateTask(taskName, extraData)) return;

    info = normalizeDataSourceInfo(extraData || {}, taskName);

    if (!hasDataSourceInfo(info)) return;

    mergeSection("data", {
      task: info.task || taskName || state.data.task || "",
      status: info.status || "ok",
      message: info.sourceLabel || state.data.message || info.task || taskName || "data ready",
      detail: state.data.detail || null,
      source: info.source || state.data.source || "",
      sourceLabel: info.sourceLabel || state.data.sourceLabel || "",
      provider: info.provider || state.data.provider || "",
      transport: info.transport || state.data.transport || "",
      table: info.table || state.data.table || "",
      action: info.action || state.data.action || "",
      dataType: info.dataType || state.data.dataType || "",
      count: info.count !== null && info.count !== undefined ? info.count : state.data.count,
      env: info.env || state.data.env || "",
      gateTask: info.gateTask || taskName || state.data.gateTask || "",
      winner: info.winner || state.data.winner || "",
      updatedAt: nowIso()
    });
  }

  function dataSourceFromBackendCalls() {
    var calls = state.backend && state.backend.calls ? state.backend.calls : [];
    var i;
    var info;

    for (i = calls.length - 1; i >= 0; i -= 1) {
      if (!calls[i]) continue;
      if (String(calls[i].status || "").toLowerCase() === "running") continue;
      if (!isDataAction(calls[i].action || calls[i].resourceName || "")) continue;

      info = normalizeDataSourceInfo(calls[i], calls[i].action || calls[i].resourceName || "");
      if (hasDataSourceInfo(info)) return info;
    }

    return null;
  }

  function dataSourceFromLogs() {
    var i;
    var entry;
    var data;
    var action;
    var source;
    var info;

    for (i = state.logs.length - 1; i >= 0; i -= 1) {
      entry = state.logs[i] || {};
      data = entry.data && typeof entry.data === "object" ? entry.data : {};
      action = data.action || entry.action || entry.message || "";
      source = normalizeSourceKey(data.source || data.sourceKey || data.winnerSource || "");

      if (!isDataAction(action) && source.indexOf("supabase") < 0 && source.indexOf("apps-script") < 0 && source.indexOf("skhps-backend") < 0) {
        continue;
      }

      if (entry.status === "RUN" && !source && !data.sourceLabel) continue;

      info = normalizeDataSourceInfo(Object.assign({}, data, {
        source: source || data.source,
        status: entry.status === "FAIL" ? "fail" : entry.status === "RUN" ? "waiting" : "ok",
        action: action,
        timestamp: entry.timestamp
      }), action);

      if (hasDataSourceInfo(info)) return info;
    }

    return null;
  }

  function dataSourceFromLoadingGate() {
    var completed = state.loadingGate.completedTasks || [];
    var taskStates = state.loadingGate.taskStates || {};
    var i;
    var taskName;
    var info;

    for (i = completed.length - 1; i >= 0; i -= 1) {
      taskName = completed[i];
      info = normalizeDataSourceInfo(taskStates[taskName] || {}, taskName);
      if (hasDataSourceInfo(info)) return info;
    }

    return null;
  }

  function resolveActiveDataSource() {
    var explicit = normalizeDataSourceInfo(Object.assign({}, state.data || {}, {
      detail: state.data && state.data.detail
    }), state.data && state.data.task || "");
    var fromGate;
    var fromExternalApps;
    var fromBackend;
    var fromLogs;

    if (hasDataSourceInfo(explicit)) return explicit;

    fromGate = dataSourceFromLoadingGate();
    if (fromGate) return fromGate;

    fromExternalApps = normalizeDataSourceInfo(state.externalApps || {}, "external-apps-runtime");
    if (state.externalApps && state.externalApps.loaded && hasDataSourceInfo(fromExternalApps)) return fromExternalApps;

    fromBackend = dataSourceFromBackendCalls();
    if (fromBackend) return fromBackend;

    fromLogs = dataSourceFromLogs();
    if (fromLogs) return fromLogs;

    return explicit;
  }

  function dataSourceReason(info, fallback) {
    var parts;

    info = info || {};
    parts = [
      info.sourceLabel || "",
      info.source ? "source=" + info.source : "",
      info.table ? "table=" + info.table : "",
      info.action ? "action=" + info.action : "",
      info.count !== null && info.count !== undefined && info.count !== "" ? "rows=" + info.count : ""
    ].filter(Boolean);

    return parts.join(" | ") || fallback || "";
  }

  function formatDuration(ms) {
    if (ms === null || ms === undefined || ms === "") return "-";
    ms = Number(ms);
    if (isNaN(ms) || ms < 0) return "-";
    if (ms < 1000) return Math.round(ms) + "ms";
    return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s";
  }

  function elapsedSince(iso) {
    var started = iso ? Date.parse(iso) : NaN;
    if (isNaN(started)) return null;
    return Date.now() - started;
  }

  function failedTaskMap() {
    var map = {};
    (state.loadingGate.failedTasks || []).forEach(function (item) {
      if (item && item.task) {
        map[item.task] = item.error || "failed";
      }
    });
    return map;
  }

  function loadingGateTaskRows() {
    var required = state.loadingGate.requiredTasks || [];
    var completed = state.loadingGate.completedTasks || [];
    var taskStates = state.loadingGate.taskStates || {};
    var failures = failedTaskMap();

    return required.map(function (taskName) {
      var taskState = taskStates[taskName] || {};
      var failed = failures[taskName];
      var done = completed.indexOf(taskName) >= 0;
      var status = failed ? "fail" : done ? "ok" : "waiting";
      var duration = taskState.durationMs;

      if ((duration === null || duration === undefined) && taskState.requiredAt) {
        duration = elapsedSince(taskState.requiredAt);
      }

      var sourceParts = [
        taskState.sourceLabel ? "source=" + taskState.sourceLabel : "",
        taskState.provider ? "provider=" + taskState.provider : "",
        taskState.transport ? "via=" + taskState.transport : "",
        taskState.table ? "table=" + taskState.table : "",
        taskState.dataType ? "data=" + taskState.dataType : ""
      ].filter(Boolean);

      return {
        name: taskName,
        status: status,
        durationMs: duration,
        detail: [
          status === "waiting" ? "waiting" : status === "ok" ? "completed" : "failed",
          formatDuration(duration),
          sourceParts.join(" | "),
          failed || ""
        ].filter(Boolean).join(" | "),
        error: failed || ""
      };
    });
  }

  function waitingBackendReason() {
    var calls = state.backend && state.backend.calls ? state.backend.calls : [];
    var running = calls.filter(function (call) {
      return String(call.status || "").toLowerCase() === "running";
    });

    if (running.length) {
      return "waiting for " + running.map(function (call) {
        return call.action || call.resourceName || "backend call";
      }).join(", ");
    }

    if (!state.config || !state.config.loaded) {
      return "waiting for config/api endpoint";
    }

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      return "waiting for backend-client.js";
    }

    if (state.backend && state.backend.loaded && !calls.length) {
      return "backend loaded; no calls yet";
    }

    return "waiting for first backend call";
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
      var calls = state.backend.calls || [];
      var running = calls.filter(function (call) {
        return String(call.status || "").toLowerCase() === "running";
      });

      if (running.length) {
        return {
          label: "running",
          className: "skhps-runtime-waiting",
          reason: waitingBackendReason()
        };
      }

      return {
        label: state.backend.healthy === true ? "healthy" : "loaded",
        className: "skhps-runtime-ok",
        reason: calls.length ? state.backend.endpoint || "backend loaded" : waitingBackendReason()
      };
    }

    return {
      label: "waiting",
      className: "skhps-runtime-waiting",
      reason: waitingBackendReason()
    };
  }

  function summarizeCssRuntime() {
    if (state.cssRuntime && state.cssRuntime.loaded) {
      var sourceLabel = cssSourceDisplay(state.cssRuntime.source);
      var reason = [
        sourceLabel || "css runtime loaded",
        state.cssRuntime.refreshStatus ? "refresh=" + state.cssRuntime.refreshStatus : "",
        state.cssRuntime.appliedRefresh ? "applied refresh" : "",
        state.cssRuntime.hash ? "hash=" + state.cssRuntime.hash : ""
      ].filter(Boolean).join(" | ");

      return {
        label: sourceLabel || "loaded",
        className: state.cssRuntime.refreshStatus === "failed" ? "skhps-runtime-warn" : "skhps-runtime-ok",
        reason: reason
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
    var detail = data.detail && typeof data.detail === "object" ? data.detail : {};
    var activeDataSource = resolveActiveDataSource();
    var status = String(data.status || activeDataSource.status || "").toLowerCase();
    var isStaffDirectory = detail.dataType === "staff-directory" || data.dataType === "staff-directory" || data.task === "quick-login-staff";
    var label = data.message || activeDataSource.sourceLabel || data.task || "not specified";
    var reason;

    if (isStaffDirectory) {
      reason = detail.sourceLabel || detail.table || "人員主檔";

      if (status === "ok" || status === "green" || status === "success") {
        label = reason;
      } else if (status === "waiting" || status === "loading" || status === "pending" || status === "run") {
        label = "人員主檔載入中";
      } else if (status === "fail" || status === "failed" || status === "error" || status === "red") {
        label = "人員主檔讀取失敗";
      }
    } else {
      reason = dataSourceReason(activeDataSource, [
        data.task || "",
        detail.dataType || data.dataType ? "data=" + (detail.dataType || data.dataType) : "",
        detail.sourceLabel || data.sourceLabel ? "source=" + (detail.sourceLabel || data.sourceLabel) : ""
      ].filter(Boolean).join(" | "));
    }

    if (status === "ok" || status === "green" || status === "success") {
      return {
        label: label,
        className: "skhps-runtime-ok",
        reason: reason || data.task || "data ok"
      };
    }

    if (status === "fail" || status === "failed" || status === "error" || status === "red") {
      return {
        label: label,
        className: "skhps-runtime-fail",
        reason: reason || data.task || "data failed"
      };
    }

    if (status === "warn" || status === "warning" || status === "yellow") {
      return {
        label: label,
        className: "skhps-runtime-waiting",
        reason: reason || data.task || "data warning"
      };
    }

    if (status === "waiting" || status === "loading" || status === "pending" || status === "run") {
      return {
        label: label,
        className: "skhps-runtime-waiting",
        reason: reason || data.task || "data loading"
      };
    }

    if (activeDataSource && (activeDataSource.sourceLabel || activeDataSource.source || activeDataSource.action)) {
      return {
        label: activeDataSource.sourceLabel || activeDataSource.action || "data source detected",
        className: "skhps-runtime-ok",
        reason: dataSourceReason(activeDataSource, "data source detected")
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

  function hostEnvDisplay() {
    var hostEnv = state.host && state.host.env ? state.host.env : "";
    var effective = state.runtime && state.runtime.effective ? state.runtime.effective : "";

    if ((hostEnv === "UNKNOWN" || hostEnv === "EXTERNAL") && effective) {
      return "EXTERNAL→" + effective;
    }

    if (hostEnv === "LOCAL" && effective && effective !== "LOCAL" && effective !== "UNKNOWN") {
      return "LOCAL→" + effective;
    }

    return hostEnv || "UNKNOWN";
  }

  function cssSourceDisplay(source) {
    var map = {
      "css-file": "uni-CSS.CSS",
      "localStorage-cache": "localStorage",
      "sheet-refresh": "Sheet",
      "csv": "Sheet",
      "backend": "Backend",
      "default-fallback": "Default CSS"
    };

    return map[source] || source || "";
  }

  function envLabel(value) {
    return normalizeRuntime(value) || "UNKNOWN";
  }

  function pageEnvDisplay() {
    return envLabel(state.host && state.host.env);
  }

  function runtimeRequestedDisplay() {
    var requested = envLabel(state.runtime && state.runtime.requested);
    return requested === "UNKNOWN" ? "AUTO" : requested;
  }

  function runtimeEffectiveDisplay() {
    return envLabel(state.runtime && state.runtime.effective);
  }

  function runtimeSummaryDisplay() {
    var requested = runtimeRequestedDisplay();
    var effective = runtimeEffectiveDisplay();

    if (requested === "AUTO" || requested === effective) {
      return "Runtime " + effective;
    }

    return "Runtime " + requested + "→" + effective;
  }

  function scriptBackendEnvDisplay() {
    return envLabel(
      state.backend && state.backend.env ||
      state.runtime && state.runtime.effective
    );
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

  function roundedRectInfo(element) {
    var rect;

    if (!element || !element.getBoundingClientRect) {
      return {
        exists: false,
        top: null,
        bottom: null,
        left: null,
        right: null,
        width: 0,
        height: 0
      };
    }

    rect = element.getBoundingClientRect();

    return {
      exists: true,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function findRuntimeHeader() {
    return document.querySelector("[data-skhps-header]") ||
      document.querySelector(".skhps-header") ||
      document.getElementById("header");
  }

  function findRuntimeFooter() {
    return document.querySelector("[data-skhps-footer]") ||
      document.querySelector(".skhps-footer") ||
      document.querySelector("footer");
  }

  function rwdModeForWidth(width) {
    width = Math.round(Number(width || 0));

    if (width <= 480) {
      return {
        mode: "phone-compact",
        label: "手機窄版 phone-compact",
        reason: "layoutWidth <= 480"
      };
    }

    if (width <= 720) {
      return {
        mode: "phone",
        label: "手機版 phone",
        reason: "481 <= layoutWidth <= 720"
      };
    }

    if (width <= 960) {
      return {
        mode: "tablet",
        label: "平板 / 窄版 tablet",
        reason: "721 <= layoutWidth <= 960"
      };
    }

    if (width <= 1200) {
      return {
        mode: "desktop",
        label: "桌機版 desktop",
        reason: "961 <= layoutWidth <= 1200"
      };
    }

    return {
      mode: "wide",
      label: "寬版 wide",
      reason: "layoutWidth > 1200"
    };
  }

  function mediaQueryMatches() {
    function match(query) {
      try {
        return Boolean(window.matchMedia && window.matchMedia(query).matches);
      } catch (error) {
        return false;
      }
    }

    return [
      "(max-width:480px)=" + (match("(max-width:480px)") ? "true" : "false"),
      "(max-width:720px)=" + (match("(max-width:720px)") ? "true" : "false"),
      "(max-width:960px)=" + (match("(max-width:960px)") ? "true" : "false"),
      "(min-width:961px)=" + (match("(min-width:961px)") ? "true" : "false")
    ].join(" / ");
  }

  function currentLayoutMetrics() {
    var viewport = window.visualViewport || null;
    var layoutWidth = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
    var layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    var visualWidth = Math.round(viewport && viewport.width ? viewport.width : layoutWidth);
    var visualHeight = Math.round(viewport && viewport.height ? viewport.height : layoutHeight);
    var offsetLeft = Math.round(viewport && viewport.offsetLeft ? viewport.offsetLeft : 0);
    var offsetTop = Math.round(viewport && viewport.offsetTop ? viewport.offsetTop : 0);
    var header = roundedRectInfo(findRuntimeHeader());
    var footer = roundedRectInfo(findRuntimeFooter());
    var orientation = layoutHeight >= layoutWidth ? "portrait" : "landscape";
    var rwd = rwdModeForWidth(layoutWidth);
    var safeTop = header.exists ? Math.max(0, header.bottom) : 0;
    var usableBottom = footer.exists ? Math.max(0, Math.min(layoutHeight, footer.top)) : layoutHeight;
    var usableHeight = Math.max(0, usableBottom - safeTop);
    var keyboardGap = Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));

    return {
      orientation: orientation,
      rwdMode: rwd.mode,
      rwdLabel: rwd.label,
      rwdReason: rwd.reason,
      mediaMatches: mediaQueryMatches(),
      layoutWidth: layoutWidth,
      layoutHeight: layoutHeight,
      visualWidth: visualWidth,
      visualHeight: visualHeight,
      visualOffsetLeft: offsetLeft,
      visualOffsetTop: offsetTop,
      keyboardGap: keyboardGap,
      header: header,
      footer: footer,
      usableTop: Math.round(safeTop),
      usableBottom: Math.round(usableBottom),
      usableHeight: Math.round(usableHeight),
      updatedAt: new Date().toLocaleTimeString("zh-TW", { hour12: false })
    };
  }

  function formatRectEdges(rect) {
    if (!rect || !rect.exists) return "not found";
    return "top " + rect.top +
      " / bottom " + rect.bottom +
      " / left " + rect.left +
      " / right " + rect.right +
      " / size " + rect.width + "×" + rect.height;
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
    var layoutMetrics = currentLayoutMetrics();
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
    addRow(traffic, "Data", dataSummary.reason || dataSummary.label, dataSummary.className);
    addRow(traffic, "Overall", overall.label, overall.className);

    var env = addSection(panel, "Environment");
    addRow(env, "Host", state.host.hostname || "(file)");
    addRow(env, "Host Env", hostEnvDisplay(), statusClass(state.runtime.effective || state.host.env));
    addRow(env, "Page Env", pageEnvDisplay(), statusClass(pageEnvDisplay()));
    addRow(env, "Runtime Requested", runtimeRequestedDisplay());
    addRow(env, "Runtime Effective", runtimeEffectiveDisplay(), statusClass(runtimeEffectiveDisplay()));
    addRow(env, "Runtime Summary", runtimeSummaryDisplay(), statusClass(runtimeEffectiveDisplay()));
    addRow(env, "Script / Backend Env", scriptBackendEnvDisplay(), statusClass(scriptBackendEnvDisplay()));
    addRow(env, "Backend Endpoint", state.backend.endpoint || "not loaded", statusClass(state.backend.loaded ? "ok" : "waiting"));
    addRow(env, "Override Reason", state.runtime.overrideReason || "-");
    addRow(env, "Fallback Reason", state.runtime.fallbackReason || "-");

    var layoutSection = addSection(panel, "Layout / Viewport");
    addRow(layoutSection, "Orientation", layoutMetrics.orientation === "portrait" ? "直式 portrait" : "橫式 landscape", "skhps-runtime-ok");
    addRow(layoutSection, "RWD mode", layoutMetrics.rwdLabel, "skhps-runtime-ok");
    addRow(layoutSection, "RWD breakpoint", layoutMetrics.rwdReason);
    addRow(layoutSection, "Media query", layoutMetrics.mediaMatches);
    addRow(layoutSection, "Layout viewport", layoutMetrics.layoutWidth + " × " + layoutMetrics.layoutHeight);
    addRow(layoutSection, "Visual viewport", layoutMetrics.visualWidth + " × " + layoutMetrics.visualHeight);
    addRow(layoutSection, "Visual offset", "left " + layoutMetrics.visualOffsetLeft + " / top " + layoutMetrics.visualOffsetTop);
    addRow(layoutSection, "Keyboard / bottom gap", layoutMetrics.keyboardGap + "px");
    addRow(layoutSection, "Header edges", formatRectEdges(layoutMetrics.header), layoutMetrics.header.exists ? "skhps-runtime-ok" : "skhps-runtime-waiting");
    addRow(layoutSection, "Footer edges", formatRectEdges(layoutMetrics.footer), layoutMetrics.footer.exists ? "skhps-runtime-ok" : "skhps-runtime-waiting");
    addRow(layoutSection, "Usable vertical area", "top " + layoutMetrics.usableTop + " / bottom " + layoutMetrics.usableBottom + " / height " + layoutMetrics.usableHeight);
    addRow(layoutSection, "Realtime updated", layoutMetrics.updatedAt);

    var gate = addSection(panel, "Gate / Loading Gate");
    addRow(gate, "Status", gateSummary.reason || gateSummary.label, gateSummary.className);
    addRow(gate, "Release", state.loadingGate.releaseReason || "not released", state.loadingGate.releaseReason ? "skhps-runtime-ok" : "skhps-runtime-waiting");
    var gateList = document.createElement("div");
    gateList.className = "skhps-runtime-checklist";
    loadingGateTaskRows().forEach(function (task) {
      addChecklistItem(gateList, {
        path: task.name,
        status: task.status,
        detail: task.detail,
        error: task.error
      });
    });
    if (gateList.childNodes.length) {
      gate.appendChild(gateList);
    } else {
      addRow(gate, "Tasks", "none declared", "skhps-runtime-waiting");
    }

    var configSection = addSection(panel, "Config");
    addRow(configSection, "Status", configSummary.reason || configSummary.label, configSummary.className);
    addRow(configSection, "Source", state.config.source || "not loaded", statusClass(String(state.config.loaded)));
    addRow(configSection, "Duration", formatDuration(state.config.durationMs));

    var backendSection = addSection(panel, "Backend");
    addRow(backendSection, "Status", backendSummary.reason || backendSummary.label, backendSummary.className);
    addRow(backendSection, "Endpoint", state.backend.endpoint || "not loaded", statusClass(state.backend.healthy === false ? "fail" : state.backend.loaded ? "ok" : "waiting"));
    addRow(backendSection, "Runtime Env", state.backend.env || state.runtime.effective || "-");
    addRow(backendSection, "Duration", formatDuration(state.backend.durationMs));
    if (state.backend.calls && state.backend.calls.length) {
      var callList = document.createElement("div");
      callList.className = "skhps-runtime-call-list";
      state.backend.calls.slice(-20).forEach(function (call) {
        addBackendCall(callList, call);
      });
      backendSection.appendChild(callList);
    }

    var cssSection = addSection(panel, "CSS");
    addRow(cssSection, "Status", cssSummary.reason || cssSummary.label, cssSummary.className);
    addRow(cssSection, "Source", state.cssRuntime.loaded ? cssSourceDisplay(state.cssRuntime.source) : "not loaded", statusClass(String(state.cssRuntime.loaded)));
    addRow(cssSection, "Source Key", state.cssRuntime.source || "-");
    addRow(cssSection, "CSS File URL", state.cssRuntime.cssFileUrl || "-");
    addRow(cssSection, "CSS File Fetch", [
      state.cssRuntime.cssFileFetchStatus || "",
      state.cssRuntime.cssFileFetchOk === true ? "OK" : state.cssRuntime.cssFileFetchOk === false ? "FAILED" : ""
    ].filter(Boolean).join(" / ") || "-", statusClass(state.cssRuntime.cssFileFetchOk === false ? "fail" : state.cssRuntime.cssFileFetchOk === true ? "ok" : ""));
    addRow(cssSection, "CSS File Error", state.cssRuntime.cssFileFetchError || "-");
    addRow(cssSection, "Updated At", state.cssRuntime.updatedAt || state.cssRuntime.generatedAt || "-");
    addRow(cssSection, "Version", state.cssRuntime.version || "-");
    addRow(cssSection, "Hash", state.cssRuntime.hash || "-");
    addRow(cssSection, "Sheet Refresh", state.cssRuntime.refreshStatus || "-", statusClass(state.cssRuntime.refreshStatus === "failed" ? "fail" : state.cssRuntime.refreshStatus === "success" ? "ok" : ""));
    addRow(cssSection, "Last Refresh", state.cssRuntime.lastRefreshAt || "-");
    addRow(cssSection, "Applied New CSS", state.cssRuntime.appliedRefresh === undefined ? "-" : String(state.cssRuntime.appliedRefresh), statusClass(String(state.cssRuntime.appliedRefresh)));
    addRow(cssSection, "Refresh Error", state.cssRuntime.refreshError || "-");
    addRow(cssSection, "Rows", [
      state.cssRuntime.rowsCount !== undefined ? state.cssRuntime.rowsCount + " raw" : "",
      state.cssRuntime.latestRowsCount !== undefined ? state.cssRuntime.latestRowsCount + " latest" : ""
    ].filter(Boolean).join(" / ") || "-");
    addRow(cssSection, "Initial Load", formatDuration(state.cssRuntime.initialDurationMs || state.cssRuntime.durationMs));
    addRow(cssSection, "Refresh Duration", state.cssRuntime.refreshDurationMs === "" || state.cssRuntime.refreshDurationMs === undefined ? "-" : formatDuration(state.cssRuntime.refreshDurationMs));

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

    var dataDetail = state.data && state.data.detail ? state.data.detail : {};
    var activeDataSource = resolveActiveDataSource();
    var dataSection = addSection(panel, "Data");
    var conciseSourceLabel = cleanDataSourceLabel(activeDataSource.sourceLabel || "");
    var conciseCount = activeDataSource.count === null || activeDataSource.count === undefined || activeDataSource.count === ""
      ? "-"
      : activeDataSource.count;

    addRow(dataSection, "Task", activeDataSource.task || state.data && state.data.task || "-", dataSummary.className);
    addRow(dataSection, "Status", state.data && state.data.status || activeDataSource.status || "-", dataSummary.className);
    addRow(dataSection, "Source", conciseSourceLabel || dataSummary.label || "-", conciseSourceLabel ? "skhps-runtime-ok" : dataSummary.className);
    addRow(dataSection, "Rows", conciseCount);
    addRow(dataSection, "Updated", activeDataSource.updatedAt || state.data && state.data.updatedAt || "-");

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

  function installRealtimeLayoutMetrics() {
    var scheduled = false;

    function panelIsOpen() {
      return document.documentElement.getAttribute("data-skhps-runtime-panel-open") === "true" ||
        document.documentElement.classList.contains("runtime-state-full");
    }

    function scheduleLayoutRender() {
      if (!panelIsOpen()) return;
      if (scheduled) return;

      scheduled = true;
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          scheduled = false;
          renderPanel();
        });
        return;
      }

      window.setTimeout(function () {
        scheduled = false;
        renderPanel();
      }, 80);
    }

    window.addEventListener("resize", scheduleLayoutRender, { passive: true });
    window.addEventListener("scroll", scheduleLayoutRender, { passive: true });
    window.addEventListener("orientationchange", scheduleLayoutRender, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleLayoutRender, { passive: true });
      window.visualViewport.addEventListener("scroll", scheduleLayoutRender, { passive: true });
    }

    document.addEventListener("skhps-runtime-updated", scheduleLayoutRender);
    document.addEventListener("click", function () {
      window.setTimeout(scheduleLayoutRender, 80);
    }, true);
  }

  installRealtimeLayoutMetrics();

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
