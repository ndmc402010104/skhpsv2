/*
File: skhpsv2/assets/js/page-map.js
Purpose: render the shared SKHPS page map / breadcrumb.
*/

(function () {
  "use strict";

  var NAV_SELECTOR = "nav[data-skhps-page-map]";

  function html() {
    return document.documentElement;
  }

  function text(value) {
    return String(value || "").trim();
  }

  function isHomePage() {
    var pageId = text(html().getAttribute("data-skhps-page-id"));
    var path = String(window.location.pathname || "").toLowerCase();

    return pageId === "home" ||
      pageId === "index" ||
      /(^|\/)index\.html$/.test(path) && path.indexOf("/skhpsv2/") >= 0;
  }

  function getRuntime() {
    if (window.SKHPSConfig && typeof window.SKHPSConfig.getEnv === "function") {
      return window.SKHPSConfig.getEnv(window.SKHPS_CONFIG || {});
    }

    return text(html().getAttribute("data-skhps-runtime"));
  }

  function withRuntime(href) {
    if (!href || href === "#") return href || "";

    if (window.SKHPSConfig && typeof window.SKHPSConfig.withRuntime === "function") {
      return window.SKHPSConfig.withRuntime(href, window.SKHPS_CONFIG || {});
    }

    var runtime = getRuntime();
    if (!runtime) return href;

    try {
      var url = new URL(href, window.location.href);
      url.searchParams.set("skhpsRuntime", runtime);
      return url.toString();
    } catch (error) {
      return href +
        (String(href).indexOf("?") >= 0 ? "&" : "?") +
        "skhpsRuntime=" +
        encodeURIComponent(runtime);
    }
  }

  function sharedHomeHref() {
    var explicit = text(html().getAttribute("data-skhps-page-map-home-href"));
    var sharedBase = window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.sharedBaseUrl;
    var configBase = "";

    if (explicit) return withRuntime(explicit);

    if (window.SKHPSConfig && typeof window.SKHPSConfig.getSiteBaseUrl === "function") {
      configBase = window.SKHPSConfig.getSiteBaseUrl(window.SKHPS_CONFIG || {});
    }

    if (sharedBase) return withRuntime(sharedBase);
    if (configBase) return withRuntime(configBase);

    return withRuntime("index.html");
  }

  function currentLabel() {
    return text(html().getAttribute("data-skhps-page-map-current")) ||
      text(html().getAttribute("data-skhps-page-map-title")) ||
      text(html().getAttribute("data-loading-title")) ||
      text(window.SKHPS_APP_ENV && window.SKHPS_APP_ENV.title) ||
      text(window.SKHPS_APP_CONFIG && window.SKHPS_APP_CONFIG.title) ||
      text(document.title) ||
      "目前頁面";
  }

  function parseCustomMap() {
    var raw = text(html().getAttribute("data-skhps-page-map"));
    if (!raw) return null;

    try {
      var data = JSON.parse(raw);
      return Array.isArray(data) ? data : null;
    } catch (error) {
      return null;
    }
  }

  function fallbackItems() {
    var homeLabel = text(html().getAttribute("data-skhps-page-map-home-label")) || "首頁";
    var parentLabel = text(html().getAttribute("data-skhps-page-map-parent-label"));
    var parentHref = text(html().getAttribute("data-skhps-page-map-parent-href"));
    var current = currentLabel();
    var items = [];

    if (isHomePage() && current === homeLabel) {
      return [{ label: homeLabel, current: true }];
    }

    if (!parentLabel) {
      items.push({
        label: homeLabel,
        href: sharedHomeHref()
      });
    } else {
      items.push({
        label: parentLabel,
        href: withRuntime(parentHref || sharedHomeHref())
      });
    }

    items.push({
      label: current,
      current: true
    });

    return items;
  }

  function getItems() {
    var custom = parseCustomMap();
    if (!custom || !custom.length) return fallbackItems();

    return custom.map(function (item, index) {
      item = item || {};
      return {
        label: text(item.label),
        href: item.href ? withRuntime(String(item.href)) : "",
        current: Boolean(item.current) || index === custom.length - 1
      };
    }).filter(function (item) {
      return item.label;
    });
  }

  function getTarget() {
    return document.querySelector("[data-skhps-page-map-container]") ||
      document.querySelector("main .skhps-container") ||
      document.querySelector("main");
  }

  function claimExistingNav() {
    var shared = document.querySelector(NAV_SELECTOR);
    var legacy = Array.prototype.slice.call(
      document.querySelectorAll("nav.skhps-page-map:not([data-skhps-page-map])")
    );

    if (shared) {
      legacy.forEach(function (nav) {
        if (nav && nav.parentNode) nav.parentNode.removeChild(nav);
      });
      return shared;
    }

    if (!legacy.length) return null;

    legacy.slice(1).forEach(function (nav) {
      if (nav && nav.parentNode) nav.parentNode.removeChild(nav);
    });

    legacy[0].setAttribute("data-skhps-page-map", "");
    return legacy[0];
  }

  function makeLink(item) {
    var link = document.createElement("a");
    link.className = "skhps-page-map-link";
    link.href = item.href || "#";
    link.textContent = item.label;
    return link;
  }

  function makeCurrent(item) {
    var span = document.createElement("span");
    span.className = "skhps-page-map-current";
    span.setAttribute("aria-current", "page");
    span.textContent = item.label;
    return span;
  }

  function makeSeparator() {
    var sep = document.createElement("span");
    sep.className = "skhps-page-map-sep";
    sep.setAttribute("aria-hidden", "true");
    sep.textContent = "/";
    return sep;
  }

  function render() {
    var target = getTarget();
    var items = getItems();
    var existing = claimExistingNav();
    var nav;

    if (!target || !items.length) return;

    nav = existing || document.createElement("nav");
    nav.className = "skhps-page-map";
    nav.setAttribute("data-skhps-page-map", "");
    nav.setAttribute("aria-label", "頁面地圖");
    nav.textContent = "";

    items.forEach(function (item, index) {
      if (index) nav.appendChild(makeSeparator());
      nav.appendChild(item.current || !item.href ? makeCurrent(item) : makeLink(item));
    });

    if (!existing) {
      target.insertBefore(nav, target.firstElementChild || null);
    }

    html().setAttribute("data-skhps-page-map-ready", "true");
  }

  window.SKHPSPageMap = window.SKHPSPageMap || {};
  window.SKHPSPageMap.render = render;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
