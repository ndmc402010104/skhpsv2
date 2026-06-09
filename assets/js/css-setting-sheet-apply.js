/*
檔案位置：skhpsv2/assets/js/css-setting-sheet-apply.js
時間戳記：2026-06-09 20:55 UTC+8
用途：舊版 baseStyle 自動套用器已停用；全站 CSS Sheet 套用改由 css-sheet-runtime.js 統一處理，避免 baseStyle 重複注入與樣式打架。
*/

(function () {
  "use strict";

  function applyBaseStyleFromSheet() {
    var message = "SKHPSApplyBaseStyleFromSheet 已停用；請改用 css-sheet-runtime.js。";
    console.info(message);

    if (
      window.SKHPSCssSheetRuntimeLoader &&
      typeof window.SKHPSCssSheetRuntimeLoader.load === "function"
    ) {
      return window.SKHPSCssSheetRuntimeLoader.load();
    }

    return Promise.resolve({
      ok: true,
      disabled: true,
      message: message
    });
  }

  window.SKHPSApplyBaseStyleFromSheet = applyBaseStyleFromSheet;
})();