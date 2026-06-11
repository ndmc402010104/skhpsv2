/*
檔案位置：skhpsv2/assets/js/header.js
時間戳記：2026-06-11 UTC+8
用途：
共用 Header。

目前定案：
- Header 掛載到 <header id="header">。
- Header 左側顯示 SKHPS / Plastic Surgery。
- Header 左側按下去回目前區域首頁。
- Header 右側目前只顯示「登入」。
- 登入先不做 auth，直接連到 admin.html。
- 外部 App 使用 sharedBaseUrl / SKHPS_ENTRY_BASE_URL 回到 skhpsv2/admin.html。
- Header 不顯示外部專案入口；外部專案入口留在首頁「系統入口」區塊。
- Header 不顯示目前頁面標題。
- Header 不顯示 runtime / backend / CSS / version 狀態。
- Header 不進 loading gate，不呼叫 SKHPSLoading.done()。
*/

(function () {
  "use strict";

  var HEADER_ID = "header";
  var BRAND_MARK = "SKHPS";
  var BRAND_MAIN = "SKHPS";
  var BRAND_SUB = "Plastic Surgery";
  var LOGIN_HREF = "admin.html";

  function getHeaderRoot() {
    return document.getElementById(HEADER_ID);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || "").replace(/\/+$/, "") + "/";
  }

  function joinUrl(baseUrl, path) {
    return normalizeBaseUrl(baseUrl) + String(path || "").replace(/^\/+/, "");
  }

  function getSharedBaseUrl() {
    if (window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.sharedBaseUrl) {
      return window.SKHPS_APP_ENV.sharedBaseUrl;
    }

    if (window.SKHPS_ENTRY_BASE_URL) {
      return window.SKHPS_ENTRY_BASE_URL;
    }

    if (
      window.SKHPSConfig &&
      typeof window.SKHPSConfig.getSiteBaseUrl === "function"
    ) {
      return window.SKHPSConfig.getSiteBaseUrl(window.SKHPS_CONFIG);
    }

    return "";
  }

  function getHeaderMode() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-mode")
    );

    if (fromHtml) {
      return fromHtml;
    }

    var pageId = normalizeText(
      document.documentElement.getAttribute("data-skhps-page-id")
    );

    if (pageId === "admin" || pageId === "css-setting") {
      return "admin";
    }

    return "front";
  }

  function getHomeHref() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-home-href")
    );

    if (fromHtml) {
      return fromHtml;
    }

    if (getHeaderMode() === "admin") {
      return "admin.html";
    }

    if (window.SKHPS_ENTRY_BASE_URL) {
      return window.SKHPS_ENTRY_BASE_URL;
    }

    return "index.html";
  }

  function getLoginHref() {
    var fromHtml = normalizeText(
      document.documentElement.getAttribute("data-skhps-header-login-href")
    );

    if (fromHtml) {
      return fromHtml;
    }

    var sharedBaseUrl = getSharedBaseUrl();

    if (sharedBaseUrl) {
      return joinUrl(sharedBaseUrl, LOGIN_HREF);
    }

    return LOGIN_HREF;
  }

  function renderHeader() {
    var root = getHeaderRoot();

    if (!root) {
      return;
    }

    var mode = getHeaderMode();
    var homeHref = getHomeHref();
    var loginHref = getLoginHref();

    root.classList.add("skhps-header");
    root.setAttribute("data-skhps-header-ready", "true");
    root.setAttribute("data-skhps-header-mode", mode);

    root.innerHTML = [
      '<div class="skhps-header-inner">',
        '<a class="skhps-header-brand" href="' + escapeHtml(homeHref) + '" aria-label="回到首頁">',
          '<span class="skhps-header-brand-mark">',
            escapeHtml(BRAND_MARK),
          '</span>',
          '<span class="skhps-header-brand-copy">',
            '<span class="skhps-header-brand-main">',
              escapeHtml(BRAND_MAIN),
            '</span>',
            '<span class="skhps-header-brand-sub">',
              escapeHtml(BRAND_SUB),
            '</span>',
          '</span>',
        '</a>',

        '<nav class="skhps-header-actions" aria-label="主要導覽">',
          '<a',
            ' class="skhps-btn skhps-btn-primary skhps-header-login-btn"',
            ' href="' + escapeHtml(loginHref) + '"',
            ' data-skhps-login-link',
          '>',
            '登入',
          '</a>',
        '</nav>',
      '</div>'
    ].join("");
  }

  function boot() {
    renderHeader();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
