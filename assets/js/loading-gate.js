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
  var DEFAULT_TIMEOUT_MS = 12000;

  var state = {
    required: {},
    done: {},
    failed: {},
    released: false,
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
      releaseReason: state.releaseReason,
      openedAt: state.openedAt
    };
  }

  function release(reason) {
    if (state.released) return;
    traceFunction("release", "start", {
      reason: reason || "ready"
    });

    state.released = true;
    state.releaseReason = reason || "ready";

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

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
    state.releaseReason = "";
    state.openedAt = Date.now();

    html.removeAttribute("data-skhps-loading-released");
    html.removeAttribute("data-skhps-loading-release-reason");

    LOADING_CLASSES.forEach(function (className) {
      html.classList.add(className);
    });

    requireMany(tasks || []);
    setRuntimeRequired();
    startTimeout();
  }

  function receive(input) {
    /*
      統一接收入口，未來新程式可以只丟狀態進來，不需要知道 gate 內部。
      支援：
      - "css-runtime"                         => require
      - ["css-runtime", "quick-login-staff"]  => requireMany
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
      release("timeout-fallback");
    }, DEFAULT_TIMEOUT_MS);
  }

  function loadInitialTasksFromHtml() {
    var rawTasks =
      html.getAttribute("data-skhps-loading-tasks") ||
      html.getAttribute("data-loading-tasks") ||
      "";

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
    reset: reset,
    getState: getState
  };

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
  if (hasLoadingClass()) {
    startTimeout();
  }
})();
