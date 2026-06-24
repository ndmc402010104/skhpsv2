/*
檔案位置：skhpsv2/assets/js/layout-fit.js
時間戳記：2026-06-24 UTC+8
用途：SKHPS 共通尺寸 fitting 工具箱。只在頁面主動呼叫時才改指定元素，不自動接管畫面。

水庫法則：
- 本檔提供共通演算法：文字是否溢出、元素是否重疊、fitText、fitSquare、fitGroup。
- 本檔不自動掃全頁。
- 本檔不主動監聽 resize 去改畫面。
- 本檔不改 footer。
- 本檔不改 loading gate。
- 本檔不控制 runtime panel 開關。
*/

(function () {
  "use strict";

  var VERSION = "v0.1.0-20260624";
  var canvas = null;
  var context = null;

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function getMetrics() {
    try {
      if (window.SKHPSLayoutMetrics && typeof window.SKHPSLayoutMetrics.getState === "function") {
        return window.SKHPSLayoutMetrics.getState();
      }

      if (window.SKHPSLayoutMetrics && typeof window.SKHPSLayoutMetrics.measure === "function") {
        return window.SKHPSLayoutMetrics.measure();
      }
    } catch (error) {}

    return {
      orientation: window.innerHeight >= window.innerWidth ? "portrait" : "landscape",
      rwdMode: "",
      layoutWidth: window.innerWidth || document.documentElement.clientWidth || 0,
      layoutHeight: window.innerHeight || document.documentElement.clientHeight || 0,
      usableTop: 0,
      usableBottom: window.innerHeight || document.documentElement.clientHeight || 0,
      usableHeight: window.innerHeight || document.documentElement.clientHeight || 0
    };
  }

  function resolveElement(value, root) {
    if (!value) return null;
    if (typeof value === "string") return (root || document).querySelector(value);
    if (value.nodeType === 1) return value;
    return null;
  }

  function rectOf(value, root) {
    var element = resolveElement(value, root);
    var rect;

    if (!element || !element.getBoundingClientRect) {
      return {
        exists: false,
        element: null,
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
      element: element,
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function overlaps(a, b, gap) {
    gap = Number(gap || 0);
    a = a && a.exists !== undefined ? a : rectOf(a);
    b = b && b.exists !== undefined ? b : rectOf(b);

    if (!a.exists || !b.exists) {
      return {
        overlaps: false,
        x: false,
        y: false,
        amountX: 0,
        amountY: 0,
        a: a,
        b: b
      };
    }

    var x = a.left < b.right + gap && a.right + gap > b.left;
    var y = a.top < b.bottom + gap && a.bottom + gap > b.top;

    return {
      overlaps: Boolean(x && y),
      x: x,
      y: y,
      amountX: x ? Math.min(a.right, b.right) - Math.max(a.left, b.left) : 0,
      amountY: y ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) : 0,
      a: a,
      b: b
    };
  }

  function canvasContext() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      context = canvas.getContext("2d");
    }

    return context;
  }

  function computedFont(element, fontSize) {
    var style = window.getComputedStyle ? window.getComputedStyle(element) : null;
    fontSize = fontSize || (style ? parseFloat(style.fontSize || "16") : 16);

    if (!style) return fontSize + "px sans-serif";

    return [
      style.fontStyle,
      style.fontVariant,
      style.fontWeight,
      fontSize + "px",
      style.fontFamily
    ].join(" ");
  }

  function textWidth(element, text, fontSize) {
    var ctx = canvasContext();
    if (!ctx || !element) return 0;

    ctx.font = computedFont(element, fontSize);
    return Math.ceil(ctx.measureText(String(text || element.textContent || "")).width);
  }

  function numberStyle(element, property, fallback) {
    var style;
    var value;

    if (!element || !window.getComputedStyle) return fallback;
    style = window.getComputedStyle(element);
    value = parseFloat(style[property] || "");
    return isNaN(value) ? fallback : value;
  }

  function contentWidth(element) {
    var rect;
    if (!element || !element.getBoundingClientRect) return 0;
    rect = element.getBoundingClientRect();
    return Math.max(0, rect.width -
      numberStyle(element, "paddingLeft", 0) -
      numberStyle(element, "paddingRight", 0));
  }

  function resetFit(element) {
    element = resolveElement(element);
    if (!element) return false;

    element.style.removeProperty("font-size");
    element.style.removeProperty("line-height");
    element.style.removeProperty("transform");
    element.style.removeProperty("transform-origin");
    element.style.removeProperty("max-width");
    element.style.removeProperty("max-height");
    element.style.removeProperty("width");
    element.style.removeProperty("height");
    return true;
  }

  function textOverflowInfo(options) {
    options = options || {};
    var element = resolveElement(options.element, options.root);
    var container = resolveElement(options.container, options.root) || element && element.parentElement;
    var room = Number(options.width || 0);
    var fontSize;
    var width;

    if (!element) {
      return {
        ok: false,
        reason: "element not found"
      };
    }

    if (!room && container) room = contentWidth(container);
    if (!room) room = contentWidth(element);

    fontSize = Number(options.fontSize || numberStyle(element, "fontSize", 16));
    width = textWidth(element, options.text || element.textContent || "", fontSize);

    return {
      ok: true,
      overflow: width > room,
      textWidth: width,
      room: Math.round(room),
      fontSize: fontSize,
      delta: Math.round(width - room)
    };
  }

  function fitText(options) {
    options = options || {};
    var element = resolveElement(options.element, options.root);
    var container = resolveElement(options.container, options.root) || element && element.parentElement;
    var room = Number(options.width || 0);
    var minFontSize = Number(options.minFontSize || 12);
    var maxFontSize = Number(options.maxFontSize || 0);
    var allowScaleX = options.allowScaleX !== false;
    var scaleFloor = Number(options.scaleFloor || 0.72);
    var text;
    var baseSize;
    var size;
    var measured;
    var scale = 1;

    if (!element) {
      return {
        ok: false,
        reason: "element not found"
      };
    }

    if (!room && container) room = contentWidth(container);
    if (!room) room = contentWidth(element);

    resetFit(element);

    text = String(options.text || element.textContent || "").trim();
    baseSize = Number(options.startFontSize || numberStyle(element, "fontSize", 16));
    if (maxFontSize && baseSize > maxFontSize) baseSize = maxFontSize;
    size = baseSize;

    element.style.maxWidth = Math.max(1, Math.floor(room)) + "px";

    while (size > minFontSize && textWidth(element, text, size) > room) {
      size -= 1;
    }

    element.style.fontSize = Math.max(minFontSize, Math.round(size)) + "px";
    if (options.lineHeight) element.style.lineHeight = String(options.lineHeight);

    measured = textWidth(element, text, size);

    if (allowScaleX && measured > room) {
      scale = Math.max(scaleFloor, room / measured);
      element.style.transform = "scaleX(" + scale + ")";
      element.style.transformOrigin = options.transformOrigin || "center center";
    }

    return {
      ok: true,
      changed: size !== baseSize || scale !== 1,
      fontSize: Math.round(size),
      scaleX: Number(scale.toFixed(3)),
      textWidth: measured,
      room: Math.round(room),
      overflowAfter: textWidth(element, text, size) * scale > room
    };
  }

  function fitSquare(options) {
    options = options || {};
    var element = resolveElement(options.element, options.root);
    var metrics = getMetrics();
    var minSize = Number(options.minSize || 120);
    var maxSize = Number(options.maxSize || Infinity);
    var widthLimit = Number(options.width || metrics.layoutWidth || 0);
    var heightLimit = Number(options.height || metrics.usableHeight || metrics.layoutHeight || 0);
    var reserveHeight = Number(options.reserveHeight || 0);
    var size;

    if (!element) {
      return {
        ok: false,
        reason: "element not found"
      };
    }

    size = Math.floor(Math.min(widthLimit, heightLimit - reserveHeight, maxSize));
    size = Math.max(minSize, size);

    element.style.width = size + "px";
    element.style.height = size + "px";
    element.style.maxWidth = "100%";

    return {
      ok: true,
      size: size,
      widthLimit: widthLimit,
      heightLimit: heightLimit,
      reserveHeight: reserveHeight
    };
  }

  function rolesFromRoot(root) {
    var out = {};
    var nodes;
    var i;
    var role;

    root = resolveElement(root);
    if (!root) return out;

    nodes = root.querySelectorAll("[data-skhps-fit-role]");
    for (i = 0; i < nodes.length; i += 1) {
      role = String(nodes[i].getAttribute("data-skhps-fit-role") || "").trim();
      if (role && !out[role]) out[role] = nodes[i];
    }

    return out;
  }

  function normalizeRoleElements(options) {
    var root = resolveElement(options.root);
    var roles = Object.assign({}, root ? rolesFromRoot(root) : {});
    var configured = options.roles || {};

    Object.keys(configured).forEach(function (key) {
      var found = resolveElement(configured[key], root || document);
      if (found) roles[key] = found;
    });

    return roles;
  }

  function detectGroup(options) {
    options = options || {};
    var root = resolveElement(options.root);
    var metrics = getMetrics();
    var roles = normalizeRoleElements(options);
    var keys = Object.keys(roles);
    var rects = {};
    var overlapPairs = [];
    var widthOverflow = [];
    var rootRect = root ? rectOf(root) : null;
    var i;
    var j;
    var pair;
    var room;

    keys.forEach(function (key) {
      rects[key] = rectOf(roles[key]);
      room = rootRect && rootRect.exists ? rootRect.width : metrics.layoutWidth;
      if (rects[key].exists && rects[key].right > room) {
        widthOverflow.push(key);
      }
    });

    for (i = 0; i < keys.length; i += 1) {
      for (j = i + 1; j < keys.length; j += 1) {
        pair = overlaps(rects[keys[i]], rects[keys[j]], Number(options.gap || 0));
        if (pair.overlaps) {
          overlapPairs.push({
            a: keys[i],
            b: keys[j],
            amountX: pair.amountX,
            amountY: pair.amountY
          });
        }
      }
    }

    return {
      ok: true,
      rootExists: Boolean(root),
      metrics: metrics,
      roles: keys,
      rects: rects,
      overlapPairs: overlapPairs,
      widthOverflow: widthOverflow,
      heightOverflow: rootRect && rootRect.exists ? rootRect.height > metrics.usableHeight : false,
      recommendation: overlapPairs.length ? "avoid-overlap" :
        widthOverflow.length ? "fit-width" :
          rootRect && rootRect.exists && rootRect.height > metrics.usableHeight ? "fit-height" : "none"
    };
  }

  function fitGroup(options) {
    options = options || {};
    var metrics = getMetrics();
    var root = resolveElement(options.root);
    var roles = normalizeRoleElements(options);
    var mode = String(options.mode || root && root.getAttribute("data-skhps-fit-mode") || "").trim();
    var results = {};
    var room;

    if (mode === "portrait-only" && metrics.orientation !== "portrait") {
      Object.keys(roles).forEach(function (key) {
        resetFit(roles[key]);
      });

      return {
        ok: true,
        skipped: true,
        reason: "not portrait",
        metrics: metrics
      };
    }

    room = Number(options.width || root && root.getBoundingClientRect && root.getBoundingClientRect().width || metrics.layoutWidth || 0);

    ["title", "date", "name", "time", "note"].forEach(function (key) {
      if (!roles[key]) return;
      results[key] = fitText({
        element: roles[key],
        width: room - Number(options.horizontalPadding || 0),
        minFontSize: options.minFontSize || (key === "note" ? 12 : 16),
        allowScaleX: key === "name" ? options.allowScaleX !== false : false,
        lineHeight: key === "note" ? 1.18 : 1.05,
        scaleFloor: options.scaleFloor || 0.72
      });
    });

    if (roles.qr) {
      results.qr = fitSquare({
        element: roles.qr,
        width: Number(options.qrWidth || room),
        height: Number(options.qrHeight || metrics.usableHeight),
        reserveHeight: Number(options.reserveHeight || 0),
        minSize: Number(options.minQrSize || 180),
        maxSize: Number(options.maxQrSize || Infinity)
      });
    }

    return {
      ok: true,
      skipped: false,
      metrics: metrics,
      results: results,
      after: detectGroup(options)
    };
  }

  window.SKHPSLayoutFit = {
    version: VERSION,
    getMetrics: getMetrics,
    rectOf: rectOf,
    overlaps: overlaps,
    textWidth: textWidth,
    textOverflowInfo: textOverflowInfo,
    resetFit: resetFit,
    fitText: fitText,
    fitSquare: fitSquare,
    detectGroup: detectGroup,
    fitGroup: fitGroup,
    clone: clone
  };
})();
