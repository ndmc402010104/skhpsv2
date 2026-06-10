/*
檔案位置：skhpsv2/assets/js/route.js
時間戳記：2026-06-10 UTC+8
用途：skhpsv2 前端頁面路由 helper；等待 config.pages 載入完成後，依 page id 自動補上 href。
修正：支援 page.href 為字串，或 { local-dev, dev, prod } 環境物件。
*/

(function () {
  "use strict";

  var MAX_WAIT_MS = 5000;
  var CHECK_INTERVAL_MS = 100;

  function getConfig() {
    return (
      window.SKHPS_CONFIG ||
      window.skhpsConfig ||
      {}
    );
  }

  function getEnv(config) {
    config = config || getConfig();

    if (
      window.SKHPSConfig &&
      typeof window.SKHPSConfig.getEnv === "function"
    ) {
      return window.SKHPSConfig.getEnv(config);
    }

    return config.env || "prod";
  }

  function getEnvValue(value, config) {
    config = config || getConfig();
    var env = getEnv(config);

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value[env] || value.prod || value.dev || value["local-dev"] || "";
    }

    return value;
  }

  function getPages() {
    var config = getConfig();
    return Array.isArray(config.pages) ? config.pages : [];
  }

  function hasPagesReady() {
    return getPages().length > 0;
  }

  function getPageById(pageId) {
    var pages = getPages();

    for (var i = 0; i < pages.length; i += 1) {
      if (pages[i] && pages[i].id === pageId) {
        return pages[i];
      }
    }

    return null;
  }

  function getHref(pageId, fallbackHref) {
    var config = getConfig();
    var page = getPageById(pageId);

    if (page && page.href) {
      return getEnvValue(page.href, config) || fallbackHref || "#";
    }

    return fallbackHref || "#";
  }

  function applyPageLinks(root) {
    var scope = root || document;
    var links = scope.querySelectorAll("[data-skhps-page-id]");

    links.forEach(function (link) {
      var pageId = link.getAttribute("data-skhps-page-id");
      var href = getHref(pageId);

      if (!href || href === "#") {
        link.setAttribute("href", "#");
        link.setAttribute("aria-disabled", "true");
        link.classList.add("skhps-btn-disabled");

        if (!link.dataset.skhpsRouteClickBound) {
          link.dataset.skhpsRouteClickBound = "1";

          link.addEventListener("click", function (event) {
            event.preventDefault();

            var pages = getPages();
            var knownIds = pages.map(function (page) {
              return page && page.id;
            }).filter(Boolean).join(", ");

            alert(
              "config.pages 找不到 page id: " +
              pageId +
              "\n\n目前已載入的 page id: " +
              (knownIds || "尚未載入")
            );
          });
        }

        return;
      }

      link.setAttribute("href", href);
      link.removeAttribute("aria-disabled");
      link.classList.remove("skhps-btn-disabled");
    });
  }

  function waitForConfigThenApply() {
    var startedAt = Date.now();

    function tick() {
      if (hasPagesReady()) {
        applyPageLinks(document);
        return;
      }

      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        applyPageLinks(document);
        return;
      }

      window.setTimeout(tick, CHECK_INTERVAL_MS);
    }

    tick();
  }

  window.SKHPSRoute = {
    getConfig: getConfig,
    getEnv: getEnv,
    getEnvValue: getEnvValue,
    getPages: getPages,
    getPageById: getPageById,
    getHref: getHref,
    applyPageLinks: applyPageLinks,
    waitForConfigThenApply: waitForConfigThenApply
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForConfigThenApply);
  } else {
    waitForConfigThenApply();
  }
})();