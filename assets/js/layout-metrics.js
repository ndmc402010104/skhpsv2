/*
檔案位置：skhpsv2/assets/js/layout-metrics.js
時間戳記：2026-06-24 UTC+8
用途：SKHPS 共通尺寸量測層。只負責偵測 viewport / orientation / RWD mode / header-footer 邊界，不負責改畫面。

水庫法則：
- 本檔只量測、更新 state、廣播事件。
- 本檔不改 footer。
- 本檔不改 loading gate。
- 本檔不控制 runtime panel 開關。
- 本檔不主動縮字、不主動換行、不主動縮 QR。
*/

(function () {
  "use strict";

  var MODULE = "layout-metrics";
  var UPDATE_EVENT = "skhps-layout-metrics-updated";
  var scheduled = false;
  var subscribers = [];
  var resizeObservers = [];
  var mutationObserver = null;

  var BREAKPOINTS = [
    { max: 480, mode: "phone-compact", label: "手機窄版 phone-compact", reason: "layoutWidth <= 480" },
    { max: 720, mode: "phone", label: "手機版 phone", reason: "481 <= layoutWidth <= 720" },
    { max: 960, mode: "tablet", label: "平板 / 窄版 tablet", reason: "721 <= layoutWidth <= 960" },
    { max: 1200, mode: "desktop", label: "桌機版 desktop", reason: "961 <= layoutWidth <= 1200" },
    { max: Infinity, mode: "wide", label: "寬版 wide", reason: "layoutWidth > 1200" }
  ];

  var state = {
    orientation: "",
    rwdMode: "",
    rwdLabel: "",
    rwdReason: "",
    mediaMatches: "",
    layoutWidth: 0,
    layoutHeight: 0,
    visualWidth: 0,
    visualHeight: 0,
    visualOffsetLeft: 0,
    visualOffsetTop: 0,
    keyboardGap: 0,
    header: rectInfo(null),
    footer: rectInfo(null),
    usableTop: 0,
    usableBottom: 0,
    usableHeight: 0,
    updatedAt: "",
    updatedAtIso: ""
  };

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function rectInfo(element) {
    var rect;

    if (!element || !element.getBoundingClientRect) {
      return {
        exists: false,
        top: null,
        bottom: null,
        left: null,
        right: null,
        width: 0,
        height: 0
      };
    }

    rect = element.getBoundingClientRect();

    return {
      exists: true,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function findHeader() {
    return document.querySelector("[data-skhps-header]") ||
      document.querySelector(".skhps-header") ||
      document.getElementById("header");
  }

  function findFooter() {
    return document.querySelector("[data-skhps-footer]") ||
      document.querySelector(".skhps-footer") ||
      document.querySelector("footer");
  }

  function rwdModeForWidth(width) {
    var i;

    width = Math.round(Number(width || 0));

    for (i = 0; i < BREAKPOINTS.length; i += 1) {
      if (width <= BREAKPOINTS[i].max) {
        return {
          mode: BREAKPOINTS[i].mode,
          label: BREAKPOINTS[i].label,
          reason: BREAKPOINTS[i].reason
        };
      }
    }

    return {
      mode: "wide",
      label: "寬版 wide",
      reason: "layoutWidth > 1200"
    };
  }

  function matchMediaQuery(query) {
    try {
      return Boolean(window.matchMedia && window.matchMedia(query).matches);
    } catch (error) {
      return false;
    }
  }

  function mediaQueryMatches() {
    return [
      "(max-width:480px)=" + (matchMediaQuery("(max-width:480px)") ? "true" : "false"),
      "(max-width:720px)=" + (matchMediaQuery("(max-width:720px)") ? "true" : "false"),
      "(max-width:960px)=" + (matchMediaQuery("(max-width:960px)") ? "true" : "false"),
      "(min-width:961px)=" + (matchMediaQuery("(min-width:961px)") ? "true" : "false")
    ].join(" / ");
  }

  function measure() {
    var viewport = window.visualViewport || null;
    var layoutWidth = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
    var layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || 0);
    var visualWidth = Math.round(viewport && viewport.width ? viewport.width : layoutWidth);
    var visualHeight = Math.round(viewport && viewport.height ? viewport.height : layoutHeight);
    var visualOffsetLeft = Math.round(viewport && viewport.offsetLeft ? viewport.offsetLeft : 0);
    var visualOffsetTop = Math.round(viewport && viewport.offsetTop ? viewport.offsetTop : 0);
    var header = rectInfo(findHeader());
    var footer = rectInfo(findFooter());
    var orientation = layoutHeight >= layoutWidth ? "portrait" : "landscape";
    var rwd = rwdModeForWidth(layoutWidth);
    var usableTop = header.exists ? Math.max(0, header.bottom) : 0;
    var usableBottom = footer.exists ? Math.max(0, Math.min(layoutHeight, footer.top)) : layoutHeight;
    var usableHeight = Math.max(0, usableBottom - usableTop);
    var keyboardGap = Math.max(0, Math.round(layoutHeight - visualHeight - visualOffsetTop));
    var now = new Date();

    return {
      orientation: orientation,
      rwdMode: rwd.mode,
      rwdLabel: rwd.label,
      rwdReason: rwd.reason,
      mediaMatches: mediaQueryMatches(),
      layoutWidth: layoutWidth,
      layoutHeight: layoutHeight,
      visualWidth: visualWidth,
      visualHeight: visualHeight,
      visualOffsetLeft: visualOffsetLeft,
      visualOffsetTop: visualOffsetTop,
      keyboardGap: keyboardGap,
      header: header,
      footer: footer,
      usableTop: Math.round(usableTop),
      usableBottom: Math.round(usableBottom),
      usableHeight: Math.round(usableHeight),
      updatedAt: now.toLocaleTimeString("zh-TW", { hour12: false }),
      updatedAtIso: now.toISOString()
    };
  }

  function applyHtmlAttributes(next) {
    var html = document.documentElement;
    if (!html) return;

    html.setAttribute("data-skhps-orientation", next.orientation || "");
    html.setAttribute("data-skhps-rwd-mode", next.rwdMode || "");
    html.setAttribute("data-skhps-layout-width", String(next.layoutWidth || 0));
    html.setAttribute("data-skhps-layout-height", String(next.layoutHeight || 0));
  }

  function notify(next) {
    var i;

    applyHtmlAttributes(next);

    try {
      document.dispatchEvent(new CustomEvent(UPDATE_EVENT, {
        detail: clone(next)
      }));
    } catch (error) {}

    for (i = 0; i < subscribers.length; i += 1) {
      try {
        subscribers[i](clone(next));
      } catch (error) {}
    }
  }

  function updateNow() {
    state = measure();
    notify(state);
    return state;
  }

  function scheduleUpdate() {
    if (scheduled) return;

    scheduled = true;

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(function () {
        scheduled = false;
        updateNow();
      });
      return;
    }

    window.setTimeout(function () {
      scheduled = false;
      updateNow();
    }, 80);
  }

  function observeElementSize(element) {
    var observer;

    if (!element || typeof ResizeObserver !== "function") return;

    try {
      observer = new ResizeObserver(scheduleUpdate);
      observer.observe(element);
      resizeObservers.push(observer);
    } catch (error) {}
  }

  function installObservers() {
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("orientationchange", scheduleUpdate, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleUpdate, { passive: true });
      window.visualViewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    }

    if (document.body) {
      observeElementSize(document.body);
    }

    observeElementSize(findHeader());
    observeElementSize(findFooter());

    if (typeof MutationObserver === "function" && document.documentElement) {
      try {
        mutationObserver = new MutationObserver(function () {
          scheduleUpdate();
        });
        mutationObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "data-skhps-runtime-panel-open", "data-skhps-footer-fixed"]
        });
      } catch (error) {}
    }
  }

  function subscribe(handler) {
    if (typeof handler !== "function") {
      return function () {};
    }

    subscribers.push(handler);

    try {
      handler(clone(state));
    } catch (error) {}

    return function () {
      subscribers = subscribers.filter(function (item) {
        return item !== handler;
      });
    };
  }

  function destroy() {
    var i;

    window.removeEventListener("resize", scheduleUpdate);
    window.removeEventListener("scroll", scheduleUpdate);
    window.removeEventListener("orientationchange", scheduleUpdate);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", scheduleUpdate);
      window.visualViewport.removeEventListener("scroll", scheduleUpdate);
    }

    for (i = 0; i < resizeObservers.length; i += 1) {
      try {
        resizeObservers[i].disconnect();
      } catch (error) {}
    }

    resizeObservers = [];

    if (mutationObserver) {
      try {
        mutationObserver.disconnect();
      } catch (error) {}
      mutationObserver = null;
    }
  }

  window.SKHPSLayoutMetrics = {
    version: "v0.1.0-20260624",
    eventName: UPDATE_EVENT,
    breakpoints: BREAKPOINTS.map(function (item) {
      return {
        max: item.max === Infinity ? "Infinity" : item.max,
        mode: item.mode,
        label: item.label,
        reason: item.reason
      };
    }),
    getState: function () {
      return clone(state);
    },
    measure: function () {
      return clone(updateNow());
    },
    schedule: scheduleUpdate,
    subscribe: subscribe,
    rwdModeForWidth: rwdModeForWidth,
    destroy: destroy
  };

  installObservers();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleUpdate, { once: true });
  }

  updateNow();

  try {
    if (window.SKHPSRuntime && typeof window.SKHPSRuntime.log === "function") {
      window.SKHPSRuntime.log({
        level: "info",
        module: MODULE,
        message: "layout metrics initialized",
        source: "layout-metrics.js",
        category: "runtime",
        action: "moduleReady",
        status: "OK",
        data: clone(state)
      });
    }
  } catch (error) {}
})();
