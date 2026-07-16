/*
檔案位置：skhpsv2/assets/js/tools.js
時間戳：2026-07-17 00:40 UTC+8
用途：工具包頁（tools.html）的頁面腳本。載入 bookmarklet 原始碼、填進唯讀
textarea、組出「拖到書籤列」的 javascript: bookmarklet、接複製按鈕，並回報
loading gate 的 platform-tools task。

水庫理論：本檔只做行為（fetch/DOM 文字/剪貼簿），不碰任何樣式（不設
element.style、不注入 CSS）；視覺一律交給既有 skhps-* class 與瀏覽器預設。
*/

(function () {
  "use strict";

  var TASK_NAME = "platform-tools";
  var SOURCE_URL = "assets/js/tools/platform-timer.bookmarklet.js";

  function $(selector) {
    return document.querySelector(selector);
  }

  function loadingDone() {
    if (window.SKHPSLoading && typeof window.SKHPSLoading.done === "function") {
      window.SKHPSLoading.done(TASK_NAME);
    }
  }

  function loadingFail(error) {
    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail(TASK_NAME, error);
    } else {
      loadingDone();
    }
  }

  function isDevHost() {
    var host = String(location.hostname || "").toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host.indexOf("dev-skhps") >= 0;
  }

  function withVersion(url) {
    var version = isDevHost() ? String(Date.now()) : "prod";
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(version);
  }

  function setStatus(text) {
    var el = $("[data-skhps-platform-timer-status]");
    if (el) el.textContent = text;
  }

  // 把 IIFE 原始碼組成可拖曳的 bookmarklet。javascript: URL 會被瀏覽器
  // 先百分比解碼再執行，所以用 encodeURIComponent 包起來最穩（換行、
  // 大括號、空白都不會壞）。
  function buildBookmarklet(source) {
    return "javascript:" + encodeURIComponent(source);
  }

  function wireCopyButton(source) {
    var btn = $("[data-skhps-platform-timer-copy]");
    var textarea = $("[data-skhps-platform-timer-source]");
    if (!btn) return;

    var defaultLabel = btn.textContent;
    var resetTimer = null;

    function flash(label) {
      btn.textContent = label;
      if (resetTimer) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(function () {
        btn.textContent = defaultLabel;
      }, 1800);
    }

    btn.addEventListener("click", function () {
      // 優先用 Clipboard API（需安全內容：https 或 localhost）；失敗退回
      // 選取 textarea + execCommand，最後退回提示手動複製。
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(source).then(function () {
          flash("已複製！");
        }).catch(function () {
          fallbackCopy();
        });
        return;
      }
      fallbackCopy();

      function fallbackCopy() {
        try {
          if (textarea) {
            textarea.focus();
            textarea.select();
          }
          var ok = document.execCommand && document.execCommand("copy");
          flash(ok ? "已複製！" : "請手動全選複製");
        } catch (error) {
          flash("請手動全選複製");
        }
      }
    });
  }

  function wireBookmarklet(source) {
    var link = $("[data-skhps-platform-timer-bookmarklet]");
    if (!link) return;
    link.setAttribute("href", buildBookmarklet(source));
    // 阻止在本頁點擊時真的執行（這支腳本是要跑在院內系統頁面，不是這裡）。
    link.addEventListener("click", function (event) {
      event.preventDefault();
      setStatus("這顆按鈕請「拖」到瀏覽器書籤列，之後在院內系統頁面點它執行；在本頁點沒有作用。");
    });
  }

  // userscript 安裝連結設成絕對網址（管理器偵測 .user.js 較穩定）。
  // 刻意不加 ?v= cache-bust——query 會干擾部分管理器的 .user.js 偵測，
  // 而且安裝是一次性動作，不需要 cache-bust。
  function wireUserscriptLink() {
    var link = $("[data-skhps-platform-timer-userscript]");
    if (!link) return;
    var origin = "";
    try { origin = window.location.origin || ""; } catch (e) { origin = ""; }
    if (origin) {
      link.setAttribute("href", origin + "/assets/js/tools/platform-timer.user.js");
    }
  }

  function init() {
    var textarea = $("[data-skhps-platform-timer-source]");

    wireUserscriptLink();
    setStatus("載入程式碼中...");

    fetch(withVersion(SOURCE_URL), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("HTTP " + response.status);
        }
        return response.text();
      })
      .then(function (source) {
        source = String(source || "").replace(/\s+$/, "") + "\n";

        if (textarea) {
          textarea.value = source;
        }
        wireCopyButton(source);
        wireBookmarklet(source);

        setStatus("已載入。把上面按鈕拖到書籤列，或按「複製程式碼」貼到院內系統 Console 執行。");
        loadingDone();
      })
      .catch(function (error) {
        setStatus("程式碼載入失敗：" + (error && error.message ? error.message : String(error)) + "（可重新整理再試）");
        // 載入失敗也要放行 loading gate，不然整頁卡白。
        loadingFail(error);
      });
  }

  init();
})();
