/*
檔案位置：skhpsv2/assets/js/css-setting-sheet-save.js
時間戳記：2026-06-09 21:45 UTC+8
用途：CSS Setting 共用 Sheet save；依 data-css-setting-component / data-css-setting-tab-key 寫回對應 CSS Sheet。儲存成功後清除 css-sheet-runtime.js 快取，確保其他頁下次會讀取最新 CSS。
*/

(function () {
  "use strict";

  function clearCssRuntimeCache() {
    if (
      window.SKHPSCssSheetRuntimeLoader &&
      typeof window.SKHPSCssSheetRuntimeLoader.clearCache === "function"
    ) {
      window.SKHPSCssSheetRuntimeLoader.clearCache();
      return;
    }

    try {
      localStorage.removeItem("skhpsv2.cssSheetRuntimeCache.v1");
    } catch (error) {
      console.warn("CSS runtime cache clear failed:", error);
    }
  }

  function setStatus(scope, message) {
    var status = scope.querySelector("[data-css-setting-status]");
    if (status) status.textContent = message;
  }

  function setBusy(button, busy) {
    button.disabled = !!busy;
    button.textContent = busy ? "儲存中..." : "儲存";
  }

  function getDescription(input) {
    var row = input.closest("tr");
    var label = row ? row.querySelector("strong") : input.previousElementSibling;

    if (label && label.tagName && label.tagName.toLowerCase() === "strong") {
      return label.getAttribute("title") || label.textContent || "";
    }

    return "";
  }

  function collectRows(scope) {
    return Array.prototype.slice.call(scope.querySelectorAll("[data-class-name][data-property]"))
      .map(function (input) {
        return {
          component: scope.getAttribute("data-css-setting-component") || "",
          className: input.getAttribute("data-class-name") || "",
          property: input.getAttribute("data-property") || "",
          value: input.value || "",
          description: getDescription(input)
        };
      })
      .filter(function (row) {
        return row.component && row.className && row.property;
      });
  }

  function dispatch(scope, name, detail) {
    scope.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      detail: detail || {}
    }));
  }

  function saveToSheet(scope, button) {
    var tabKey = scope.getAttribute("data-css-setting-tab-key") || "";

    if (!tabKey) {
      setStatus(scope, "儲存失敗：缺少 data-css-setting-tab-key。");
      return;
    }

    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      setStatus(scope, "儲存失敗：找不到 SKHPSBackend.call，請確認 backend-client.js 已載入。");
      return;
    }

    var rows = collectRows(scope);

    if (!rows.length) {
      setStatus(scope, "沒有可儲存的欄位。");
      return;
    }

    setBusy(button, true);
    setStatus(scope, "寫回 Google Sheet 中...");

    window.SKHPSBackend.call("saveCssSheetRows", {
      tabKey: tabKey,
      rows: rows
    })
      .then(function (response) {
        if (!response || response.ok !== true) {
          throw new Error(response && response.message ? response.message : JSON.stringify(response));
        }

        clearCssRuntimeCache();

        setStatus(scope, "已寫回 Sheet：" + response.appendedRows + " 筆，updatedAt=" + response.updatedAt + "；CSS 快取已清除。");

        dispatch(scope, "skhps-css-setting-save-success", {
          response: response,
          rows: rows
        });
      })
      .catch(function (error) {
        var message = error && error.message ? error.message : String(error);
        setStatus(scope, "儲存失敗：" + message);

        dispatch(scope, "skhps-css-setting-save-error", {
          error: message
        });
      })
      .finally(function () {
        setBusy(button, false);
      });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest('[data-css-setting-action="save"]');
    if (!button) return;

    var scope = button.closest("[data-css-setting-editor]");
    if (!scope) return;

    if (scope.getAttribute("data-css-setting-sheet-save") !== "on") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    saveToSheet(scope, button);
  }, true);
})();