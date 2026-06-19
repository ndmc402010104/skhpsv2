/*
檔案位置：skhpsv2/assets/js/loading-gate.js
時間戳記：2026-06-16 UTC+8
用途：全站 loading passive AND gate；支援 CSS ready / shell ready / page ready 三段式 release。

設計：
- gate 不硬寫任務來源。
- 任務可由 HTML 的 data-skhps-loading-tasks 預先宣告，也可由各模組用 SKHPSLoading.require/done/fail 被動傳入。
- css-runtime 完成後，只移除 skhps-css-loading。
- css-runtime + skhps-shell 完成後，才顯示 header/footer。
- 所有 required tasks 完成後，才顯示 main。
- fail 視為「任務已結束但狀態 WARN」，避免正式環境永久卡住。
- timeout fallback 仍保留，避免白畫面。
*/

(function () {
  "use strict";

  var html = document.documentElement;
  var CSS_LOADING_CLASS = "skhps-css-loading";
  var GLOBAL_LOADING_CLASS = "skhps-loading";
  var SHELL_LOADING_CLASS = "skhps-shell-loading";
  var MAIN_LOADING_CLASS = "skhps-main-loading";
  var DEFAULT_TIMEOUT_MS = 8000;

  var state = {
    required: {},
    background: {},
    done: {},
    failed: {},
    released: false,
    cssReady: false,
    shellReady: false,
    pageReady: false,
    openedAt: Date.now(),
    releaseReason: "",
    timer: null
  };


  var progressState = {
    current: 8,
    target: 20,
    timer: null,
    settleTimer: null,
    softCap: 99.2,
    visualBudgetMs: 8000,
    cruiseBuffer: 11.8,
    cruiseMaxBeforeRelease: 99.2,
    startedAt: Date.now(),
    lastTickAt: Date.now(),
    finishRequested: false,
    releasedAfterFill: false
  };

  function setProgressValue(value, reason) {
    var next = Math.max(0, Math.min(100, Number(value) || 0));

    progressState.current = next;
    html.style.setProperty("--skhps-loading-progress", String(Math.round(next * 10) / 10));
    html.setAttribute("data-skhps-loading-progress", String(Math.round(next)));

    try {
      document.dispatchEvent(new CustomEvent("skhps-loading-progress", {
        detail: Object.assign(getState ? getState() : {}, {
          progress: progressState.current,
          progressTarget: progressState.target,
          progressReason: reason || ""
        })
      }));
    } catch (error) {}
  }

  function setProgressTarget(value, reason) {
    var next = Math.max(6, Math.min(100, Number(value) || 6));

    if (next > progressState.target || reason === "finish" || reason === "reset") {
      progressState.target = next;
      html.setAttribute("data-skhps-loading-progress-target", String(Math.round(next)));
    }

    startProgressTicker();
  }

  function getTaskProgressTarget() {
    var tasks = blockingTasks();
    var total = Math.max(1, tasks.length);
    var complete = tasks.filter(function (task) {
      return isTaskComplete(task);
    }).length;

    /*
      v10：
      task target 是「下一段前方目標」。
      例如只剩最後一個 task，target 會在接近終點的位置，
      但畫面讀條仍保留 buffer，不會貼上去。
    */
    if (complete >= total) {
      return progressState.cruiseMaxBeforeRelease || 99.2;
    }

    return Math.min(
      progressState.cruiseMaxBeforeRelease || 99.2,
      8 + ((complete + 1) / total) * ((progressState.cruiseMaxBeforeRelease || 99.2) - 8)
    );
  }

  function updateProgressTarget(reason) {
    if (state.released || progressState.finishRequested) {
      return;
    }

    setProgressTarget(getTaskProgressTarget(), reason || "tasks");
  }

  function getSoftCreepTarget(now) {
    var elapsed = Math.max(0, now - progressState.startedAt);
    var budget = progressState.visualBudgetMs || 8000;

    /*
      v10：
      target 是前方參考點，不是讀條要貼上去的位置。
      8 秒內讓 target 線性前進到 99.2%，
      讀條本身會由 tickProgress 保留安全距離。
    */
    var start = 8;
    var cap = progressState.cruiseMaxBeforeRelease || 99.2;

    return Math.min(
      cap,
      start + (elapsed / budget) * (cap - start)
    );
  }

  function tickProgress() {
    var now = Date.now();

    if (!hasLoadingClass() && !progressState.finishRequested) {
      stopProgressTicker();
      return;
    }

    var dt = Math.max(16, now - progressState.lastTickAt);
    progressState.lastTickAt = now;

    if (!progressState.finishRequested) {
      /*
        v10：
        target 會同時受時間與 task 推進。
        但讀條不直接貼 target，而是用距離決定速度。
      */
      var timeTarget = getSoftCreepTarget(now);
      var taskTarget = getTaskProgressTarget();
      var rawTarget = Math.max(timeTarget, taskTarget);

      if (rawTarget > progressState.target) {
        progressState.target = rawTarget;
        html.setAttribute("data-skhps-loading-progress-target", String(Math.round(progressState.target)));
      }
    }

    if (progressState.finishRequested) {
      var finishDiff = 100 - progressState.current;

      if (finishDiff <= 0.12) {
        setProgressValue(100, "finish");
        releaseAfterProgressFill();
        return;
      }

      /*
        Gate 已通過才允許快速補滿。
      */
      var finishStep = Math.min(16, Math.max(2.2, finishDiff * 0.36));
      setProgressValue(progressState.current + Math.min(finishDiff, finishStep), "finish-chase");
      return;
    }

    var buffer = Number(progressState.cruiseBuffer) || 11.8;
    var target = Math.min(Number(progressState.cruiseMaxBeforeRelease) || 99.2, progressState.target);
    var distance = target - progressState.current;

    if (distance <= buffer) {
      /*
        進入安全距離內就不追撞 target。
        但 target 會隨時間繼續前進，所以不會長期卡死在同一點。
      */
      return;
    }

    /*
      v10 速度公式：
      - 距離 buffer 越遠，速度平滑增加
      - 距離約 11.8% 時最慢
      - 不用 chaseFactor 暴衝
      - 每幀 step 有上限，避免跳躍感
    */
    var extra = Math.max(0, distance - buffer);
    var minSpeed = 5.2;          // percentage points / second
    var distanceGain = 0.62;     // extra distance -> speed
    var maxSpeed = 18.5;         // 不暴衝
    var speed = Math.min(maxSpeed, minSpeed + extra * distanceGain);
    var step = speed * (dt / 1000);

    /*
      不要衝進 buffer 內。
    */
    var maxAllowedStep = Math.max(0, distance - buffer);
    step = Math.min(step, maxAllowedStep);

    if (step <= 0.02) {
      return;
    }

    setProgressValue(progressState.current + step, "elastic-cruise");
  }

  function startProgressTicker() {
    if (progressState.timer) {
      return;
    }

    progressState.lastTickAt = Date.now();

    /*
      v11：不要等 setInterval 第一拍。
      下一個 animation frame 先跑一次，避免開場停一下。
    */
    window.requestAnimationFrame(function () {
      tickProgress();
    });

    progressState.timer = window.setInterval(tickProgress, 16);
  }

  function stopProgressTicker() {
    if (!progressState.timer) {
      return;
    }

    window.clearInterval(progressState.timer);
    progressState.timer = null;
  }

  function requestProgressFinish() {
    progressState.finishRequested = true;
    setProgressTarget(100, "finish");
    startProgressTicker();

    if (progressState.settleTimer) {
      window.clearTimeout(progressState.settleTimer);
    }

    /*
      讀條只是視覺，不能卡住進畫面。
      Gate 已通過後，最多 280ms 補滿，最多 420ms 強制移除 class。
    */
    progressState.settleTimer = window.setTimeout(function () {
      setProgressValue(100, "finish-force");
      releaseAfterProgressFill();
    }, 280);

    window.setTimeout(function () {
      if (html.classList.contains(GLOBAL_LOADING_CLASS) ||
          html.classList.contains(CSS_LOADING_CLASS) ||
          html.classList.contains(SHELL_LOADING_CLASS) ||
          html.classList.contains(MAIN_LOADING_CLASS)) {
        setProgressValue(100, "force-remove-classes");
        removeLoadingClassesNow();
        stopProgressTicker();
      }
    }, 420);
  }

  function releaseAfterProgressFill() {
    if (progressState.releasedAfterFill) {
      return;
    }

    progressState.releasedAfterFill = true;

    if (progressState.settleTimer) {
      window.clearTimeout(progressState.settleTimer);
      progressState.settleTimer = null;
    }

    /*
      100% 後只留一個很短的視覺尾巴，然後直接移除 loading class。
      這裡絕對不能再呼叫 requestProgressFinish，避免遞迴卡住。
    */
    window.setTimeout(function () {
      setProgressValue(100, "classes-remove");
      removeLoadingClassesNow();
      stopProgressTicker();
    }, 70);
  }

  function resetProgress() {
    /*
      v11：first-frame warm start。
      不從 0 或極短一截開始，避免第一幀看起來卡住。
      startedAt 往前補 180ms，讓第一個視覺 tick 有動感。
    */
    progressState.current = 8;
    progressState.target = 20;
    progressState.startedAt = Date.now() - 180;
    progressState.lastTickAt = Date.now();
    progressState.finishRequested = false;
    progressState.releasedAfterFill = false;

    if (progressState.settleTimer) {
      window.clearTimeout(progressState.settleTimer);
      progressState.settleTimer = null;
    }

    setProgressValue(8, "reset-warm");
    setProgressTarget(20, "reset-warm");
    startProgressTicker();
  }

  function removeLoadingClassesNow() {
    html.setAttribute("data-skhps-loading-progress", "100");

    html.classList.remove(GLOBAL_LOADING_CLASS);
    html.classList.remove(CSS_LOADING_CLASS);
    html.classList.remove(SHELL_LOADING_CLASS);
    html.classList.remove(MAIN_LOADING_CLASS);

    if (document.body) {
      document.body.classList.remove(GLOBAL_LOADING_CLASS);
      document.body.classList.remove(CSS_LOADING_CLASS);
      document.body.classList.remove(SHELL_LOADING_CLASS);
      document.body.classList.remove(MAIN_LOADING_CLASS);
    }

    html.setAttribute("data-skhps-loading-classes-removed", "true");
  }



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

  function warn() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[SKHPSLoading]");
    console.warn.apply(console, args);
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

  function traceFunction(functionName, status, data) {
    try {
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
    } catch (error) {}
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

  function requiredTasks() {
    return keys(state.required);
  }

  function backgroundTasks() {
    return keys(state.background);
  }

  function blockingTasks() {
    return requiredTasks().filter(function (task) {
      return !state.background[task];
    });
  }

  function failedTasks() {
    return keys(state.failed);
  }

  function doneTasks() {
    return keys(state.done);
  }

  function isTaskRequired(task) {
    task = normalizeTask(task);
    return Boolean(task && state.required[task]);
  }

  function isTaskDone(task) {
    task = normalizeTask(task);
    return Boolean(task && state.done[task] === true);
  }

  function isTaskFailed(task) {
    task = normalizeTask(task);
    return Boolean(task && Object.prototype.hasOwnProperty.call(state.failed, task));
  }

  function isTaskComplete(task) {
    return isTaskDone(task) || isTaskFailed(task);
  }

  function hasAnyFailure() {
    return blockingTasks().some(function (task) {
      return isTaskFailed(task);
    });
  }

  function hasLoadingClass() {
    return html.classList.contains(CSS_LOADING_CLASS) ||
      html.classList.contains(GLOBAL_LOADING_CLASS) ||
      html.classList.contains(SHELL_LOADING_CLASS) ||
      html.classList.contains(MAIN_LOADING_CLASS) ||
      (document.body && (
        document.body.classList.contains(CSS_LOADING_CLASS) ||
        document.body.classList.contains(GLOBAL_LOADING_CLASS) ||
        document.body.classList.contains(SHELL_LOADING_CLASS) ||
        document.body.classList.contains(MAIN_LOADING_CLASS)
      ));
  }

  function setTaskAttr(task, status) {
    task = normalizeTask(task);
    if (!task) return;

    html.setAttribute("data-skhps-task-" + task, status);
  }

  function setRuntimeRequired() {
    try {
      if (runtime() && typeof runtime().setLoadingRequired === "function") {
        runtime().setLoadingRequired(requiredTasks());
      }

      if (runtime() && typeof runtime().setLoadingGate === "function") {
        runtime().setLoadingGate({
          required: requiredTasks(),
          background: backgroundTasks(),
          blocking: blockingTasks(),
          done: doneTasks(),
          failed: failedTasks(),
          cssReady: state.cssReady,
          shellReady: state.shellReady,
          pageReady: state.pageReady,
          released: state.released,
          releaseReason: state.releaseReason || ""
        });
      }
    } catch (error) {}
  }

  function runtimeTaskDone(task) {
    try {
      if (runtime() && typeof runtime().taskDone === "function") {
        runtime().taskDone(task);
      }
    } catch (error) {}
  }

  function runtimeTaskFailed(task, error) {
    try {
      if (runtime() && typeof runtime().taskFailed === "function") {
        runtime().taskFailed(task, error);
      }
    } catch (runtimeError) {}
  }

  function setRuntimeGatePatch(data) {
    try {
      if (runtime() && typeof runtime().setLoadingGate === "function") {
        runtime().setLoadingGate(data || {});
      }
    } catch (error) {}
  }

  function getFailureReason(error) {
    if (!error) return "failed";
    if (error === true) return "failed";
    if (error && error.message) return error.message;
    return String(error);
  }

  function getState() {
    return {
      required: requiredTasks(),
      background: backgroundTasks(),
      blocking: blockingTasks(),
      done: doneTasks(),
      failed: failedTasks().map(function (task) {
        return {
          task: task,
          error: state.failed[task]
        };
      }),
      released: state.released,
      cssReady: state.cssReady,
      shellReady: state.shellReady,
      pageReady: state.pageReady,
      releaseReason: state.releaseReason,
      openedAt: state.openedAt,
      durationMs: Date.now() - state.openedAt
    };
  }

  function markCssReady(reason, status) {
    if (state.cssReady) {
      return;
    }

    state.cssReady = true;

    html.classList.remove(CSS_LOADING_CLASS);

    if (document.body) {
      document.body.classList.remove(CSS_LOADING_CLASS);
    }

    if (isTaskDone("css-runtime")) {
      html.setAttribute("data-skhps-css-ready", "true");
      html.setAttribute("data-skhps-css-ready-reason", reason || "css-runtime");
    } else if (isTaskFailed("css-runtime")) {
      html.setAttribute("data-skhps-css-ready", "false");
      html.setAttribute("data-skhps-css-ready-reason", reason || "css-runtime-failed");
    } else {
      html.setAttribute("data-skhps-css-ready", "true");
      html.setAttribute("data-skhps-css-ready-reason", reason || "css-ready");
    }

    setRuntimeGatePatch({
      cssReady: true,
      cssReadyReason: reason || "css-runtime"
    });

    rlog(status || "OK", "releaseCssLoading", reason || "css-runtime", Date.now() - state.openedAt);
  }

  function markShellReady(reason, status) {
    if (state.shellReady) {
      return;
    }

    state.shellReady = true;

    html.classList.remove(SHELL_LOADING_CLASS);

    if (document.body) {
      document.body.classList.remove(SHELL_LOADING_CLASS);
    }

    html.setAttribute("data-skhps-shell-ready", "true");
    html.setAttribute("data-skhps-shell-ready-reason", reason || "shell-ready");

    setRuntimeGatePatch({
      shellReady: true,
      shellReadyReason: reason || "shell-ready"
    });

    rlog(status || "OK", "releaseShell", reason || "shell-ready", Date.now() - state.openedAt);

    try {
      document.dispatchEvent(new CustomEvent("skhps-loading-shell-ready", {
        detail: getState()
      }));
    } catch (error) {}
  }

  function markPageReady(reason, status) {
    if (state.pageReady) {
      return;
    }

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

    rlog(status || "OK", "releaseMain", reason || "all-ready", Date.now() - state.openedAt);

    try {
      document.dispatchEvent(new CustomEvent("skhps-loading-page-ready", {
        detail: getState()
      }));
    } catch (error) {}

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

  function cssTaskIsCompleteIfRequired() {
    if (!isTaskRequired("css-runtime")) {
      return true;
    }

    return isTaskComplete("css-runtime");
  }

  function shellTaskIsCompleteIfRequired() {
    if (!isTaskRequired("skhps-shell")) {
      return true;
    }

    return isTaskComplete("skhps-shell");
  }

  function allRequiredTasksComplete() {
    var tasks = blockingTasks();

    if (!tasks.length) {
      return false;
    }

    return tasks.every(function (task) {
      return isTaskComplete(task);
    });
  }

  function checkCssReady() {
    if (state.cssReady) {
      return;
    }

    if (!isTaskRequired("css-runtime")) {
      return;
    }

    if (!isTaskComplete("css-runtime")) {
      return;
    }

    if (isTaskFailed("css-runtime")) {
      markCssReady("css-runtime-failed", "WARN");
      return;
    }

    markCssReady("css-runtime", "OK");
  }

  function checkShellReady() {
    if (state.shellReady) {
      return;
    }

    if (!cssTaskIsCompleteIfRequired()) {
      return;
    }

    if (!shellTaskIsCompleteIfRequired()) {
      return;
    }

    /*
      新架構中只要有 skhps-shell-loading，就會自動 require skhps-shell。
      所以 shell 不會只因 css-runtime 完成就過早顯示。
    */
    if (isTaskFailed("css-runtime") || isTaskFailed("skhps-shell")) {
      markShellReady("shell-ready-with-warning", "WARN");
      return;
    }

    markShellReady("shell-ready", "OK");
  }

  function checkPageReady() {
    if (state.pageReady) {
      return;
    }

    if (!allRequiredTasksComplete()) {
      return;
    }

    if (hasAnyFailure()) {
      release("ready-with-failed-tasks", "WARN");
      return;
    }

    release("all-ready", "OK");
  }

  function check() {
    traceFunction("check", "start", getState());

    checkCssReady();
    checkShellReady();
    checkPageReady();

    traceFunction("check", "done", getState());
  }

  function release(reason, status) {
    if (state.released) {
      return;
    }

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

    if (!state.cssReady) {
      markCssReady(state.releaseReason, status || "OK");
    }

    if (!state.shellReady) {
      markShellReady(state.releaseReason, status || "OK");
    }

    if (!state.pageReady) {
      markPageReady(state.releaseReason, status || "OK");
    }

    /*
      先讓 progress 補滿，再移除 loading class。
      保底 timer 會避免動畫卡住畫面。
    */
    requestProgressFinish();

    html.setAttribute("data-skhps-loading-released", "true");
    html.setAttribute("data-skhps-loading-release-reason", state.releaseReason);

    try {
      if (runtime() && typeof runtime().done === "function") {
        runtime().done("loadingGate", {
          releaseReason: state.releaseReason
        });
      }

      if (runtime() && typeof runtime().setLoadingGate === "function") {
        runtime().setLoadingGate({
          required: requiredTasks(),
          background: backgroundTasks(),
          blocking: blockingTasks(),
          done: doneTasks(),
          failed: failedTasks(),
          released: true,
          releaseReason: state.releaseReason,
          durationMs: durationMs,
          cssReady: state.cssReady,
          shellReady: state.shellReady,
          pageReady: state.pageReady
        });
      }
    } catch (error) {}

    log("released", getState());
    rlog(status || "OK", "releasePage", state.releaseReason, durationMs);

    try {
      document.dispatchEvent(new CustomEvent("skhps-loading-released", {
        detail: getState()
      }));
    } catch (error) {}

    traceFunction("release", "done", {
      reason: state.releaseReason
    });
  }


  function isBackgroundTask(task) {
    task = normalizeTask(task);
    return Boolean(task && state.background[task]);
  }

  function requireBackgroundTask(task) {
    task = normalizeTask(task);

    if (options && (options.blocking === false || options.affectsGate === false || options.background === true || options.nonBlocking === true)) {
      requireBackgroundTask(task);
      return;
    }

    if (!task) {
      return;
    }

    /*
      background task 只記錄，不擋 loading release。
      若先前被 required，這裡會把它標記成 background，從 blocking 分母移除。
    */
    state.required[task] = true;
    state.background[task] = true;
    setTaskAttr(task, "background");
    setRuntimeRequired();
    updateProgressTarget("background");
    rlog("RUN", "requireBackground", task);
    log("requireBackground", task, getState());
  }

  function requireBackgroundMany(tasks) {
    parseTaskList(tasks).forEach(requireBackgroundTask);
    check();
  }


  function requireTask(task, options) {
    task = normalizeTask(task);

    if (!task) {
      return;
    }

    if (state.released || state.pageReady) {
      /*
        all-ready 後不再重新鎖畫面。
        避免後載模組晚 require 造成畫面 True -> False。
      */
      rlog("WARN", "requireAfterReleaseIgnored", task);
      return;
    }

    state.required[task] = true;
    if (options && options.blocking === true) {
      delete state.background[task];
    }
    setTaskAttr(task, state.background[task] ? "background" : "required");
    updateProgressTarget("require");
    setRuntimeRequired();
    rlog("RUN", "require", task);
    log("require", task, getState());
  }

  function requireMany(tasks) {
    parseTaskList(tasks).forEach(requireTask);
    check();
  }

  function done(task) {
    task = normalizeTask(task);

    if (!task) {
      return;
    }

    if (!isTaskRequired(task)) {
      requireTask(task);
    }

    state.done[task] = true;

    if (state.failed[task]) {
      delete state.failed[task];
    }

    setTaskAttr(task, "done");
    runtimeTaskDone(task);
    setRuntimeRequired();

    rlog("OK", "done", task);
    log("done", task, getState());
    updateProgressTarget("done");

    check();
  }

  function fail(task, error) {
    task = normalizeTask(task);

    if (!task) {
      return;
    }

    if (!isTaskRequired(task)) {
      requireTask(task);
    }

    if (state.done[task]) {
      /*
        任務已成功時，後續 fail 不再把成功翻成失敗。
        避免 true -> false。
      */
      rlog("WARN", "failIgnoredAlreadyDone", task);
      check();
      return;
    }

    state.failed[task] = getFailureReason(error);

    setTaskAttr(task, "failed");
    runtimeTaskFailed(task, error);
    setRuntimeRequired();

    rlog("WARN", "fail", {
      task: task,
      error: state.failed[task]
    });

    log("fail", task, error, getState());
    updateProgressTarget("fail");

    check();
  }

  function markPendingTasksFailed(reason) {
    blockingTasks().forEach(function (task) {
      if (isTaskComplete(task)) {
        return;
      }

      state.failed[task] = reason || "timeout-fallback";
      setTaskAttr(task, "failed");
      runtimeTaskFailed(task, reason || "timeout-fallback");
    });

    setRuntimeRequired();
  }

  function releaseTimeoutFallback() {
    if (state.released) {
      return;
    }

    warn("timeout fallback release", getState());
    rlog("WARN", "timeoutRelease", getState(), Date.now() - state.openedAt);

    markPendingTasksFailed("timeout-fallback");
    release("timeout-fallback", "WARN");
  }

  function startTimeout() {
    if (state.timer) {
      return;
    }

    state.timer = window.setTimeout(releaseTimeoutFallback, DEFAULT_TIMEOUT_MS);
  }

  function receive(input) {
    if (!input) {
      return;
    }

    if (typeof input === "string" || Array.isArray(input)) {
      requireMany(input);
      return;
    }

    if (input.task) {
      if (input.blocking === false || input.affectsGate === false || input.background === true || input.nonBlocking === true) {
        requireBackgroundTask(input.task);
      }

      if (input.status === "done") {
        done(input.task);
      } else if (input.status === "fail" || input.status === "failed") {
        fail(input.task, input.error);
      } else {
        requireTask(input.task, input);
        check();
      }
      return;
    }

    if (input.requireBackground || input.backgroundTasks || input.nonBlocking || input.nonBlockingTasks) {
      requireBackgroundMany(input.requireBackground || input.backgroundTasks || input.nonBlocking || input.nonBlockingTasks);
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

    check();
  }

  function reset() {
    state.required = {};
    state.background = {};
    state.done = {};
    state.failed = {};
    state.released = false;
    state.cssReady = false;
    state.shellReady = false;
    state.pageReady = false;
    state.openedAt = Date.now();
    state.releaseReason = "";
    resetProgress();

    if (state.timer) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }

    html.classList.add(GLOBAL_LOADING_CLASS);
    html.classList.add(CSS_LOADING_CLASS);
    html.classList.add(SHELL_LOADING_CLASS);
    html.classList.add(MAIN_LOADING_CLASS);

    html.setAttribute("data-skhps-css-ready", "false");
    html.setAttribute("data-skhps-shell-ready", "false");
    html.setAttribute("data-skhps-page-ready", "false");
    html.removeAttribute("data-skhps-loading-released");
    html.removeAttribute("data-skhps-loading-release-reason");

    loadInitialTasksFromHtml();
    startTimeout();
  }

  function isSpareElement(el) {
    if (!el || !el.matches) {
      return false;
    }

    return el.matches(
      "header, footer, #skhps-header, #skhps-footer, #header, #footer, .skhps-header, .skhps-footer, [data-skhps-header], [data-skhps-footer], [data-skhps-loading-spare], #skhps-runtime-panel, script, style, link"
    );
  }

  function markLoadingElements() {
    if (!document.body) {
      return;
    }

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
    if (!document.body || window.__SKHPSLoadingSpareObserver) {
      return;
    }

    window.__SKHPSLoadingSpareObserver = new MutationObserver(function () {
      markLoadingElements();
    });

    window.__SKHPSLoadingSpareObserver.observe(document.body, {
      childList: true,
      subtree: false
    });
  }

  function initSpareLoadingElements() {
    markLoadingElements();
    startSpareObserver();
  }

  function setInitialLayerState() {
    var shouldUseLayeredGate =
      hasLoadingClass() ||
      html.hasAttribute("data-skhps-loading-tasks") ||
      html.hasAttribute("data-loading-tasks") ||
      html.classList.contains(SHELL_LOADING_CLASS) ||
      html.classList.contains(MAIN_LOADING_CLASS);

    if (!shouldUseLayeredGate) {
      return;
    }

    if (html.getAttribute("data-skhps-css-ready") !== "true") {
      html.setAttribute("data-skhps-css-ready", "false");
    } else {
      state.cssReady = true;
      html.classList.remove(CSS_LOADING_CLASS);
    }

    if (html.getAttribute("data-skhps-shell-ready") !== "true") {
      html.classList.add(SHELL_LOADING_CLASS);
      html.setAttribute("data-skhps-shell-ready", "false");
    } else {
      state.shellReady = true;
      html.classList.remove(SHELL_LOADING_CLASS);
    }

    if (html.getAttribute("data-skhps-page-ready") !== "true") {
      html.classList.add(MAIN_LOADING_CLASS);
      html.setAttribute("data-skhps-page-ready", "false");
    } else {
      state.pageReady = true;
      html.classList.remove(MAIN_LOADING_CLASS);
    }
  }

  function loadInitialTasksFromHtml() {
    var rawTasks =
      html.getAttribute("data-skhps-loading-tasks") ||
      html.getAttribute("data-loading-tasks") ||
      "";

    rlog("INFO", "requiredTasksFromHtml", rawTasks || "(none)");

    requireMany(rawTasks);

    var rawBackgroundTasks =
      html.getAttribute("data-skhps-background-tasks") ||
      html.getAttribute("data-skhps-nonblocking-tasks") ||
      html.getAttribute("data-loading-background-tasks") ||
      html.getAttribute("data-loading-nonblocking-tasks") ||
      "";

    if (rawBackgroundTasks) {
      rlog("INFO", "backgroundTasksFromHtml", rawBackgroundTasks);
      requireBackgroundMany(rawBackgroundTasks);
    }

    /*
      新架構：
      HTML 不手寫 skhps-shell task，
      但只要頁面一開始有 skhps-shell-loading，就代表 shell 必須完成才能顯示 header/footer。
      entry-core.js 之後也會再 require("skhps-shell")，這裡先 require 是為了避免 css-runtime 太快完成時 shell 過早釋放。
    */
    if (html.classList.contains(SHELL_LOADING_CLASS)) {
      requireTask("skhps-shell");
    }

    /*
      有 skhps-css-loading 代表這頁需要 CSS runtime。
      即使 HTML 忘了寫 css-runtime，也幫它補上，避免 loading 動畫無人釋放。
    */
    if (html.classList.contains(CSS_LOADING_CLASS)) {
      requireTask("css-runtime");
    }

    setRuntimeRequired();
    check();
  }

  function shouldStartTimeout() {
    return hasLoadingClass() ||
      html.hasAttribute("data-skhps-loading-tasks") ||
      html.hasAttribute("data-loading-tasks") ||
      requiredTasks().length > 0;
  }

  rlog("RUN", "moduleStart", "loading-gate.js");
  rlog("RUN", "loadingGateStart", {
    loadingClasses: [
      CSS_LOADING_CLASS,
      GLOBAL_LOADING_CLASS,
      SHELL_LOADING_CLASS,
      MAIN_LOADING_CLASS
    ],
    timeoutMs: DEFAULT_TIMEOUT_MS
  });

  try {
    if (window.history && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  } catch (error) {}

  window.SKHPSLoading = {
    require: requireTask,
    requireMany: requireMany,
    waitFor: requireMany,
    background: requireBackgroundTask,
    requireBackground: requireBackgroundTask,
    requireBackgroundMany: requireBackgroundMany,
    nonBlocking: requireBackgroundTask,
    requireNonBlocking: requireBackgroundTask,
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

  resetProgress();
  loadInitialTasksFromHtml();
  updateProgressTarget("initial-tasks");

  /*
    被動模式：
    不因為「現在還沒有 done」就立刻 release。
    由 css-sheet-runtime / entry-core / page-specific scripts 被動回報。
  */
  if (shouldStartTimeout()) {
    startTimeout();
  }

  rlog("OK", "moduleReady", "loading-gate.js");
})();

/* SKHPS Loading v5 safety marker */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v5-real-release");
} catch (error) {}


/* SKHPS Loading v6 marker: near-complete creep, blocking/background */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v6-near-complete-creep");
} catch (error) {}


/* SKHPS Loading v7 marker: never-stop creep */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v7-never-stop-creep");
} catch (error) {}


/* SKHPS Loading v8 marker: linear floor progress */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v8-linear-floor");
} catch (error) {}


/* SKHPS Loading v9 marker: cruise with buffer */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v9-cruise-buffer");
} catch (error) {}


/* SKHPS Loading v10 marker: elastic cruise */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v10-elastic-cruise");
} catch (error) {}


/* SKHPS Loading v11 marker: first-frame warm start */
try {
  document.documentElement.setAttribute("data-skhps-loading-gate-version", "v11-first-frame-warm");
} catch (error) {}
