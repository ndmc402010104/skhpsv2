/*
檔案位置：skhpsv2/assets/js/footer.js
時間戳記：2026-06-09 20:55 UTC+8
用途：Footer 狀態列；只負責渲染 footer、version、Apps Script 與 Sheet 狀態。不再讀取 footerStyle CSV、不再注入 footer CSS，避免與 css-sheet-runtime.js 打架。
*/

(function () {
  "use strict";

  function findFooter() {
    return document.querySelector("[data-skhps-footer]");
  }

  function createFooterItem(labelText, valueText, extraClass) {
    var item = document.createElement("span");
    item.className = "skhps-footer-item" + (extraClass ? " " + extraClass : "");

    var label = document.createElement("span");
    label.className = "skhps-footer-label";
    label.textContent = labelText;

    var value = document.createElement("span");
    value.className = "skhps-footer-version";
    value.textContent = valueText || "loading";

    item.appendChild(label);
    item.appendChild(value);

    return item;
  }

  function renderFooter(state) {
    var footer = findFooter();

    if (!footer) {
      return;
    }

    footer.classList.add("skhps-footer");
    footer.innerHTML = "";

    var track = document.createElement("span");
    track.className = "skhps-footer-track";

    track.appendChild(
      createFooterItem("Version：", state.versionText || "loading", "is-active")
    );

    track.appendChild(
      createFooterItem("Apps Script：", state.apiText || "testing", state.apiOk ? "is-ok" : "is-warn")
    );

    track.appendChild(
      createFooterItem("Sheet：", state.sheetText || "testing", state.sheetOk ? "is-ok" : "is-warn")
    );

    footer.appendChild(track);
  }

  function setState(state, patch) {
    Object.keys(patch || {}).forEach(function (key) {
      state[key] = patch[key];
    });

    renderFooter(state);
  }

  function loadVersion(state) {
    if (!window.SKHPSConfig || typeof window.SKHPSConfig.loadVersion !== "function") {
      setState(state, {
        versionText: "config failed"
      });
      return Promise.resolve();
    }

    return window.SKHPSConfig.loadVersion()
      .then(function (version) {
        setState(state, {
          versionText: version && version.version ? version.version : "unknown"
        });
      })
      .catch(function () {
        setState(state, {
          versionText: "version failed"
        });
      });
  }

  function checkApi(state) {
    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      setState(state, {
        apiText: "backend missing",
        apiOk: false
      });
      return Promise.resolve();
    }

    return window.SKHPSBackend.call("health")
      .then(function (response) {
        if (response && response.ok === true) {
          setState(state, {
            apiText: "ok",
            apiOk: true
          });
          return;
        }

        setState(state, {
          apiText: "failed",
          apiOk: false
        });
      })
      .catch(function () {
        setState(state, {
          apiText: "failed",
          apiOk: false
        });
      });
  }

  function checkSheet(state) {
    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      setState(state, {
        sheetText: "backend missing",
        sheetOk: false
      });
      return Promise.resolve();
    }

    return window.SKHPSBackend.call("sheetStatus")
      .then(function (response) {
        if (response && response.ok === true) {
          setState(state, {
            sheetText: "ok",
            sheetOk: true
          });
          return;
        }

        setState(state, {
          sheetText: "failed",
          sheetOk: false
        });
      })
      .catch(function () {
        setState(state, {
          sheetText: "failed",
          sheetOk: false
        });
      });
  }

  function reflectCssRuntime(state) {
    function updateFromRuntime(detail) {
      var runtime = detail || window.SKHPSCssSheetRuntime;

      if (!runtime) return;

      setState(state, {
        sheetText: "css " + (runtime.sheetKeys ? runtime.sheetKeys.length : "?") + " sheets",
        sheetOk: true
      });
    }

    if (window.SKHPSCssSheetRuntime) {
      updateFromRuntime(window.SKHPSCssSheetRuntime);
    }

    document.addEventListener("skhps-css-sheet-runtime-ready", function (event) {
      updateFromRuntime(event.detail);
    });
  }

  function boot() {
    var state = {
      versionText: "loading",
      apiText: "testing",
      apiOk: false,
      sheetText: "testing",
      sheetOk: false
    };

    renderFooter(state);
    reflectCssRuntime(state);

    loadVersion(state);
    checkApi(state);
    checkSheet(state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.SKHPSFooter = {
    render: renderFooter
  };
})();