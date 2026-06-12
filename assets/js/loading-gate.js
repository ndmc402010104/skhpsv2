/*
檔案位置：skhpsv2/assets/js/loading-gate.js
時間戳記：2026-06-10 UTC+8
用途：全站 loading passive AND gate。
設計：
- gate 不硬寫任務來源。
- 任務可由 HTML 的 data-skhps-loading-tasks 預先宣告，也可由各模組用 SKHPSLoading.require/done/fail 被動傳入。
- 傳進來只有 css-runtime，就只等 css-runtime。
- 傳進來多個 task，就所有 task 都 done/fail-rendered 後才顯示。
*/

(function () {
  "use strict";

  var html = document.documentElement;
  var LOADING_CLASSES = ["skhps-css-loading", "skhps-loading"];
  var SHELL_LOADING_CLASS = "skhps-shell-loading";
  var MAIN_LOADING_CLASS = "skhps-main-loading";
  var CSS_RUNTIME_CACHE_KEY = "skhpsv2.cssSheetRuntimeCache.v1";
  var CSS_RUNTIME_SESSION_READY_KEY = "skhpsv2.cssSheetRuntimeSessionReady.v1";
  var DEFAULT_TIMEOUT_MS = 12000;

  var state = {
    required: {},
    done: {},
    failed: {},
    released: false,
    shellReady: false,
    pageReady: false,
    openedAt: Date.now(),
    releaseReason: "",
    timer: null
  };

  function keys(obj) {
    return Object.keys(obj || {});
  }

  function normalizeTask(task) {
    return String(task || "").trim();
  }

  function log() {
    if (!window.SKHPS_DEBUG_LOADING) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SKHPSLoading]");
    console.log.apply(console, args);
  }

  function runtime() {
    return window.SKHPSRuntime || null;
  }

  function rlog(status, action, detail, durationMs) {
    try {
      if (window.SKHPSRuntimeLog && typeof window.SKHPSRuntimeLog.log === "function") {
        window.SKHPSRuntimeLog.log({
          source: "loading-gate.js",
          category: "loading",
          action: action,
          status: status,
          detail: detail || "",
          durationMs: durationMs
        });
      }
    } catch (error) {}
  }

  rlog("RUN", "moduleStart", "loading-gate.js");
  rlog("RUN", "loadingGateStart", {
    loadingClasses: LOADING_CLASSES.concat([SHELL_LOADING_CLASS, MAIN_LOADING_CLASS]),
    timeoutMs: DEFAULT_TIMEOUT_MS
  });

  try {
    if (window.history && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  } catch (error) {}

  function hasUsableCssRuntimeCache() {
    try {
      if (sessionStorage.getItem(CSS_RUNTIME_SESSION_READY_KEY) !== "1") {
        return false;
      }

      var raw = localStorage.getItem(CSS_RUNTIME_CACHE_KEY);
      if (!raw) return false;

      var cache = JSON.parse(raw);
      return Boolean(cache && cache.cssText);
    } catch (error) {
      return false;
    }
  }

  function setInitialLayerState() {
    var hasDeclaredTasks =
      html.hasAttribute("data-skhps-loading-tasks") ||
      html.hasAttribute("data-loading-tasks");
    var shouldUseLayeredGate =
      hasLoadingClass() ||
      hasDeclaredTasks ||
      html.classList.contains(SHELL_LOADING_CLASS) ||
      html.classList.contains(MAIN_LOADING_CLASS);

    if (!shouldUseLayeredGate) {
      return;
    }

    if (html.getAttribute("data-skhps-shell-ready") !== "true" && hasUsableCssRuntimeCache()) {
      state.shellReady = true;
      html.classList.remove(SHELL_LOADING_CLASS);
      html.setAttribute("data-skhps-shell-ready", "true");
      html.setAttribute("data-skhps-shell-ready-reason", "css-runtime-cache");
      setRuntimeGatePatch({
        shellReady: true,
        shellReadyReason: "css-runtime-cache"
      });
      rlog("INFO", "shellCacheReady", "css-runtime-cache");
    } else if (html.getAttribute("data-skhps-shell-ready") !== "true") {
      html.classList.add(SHELL_LOADING_CLASS);
      html.setAttribute("data-skhps-shell-ready", "false");
    }

    if (html.getAttribute("data-skhps-page-ready") !== "true") {
      html.classList.add(MAIN_LOADING_CLASS);
      html.setAttribute("data-skhps-page-ready", "false");
    }
  }

  function setRuntimeRequired() {
    if (runtime() && typeof runtime().setLoadingRequired === "function") {
      runtime().setLoadingRequired(requiredTasks());
    }

    if (runtime() && typeof runtime().setLoadingGate === "function") {
      runtime().setLoadingGate({
        releaseReason: state.releaseReason || ""
      });
    }
  }

  function runtimeTaskDone(task) {
    if (runtime() && typeof runtime().taskDone === "function") {
      runtime().taskDone(task);
    }
  }

  function runtimeTaskFailed(task, error) {
    if (runtime() && typeof runtime().taskFailed === "function") {
      runtime().taskFailed(task, error);
    }
  }

  function setRuntimeGatePatch(data) {
    if (runtime() && typeof runtime().setLoadingGate === "function") {
      runtime().setLoadingGate(data || {});
    }
  }

  function traceFunction(functionName, status, data) {
    if (runtime() && typeof runtime().log === "function") {
      runtime().log({
        level: status === "error" ? "error" : "debug",
        module: "loading-gate.js",
        message: "function-" + status,
        data: Object.assign({
          file: "loading-gate.js",
          functionName: functionName,
          status: status
        }, data || {})
      });
    }
  }

  function warn() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SKHPSLoading]");
    console.warn.apply(console, args);
  }

  function setTaskAttr(task, status) {
    task = normalizeTask(task);
    if (!task) return;
    html.setAttribute("data-skhps-task-" + task, status);
  }

  function parseTaskList(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeTask).filter(Boolean);
    }

    return String(value || "")
      .split(",")
      .map(normalizeTask)
      .filter(Boolean);
  }

  function hasLoadingClass() {
    return LOADING_CLASSES.some(function (className) {
      return html.classList.contains(className) ||
        (document.body && document.body.classList.contains(className));
    });
  }

  function requiredTasks() {
    return keys(state.required);
  }

  function isReady() {
    var tasks = requiredTasks();

    if (!tasks.length) {
      return false;
    }

    return tasks.every(function (task) {
      return state.done[task] === true;
    });
  }

  function getState() {
    return {
      required: requiredTasks(),
      done: keys(state.done),
      failed: keys(state.failed).map(function (task) {
        return {
          task: task,
          error: state.failed[task]
        };
      }),
      released: state.released,
      shellReady: state.shellReady,
      pageReady: state.pageReady,
      releaseReason: state.releaseReason,
      openedAt: state.openedAt
    };
  }

  function markShellReady(reason, status) {
    if (state.shellReady) return;

    state.shellReady = true;
    html.classList.remove(SHELL_LOADING_CLASS);
    if (document.body) {
      document.body.classList.remove(SHELL_LOADING_CLASS);
    }
    html.setAttribute("data-skhps-shell-ready", "true");
    html.setAttribute("data-skhps-shell-ready-reason", reason || "css-runtime");
    setRuntimeGatePatch({
      shellReady: true,
      shellReadyReason: reason || "css-runtime"
    });
    rlog(status || "OK", "releaseShell", reason || "css-runtime");
  }

  function markPageReady(reason, status) {
    if (state.pageReady) return;

    state.pageReady = true;
    html.classList.remove(MAIN_LOADING_CLASS);
    if (document.body) {
      document.body.classList.remove(MAIN_LOADING_CLASS);
    }
    html.setAttribute("data-skhps-page-ready", "true");
    html.setAttribute("data-skhps-page-ready-reason", reason || "all-ready");
    setRuntimeGatePatch({
      pageReady: true,
      pageReadyReason: reason || "all-ready"
    });
    rlog(status || "OK", "releaseMain", reason || "all-ready");
    scrollPageToTopAfterReady();
  }

  function scrollPageToTopAfterReady() {
    if (html.getAttribute("data-skhps-preserve-scroll") === "true") {
      return;
    }

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        try {
          window.scrollTo({
            top: 0,
            left: 0,
            behavior: "auto"
          });
        } catch (error) {
          window.scrollTo(0, 0);
        }
      });
    });
  }

  function release(reason) {
    if (state.released) return;
    var durationMs = Date.now() - state.openedAt;
    traceFunction("release", "start", {
      reason: reason || "ready"
    });

    state.released = true;
    state.releaseReason = reason || "ready";

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    markShellReady(state.releaseReason, state.releaseReason === "timeout-fallback" ? "WARN" : "OK");
    markPageReady(state.releaseReason, state.releaseReason === "timeout-fallback" ? "WARN" : "OK");

    LOADING_CLASSES.forEach(function (className) {
      html.classList.remove(className);
      if (document.body) {
        document.body.classList.remove(className);
      }
    });

    html.setAttribute("data-skhps-loading-released", "true");
    html.setAttribute("data-skhps-loading-release-reason", state.releaseReason);

    if (runtime() && typeof runtime().done === "function") {
      runtime().done("loadingGate", {
        releaseReason: state.releaseReason
      });
    }

    if (runtime() && typeof runtime().setLoadingGate === "function") {
      runtime().setLoadingGate({
        releaseReason: state.releaseReason
      });
    }

    log("released", getState());
    rlog("OK", "releasePage", state.releaseReason, durationMs);
    traceFunction("release", "done", {
      reason: state.releaseReason
    });
  }

  function isSpareElement(el) {
    if (!el || !el.matches) return false;
    return el.matches(
      "header, footer, #skhps-header, #skhps-footer, #header, #footer, .skhps-header, .skhps-footer, [data-skhps-loading-spare], #skhps-runtime-panel, script, style, link"
    );
  }

  function markLoadingElements() {
    if (!document.body) return;

    Array.prototype.slice.call(document.body.children || []).forEach(function (el) {
      if (isSpareElement(el)) {
        el.classList.add("skhps-loading-spared");
        el.classList.remove("skhps-loading-gated");
      } else {
        el.classList.add("skhps-loading-gated");
        el.classList.remove("skhps-loading-spared");
      }
    });
  }

  function startSpareObserver() {
    if (!document.body || window.__SKHPSLoadingSpareObserver) return;

    window.__SKHPSLoadingSpareObserver = new MutationObserver(function () {
      markLoadingElements();
    });

    window.__SKHPSLoadingSpareObserver.observe(document.body, {
      childList: true
    });
  }

  function initSpareLoadingElements() {
    markLoadingElements();
    startSpareObserver();
  }

  function check() {
    if (state.released) return;

    if (isReady()) {
      release("all-ready");
    }
  }

  function require(task) {
    task = normalizeTask(task);
    if (!task) return;
    traceFunction("require", "start", {
      task: task
    });
    rlog("RUN", "require", task);

    if (state.released) {
      log("require ignored after release:", task);
      return;
    }

    state.required[task] = true;
    setRuntimeRequired();

    if (!state.done[task]) {
      setTaskAttr(task, "pending");
    }

    log("require", task, getState());
    traceFunction("require", "done", {
      task: task
    });
    check();
  }

  function requireMany(tasks) {
    parseTaskList(tasks).forEach(require);
  }

  function done(task) {
    task = normalizeTask(task);
    if (!task) return;
    traceFunction("done", "start", {
      task: task
    });

    /*
      被動模式：
      如果模組沒有先 require，done 也會自動把此 task 納入判斷。
      所以只有 CSS 傳進來時，就只等 CSS。
    */
    if (!state.required[task]) {
      require(task);
    }

    state.done[task] = true;
    delete state.failed[task];

    setTaskAttr(task, "done");
    runtimeTaskDone(task);
    rlog("OK", "taskDone", task);
    if (task === "css-runtime") {
      markShellReady("css-runtime", "OK");
    }
    log("done", task, getState());
    traceFunction("done", "done", {
      task: task
    });
    check();
  }

  function fail(task, error) {
    task = normalizeTask(task);
    if (!task) return;
    traceFunction("fail", "start", {
      task: task
    });

    /*
      fail 的意思是：
      這個任務失敗，但錯誤畫面/降級狀態已經 render 完成。
      所以它也算完成，不能讓整頁永遠 loading。
    */
    if (!state.required[task]) {
      require(task);
    }

    state.failed[task] = error && error.message ? error.message : String(error || true);
    state.done[task] = true;

    setTaskAttr(task, "failed");
    runtimeTaskFailed(task, error);
    warn("task failed:", task, error);
    if (task === "css-runtime") {
      markShellReady("css-runtime-failed", "WARN");
    }
    rlog("WARN", "taskDone", {
      task: task,
      error: error && error.message ? error.message : String(error || true)
    });
    traceFunction("fail", "error", {
      task: task,
      error: error && error.message ? error.message : String(error || true)
    });
    check();
  }

  function reset(tasks) {
    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    state.required = {};
    state.done = {};
    state.failed = {};
    state.released = false;
    state.shellReady = false;
    state.pageReady = false;
    state.releaseReason = "";
    state.openedAt = Date.now();

    html.removeAttribute("data-skhps-loading-released");
    html.removeAttribute("data-skhps-loading-release-reason");
    html.setAttribute("data-skhps-shell-ready", "false");
    html.setAttribute("data-skhps-page-ready", "false");

    LOADING_CLASSES.forEach(function (className) {
      html.classList.add(className);
    });

    if (hasUsableCssRuntimeCache()) {
      state.shellReady = true;
      html.classList.remove(SHELL_LOADING_CLASS);
      html.setAttribute("data-skhps-shell-ready", "true");
      html.setAttribute("data-skhps-shell-ready-reason", "css-runtime-cache");
    } else {
      html.classList.add(SHELL_LOADING_CLASS);
    }

    html.classList.add(MAIN_LOADING_CLASS);

    requireMany(tasks || []);
    setRuntimeRequired();
    startTimeout();
  }

  function receive(input) {
    /*
      統一接收入口，未來新程式可以只丟狀態進來，不需要知道 gate 內部。
      支援：
      - "css-runtime"                         => require
      - ["css-runtime", "external-app-data"]  => requireMany
      - { task: "css-runtime", status: "done" }
      - { task: "x", status: "fail", error: err }
      - { require: ["a", "b"], done: ["a"], fail: [{ task: "b", error: err }] }
    */
    if (!input) return;

    if (typeof input === "string" || Array.isArray(input)) {
      requireMany(input);
      return;
    }

    if (input.task) {
      if (input.status === "done") {
        done(input.task);
      } else if (input.status === "fail" || input.status === "failed") {
        fail(input.task, input.error);
      } else {
        require(input.task);
      }
      return;
    }

    if (input.require || input.pending || input.tasks) {
      requireMany(input.require || input.pending || input.tasks);
    }

    if (input.done) {
      parseTaskList(input.done).forEach(done);
    }

    if (input.fail || input.failed) {
      var failures = input.fail || input.failed;

      if (Array.isArray(failures)) {
        failures.forEach(function (item) {
          if (typeof item === "string") {
            fail(item, true);
          } else if (item && item.task) {
            fail(item.task, item.error);
          }
        });
      } else if (failures && failures.task) {
        fail(failures.task, failures.error);
      } else if (typeof failures === "string") {
        fail(failures, true);
      }
    }
  }

  function startTimeout() {
    if (state.timer) return;

    state.timer = window.setTimeout(function () {
      if (state.released) return;

      warn("timeout fallback release", getState());
      rlog("WARN", "timeoutRelease", getState(), Date.now() - state.openedAt);
      release("timeout-fallback");
    }, DEFAULT_TIMEOUT_MS);
  }

  function loadInitialTasksFromHtml() {
    var rawTasks =
      html.getAttribute("data-skhps-loading-tasks") ||
      html.getAttribute("data-loading-tasks") ||
      "";

    rlog("INFO", "requiredTasks", rawTasks || "(none)");
    requireMany(rawTasks);
    setRuntimeRequired();
  }

  window.SKHPSLoading = {
    require: require,
    requireMany: requireMany,
    waitFor: requireMany,
    done: done,
    fail: fail,
    receive: receive,
    check: check,
    release: release,
    releaseShell: markShellReady,
    releaseMain: markPageReady,
    reset: reset,
    getState: getState
  };

  setInitialLayerState();

  if (document.body) {
    initSpareLoadingElements();
  } else {
    document.addEventListener("DOMContentLoaded", initSpareLoadingElements);
  }
  loadInitialTasksFromHtml();

  /*
    被動模式不再因為「HTML 沒宣告 task」就立刻 release。
    它會等模組傳入 require/done/fail。
    若真的沒有任何模組回報，timeout fallback 會避免正式環境永遠白畫面。
  */
  if (
    hasLoadingClass() ||
    html.classList.contains(SHELL_LOADING_CLASS) ||
    html.classList.contains(MAIN_LOADING_CLASS) ||
    html.hasAttribute("data-skhps-loading-tasks") ||
    html.hasAttribute("data-loading-tasks")
  ) {
    startTimeout();
  }

  rlog("OK", "moduleReady", "loading-gate.js");
})();
