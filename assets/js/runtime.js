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

  function hostEnvFromLocation() {
    var protocol = String(window.location.protocol || "").toLowerCase();
    var host = String(window.location.hostname || "").toLowerCase();

    if (protocol === "file:" || host === "" || host === "localhost" || host === "127.0.0.1") {
      return "LOCAL";
    }

    if (host === "skhps.jonaminz.com") {
      return "PROD";
    }

    if (host === "dev-skhps.jonaminz.com") {
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

  function initialEffectiveRuntime(hostEnv, requested) {
    var requestedRuntime = normalizeRuntime(requested);

    if (requestedRuntime) {
      return requestedRuntime;
    }

    return hostEnv || "UNKNOWN";
  }

  var state = {
    startedAt: nowIso(),
    host: {
      hostname: window.location.hostname || "",
      env: hostEnvFromLocation()
    },
    runtime: {
      requested: initialRequestedRuntime(),
      effective: ""
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
    loadingGate: {
      requiredTasks: [],
      completedTasks: [],
      failedTasks: [],
      releaseReason: ""
    },
    modules: {},
    logs: []
  };

  state.runtime.effective = initialEffectiveRuntime(state.host.env, state.runtime.requested);

  function emitUpdated() {
    try {
      document.dispatchEvent(new CustomEvent("skhps-runtime-updated", {
        detail: getState()
      }));
    } catch (error) {}

    scheduleRender();
  }

  function log(payload) {
    payload = payload || {};

    var entry = {
      timestamp: payload.timestamp || nowIso(),
      level: payload.level || "info",
      module: payload.module || "runtime",
      message: payload.message || "",
      data: payload.data || payload.detail || null
    };

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
      message: "started"
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
      data: extraData || null
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
      data: extraData || null
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

    if (requested) {
      patch.effective = requested;
    } else if (proposedEffective) {
      patch.effective = proposedEffective;
    } else {
      patch.effective = state.host && state.host.env || "UNKNOWN";
    }

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

  function setCssRuntime(data) {
    mergeSection("cssRuntime", data);
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
      ".skhps-runtime-panel{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#101820;color:#f5f7fb;border-top:1px solid rgba(255,255,255,.14);padding:16px;line-height:1.5;font-size:13px}",
      ".skhps-runtime-panel.is-hidden{display:none}",
      ".skhps-runtime-section{margin:0 0 14px}",
      ".skhps-runtime-title{font-weight:700;margin:0 0 6px;color:#ffffff}",
      ".skhps-runtime-row{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid rgba(255,255,255,.08);padding:3px 0}",
      ".skhps-runtime-row strong{min-width:140px;color:#b8d7ff}",
      ".skhps-runtime-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:0 0 14px}",
      ".skhps-runtime-card{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);border-radius:8px;padding:10px}",
      ".skhps-runtime-card-label{display:block;color:#9fb1c7;font-size:12px;margin:0 0 3px}",
      ".skhps-runtime-card-value{display:block;font-weight:700;color:#fff}",
      ".skhps-runtime-checklist{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:6px}",
      ".skhps-runtime-checkitem{display:flex;align-items:flex-start;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:7px;background:rgba(255,255,255,.035)}",
      ".skhps-runtime-checkmark{flex:0 0 auto;width:22px;text-align:center;font-weight:700}",
      ".skhps-runtime-checkbody{min-width:0}",
      ".skhps-runtime-checkname{font-weight:700;color:#fff;word-break:break-word}",
      ".skhps-runtime-checkmeta{color:#aebbd0;font-size:12px;word-break:break-word}",
      ".skhps-runtime-flow{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}",
      ".skhps-runtime-flow-card{position:relative;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);border-radius:8px;padding:10px}",
      ".skhps-runtime-flow-card::before{content:'';position:absolute;left:17px;top:48px;bottom:12px;width:1px;background:rgba(255,255,255,.16)}",
      ".skhps-runtime-flow-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:7px;margin-bottom:7px}",
      ".skhps-runtime-flow-number{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:20px;border-radius:999px;background:rgba(184,215,255,.16);color:#b8d7ff;font-size:12px;font-weight:700;margin-right:6px}",
      ".skhps-runtime-flow-title{font-weight:700;color:#fff;word-break:break-word}",
      ".skhps-runtime-flow-meta{color:#aebbd0;font-size:12px;word-break:break-word;margin-top:2px}",
      ".skhps-runtime-flow-status{font-weight:700;white-space:nowrap}",
      ".skhps-runtime-flow-steps{display:flex;flex-direction:column;gap:5px}",
      ".skhps-runtime-flow-step{position:relative;display:grid;grid-template-columns:42px 1fr;gap:8px;align-items:start}",
      ".skhps-runtime-flow-step-status{position:relative;z-index:1;background:#101820;font-weight:700;font-size:12px}",
      ".skhps-runtime-flow-step-name{color:#eef4ff;word-break:break-word}",
      ".skhps-runtime-flow-step-detail{color:#aebbd0;font-size:12px;word-break:break-word}",
      ".skhps-runtime-flow-note{color:#aebbd0;font-size:12px;margin:-4px 0 8px}",
      ".skhps-runtime-call-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:8px}",
      ".skhps-runtime-call{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.035);border-radius:8px;padding:9px}",
      ".skhps-runtime-call-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px}",
      ".skhps-runtime-call-title{font-weight:700;color:#fff;word-break:break-word}",
      ".skhps-runtime-call-status{font-weight:700;white-space:nowrap}",
      ".skhps-runtime-call-meta{color:#aebbd0;font-size:12px;word-break:break-word}",
      ".skhps-runtime-ok{color:#8ee69f}",
      ".skhps-runtime-fail{color:#ff9a9a}",
      ".skhps-runtime-waiting{color:#ffd479}",
      ".skhps-runtime-log{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:#d8e1ef;white-space:pre-wrap;word-break:break-word}"
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
    val.className = className || "";
    val.textContent = text(value);

    row.appendChild(key);
    row.appendChild(val);
    parent.appendChild(row);
  }

  function addSection(panel, title) {
    var section = document.createElement("section");
    section.className = "skhps-runtime-section";

    var heading = document.createElement("h2");
    heading.className = "skhps-runtime-title";
    heading.textContent = title;

    section.appendChild(heading);
    panel.appendChild(section);
    return section;
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
      var scriptPath = data.scriptPath || "";

      if (!scriptPath) return;

      scripts[scriptPath] = scripts[scriptPath] || {
        path: scriptPath,
        url: data.scriptUrl || data.url || "",
        optional: Boolean(data.optional),
        status: "waiting",
        error: "",
        firstIndex: index,
        lastIndex: index
      };

      scripts[scriptPath].lastIndex = index;

      if (entry.message.indexOf("-start ") >= 0) {
        scripts[scriptPath].status = "waiting";
      }

      if (entry.message.indexOf("-loaded ") >= 0) {
        scripts[scriptPath].status = "ok";
        scripts[scriptPath].error = "";
      }

      if (entry.message.indexOf("-error") >= 0 || data.error) {
        scripts[scriptPath].status = data.optional ? "warn" : "fail";
        scripts[scriptPath].error = data.error || entry.message;
      }
    });

    return Object.keys(scripts).map(function (key) {
      return scripts[key];
    });
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
    var card = document.createElement("article");
    card.className = "skhps-runtime-flow-card";

    var head = document.createElement("div");
    head.className = "skhps-runtime-flow-head";

    var titleWrap = document.createElement("div");

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

    titleWrap.appendChild(title);
    if (meta.textContent) titleWrap.appendChild(meta);
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
    var scripts = scriptStatusFromLogs();
    var actions = actionStatusFromLogs();
    var functions = functionStatusFromLogs();
    var cards = [];
    var usedFunctions = {};

    scripts.forEach(function (script) {
      var scriptFile = baseName(script.path);
      var steps = [{
        name: "load script",
        status: script.status,
        detail: script.path,
        error: script.error,
        firstIndex: script.firstIndex
      }];
      var cardStatus = script.status;
      var firstIndex = script.firstIndex;

      functions.forEach(function (fn) {
        if (fn.file !== scriptFile) return;
        usedFunctions[fn.path] = true;
        cardStatus = mergeFlowStatus(cardStatus, fn.status);
        firstIndex = Math.min(firstIndex, fn.firstIndex);
        steps.push({
          name: fn.functionName,
          status: fn.status,
          detail: fn.detail,
          error: fn.error,
          firstIndex: fn.firstIndex
        });
      });

      steps.sort(function (a, b) {
        return (a.firstIndex || 0) - (b.firstIndex || 0);
      });

      cards.push({
        title: script.path,
        meta: script.url,
        status: cardStatus,
        firstIndex: firstIndex,
        steps: steps
      });
    });

    actions.forEach(function (action) {
      cards.push({
        title: "action: " + action.path,
        meta: action.url,
        status: action.status,
        firstIndex: action.firstIndex,
        steps: [{
          name: action.path,
          status: action.status,
          detail: action.error || action.url,
          firstIndex: action.firstIndex
        }]
      });
    });

    functions.forEach(function (fn) {
      if (usedFunctions[fn.path]) return;

      cards.push({
        title: fn.file,
        meta: "runtime function",
        status: fn.status,
        firstIndex: fn.firstIndex,
        steps: [{
          name: fn.functionName,
          status: fn.status,
          detail: fn.detail,
          error: fn.error,
          firstIndex: fn.firstIndex
        }]
      });
    });

    return cards.sort(function (a, b) {
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
    var summary = document.createElement("div");
    summary.className = "skhps-runtime-summary";
    addCard(summary, "目前狀態", overall.label, overall.className);
    addCard(summary, "環境", (state.host.env || "UNKNOWN") + " / " + (state.runtime.effective || "UNKNOWN"), statusClass(state.runtime.effective));
    addCard(summary, "Loading Gate", gateSummary.label, gateSummary.className);
    addCard(summary, "Backend", state.backend.healthy === true ? "healthy" : state.backend.loaded ? "loaded" : "waiting", statusClass(state.backend.healthy === false ? "fail" : state.backend.loaded ? "ok" : "waiting"));
    panel.appendChild(summary);

    var env = addSection(panel, "Environment");
    addRow(env, "Host", state.host.hostname || "(file)");
    addRow(env, "Host Env", state.host.env, statusClass(state.host.env));
    addRow(env, "Runtime Requested", state.runtime.requested);
    addRow(env, "Runtime Effective", state.runtime.effective, statusClass(state.runtime.effective));
    addRow(env, "Config", state.config.loaded ? state.config.source : "not loaded", statusClass(String(state.config.loaded)));
    addRow(env, "Backend", state.backend.endpoint || "not loaded", statusClass(state.backend.healthy === false ? "fail" : state.backend.loaded ? "ok" : "waiting"));
    addRow(env, "CSS Runtime", state.cssRuntime.loaded ? state.cssRuntime.source : "not loaded", statusClass(String(state.cssRuntime.loaded)));

    var gate = addSection(panel, "Loading Gate");
    addRow(gate, "Required", state.loadingGate.requiredTasks.join(", ") || "-");
    addRow(gate, "Completed", state.loadingGate.completedTasks.join(", ") || "-");
    addRow(gate, "Failed", state.loadingGate.failedTasks.map(function (item) {
      return item.task + ": " + item.error;
    }).join(" | ") || "-", state.loadingGate.failedTasks.length ? "skhps-runtime-fail" : "skhps-runtime-ok");

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

    var flowCards = buildFlowCards();
    if (flowCards.length) {
      var flow = addSection(panel, "Flow");
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
    state.logs.slice(-20).forEach(function (entry) {
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
    log({
      level: "debug",
      module: detail && detail.file ? detail.file : "runtime",
      message: name,
      data: detail || null
    });
  }

  function warn(name, detail) {
    log({
      level: "warn",
      module: detail && detail.file ? detail.file : "runtime",
      message: name,
      data: detail || null
    });
  }

  function error(name, detail) {
    log({
      level: "error",
      module: detail && detail.file ? detail.file : "runtime",
      message: name,
      data: detail || null
    });
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
    setCssRuntime: setCssRuntime,
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

  log({
    level: "info",
    module: "runtime",
    message: "runtime initialized"
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPanel);
  } else {
    renderPanel();
  }
})();
