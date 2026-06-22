/*
檔案位置：skhpsv2/assets/js/css-setting-style-editor.js
時間戳記：2026-06-22 09:40 UTC+8
用途：CSS Setting Style Editor；固定讀取 Google Sheet gid 0 / CSS總表，使用 component 作為分類，支援即時預覽、realtime 色票、本機暫存。
*/

(function () {
  /*
    目前 CSS/base-style-playground.html 可能仍使用舊 id。
    所以 root/status 先保留舊 id 相容；檔案名稱與資料來源已改成 CSS總表。
  */
  var ROOT_ID = "baseStyleEditorRoot";
  var STATUS_ID = "baseStyleEditorStatus";
  var ALT_STATUS_SELECTOR = "[data-skhps-css-main-status],[data-skhps-base-style-status]";
  var STYLE_ID = "cssSettingStyleEditorStyle";
  var STORAGE_KEY = "skhpsv2.cssSettingStyle.localDraft.v1";
  var RENDERED_ATTR = "data-css-setting-style-editor-rendered";
  var CSS_MAIN_TAB_KEY = "cssMain";
  var CSS_MAIN_TAB_GID = "0";
  var CSS_MAIN_TAB_NAME = "CSS總表";

  var GROUPS = [
    {
      title: "A. Brand / 品牌色",
      className: "brand",
      label: "品牌核心色",
      desc: "全站主要語意色。後續 Button / Alert / Badge 都應該疊在這組 token 上。",
      selector: ":root brand tokens",
      props: [
        ["primary", "primary", "color"],
        ["primarySoft", "primary soft", "color"],
        ["danger", "danger", "color"],
        ["success", "success", "color"],
        ["warning", "warning", "color"]
      ]
    },
    {
      title: "B. Page / 頁面",
      className: "page",
      label: "頁面基底",
      desc: "整個網頁背景、主要文字、次要文字。",
      selector: "body / page tokens",
      props: [
        ["bg", "background", "color"],
        ["text", "text", "color"],
        ["muted", "muted", "color"]
      ]
    },
    {
      title: "C. Surface / 卡片表面",
      className: "surface",
      label: "卡片表面",
      desc: "卡片、面板、內容容器的共用表面樣式。",
      selector: ".skh-surface",
      props: [
        ["bg", "background", "color"],
        ["border", "border", "color"],
        ["shadow", "shadow", "text"]
      ]
    },
    {
      title: "D. Radius / 圓角",
      className: "radius",
      label: "全站圓角",
      desc: "控制元件預設圓角階層。",
      selector: ":root radius tokens",
      props: [
        ["sm", "sm", "text"],
        ["base", "base", "text"],
        ["lg", "lg", "text"],
        ["pill", "pill", "text"]
      ]
    },
    {
      title: "E. Spacing / 間距",
      className: "space",
      label: "全站間距",
      desc: "控制 gap、padding、section spacing 的階層。",
      selector: ":root spacing tokens",
      props: [
        ["xs", "xs", "text"],
        ["sm", "sm", "text"],
        ["md", "md", "text"],
        ["lg", "lg", "text"],
        ["xl", "xl", "text"]
      ]
    },
    {
      title: "05A. Swipe Table / 滑動表格",
      component: "swipe-table",
      className: ":root",
      label: "Swipe Table 縮放",
      desc: "所有 .sk-swipe-table 共用的縮放與密度 token；簽到後台改成 swipe table 後也會直接吃這組。",
      selector: ":root swipe table tokens",
      props: [
        ["--sk-swipe-table-scale", "整體縮放", "text"],
        ["--sk-swipe-table-font-size", "表格字級", "text"],
        ["--sk-swipe-table-row-min-height", "列高下限", "text"],
        ["--sk-swipe-table-main-padding", "主欄內距", "text"],
        ["--sk-swipe-table-main-gap", "主欄間距", "text"],
        ["--sk-swipe-action-rail-width", "左滑按鈕寬度", "text"],
        ["--sk-swipe-primary-text-gap", "左滑讓位間距", "text"],
        ["--sk-swipe-menu-font-size", "更多選單字級", "text"]
      ]
    },
    {
      title: "F. Font / 字體",
      className: "font",
      label: "全站字體",
      desc: "控制字體家族、尺寸、字重、行高。",
      selector: "body font tokens",
      props: [
        ["family", "font family", "text"],
        ["size", "size", "text"],
        ["sizeSm", "size sm", "text"],
        ["sizeLg", "size lg", "text"],
        ["weight", "weight", "text"],
        ["weightBold", "weight bold", "text"],
        ["lineHeight", "line height", "text"]
      ]
    },
    {
      title: "G. Motion / 動畫",
      className: "motion",
      label: "全站 transition",
      desc: "控制 hover、active、狀態切換的基礎速度。",
      selector: ":root motion tokens",
      props: [
        ["duration", "duration", "text"],
        ["easing", "easing", "text"]
      ]
    },
    {
      title: "H. Layout / 版面",
      className: "layout",
      label: "全站版面",
      desc: "控制容器最大寬度、頁面 padding、區塊間距。",
      selector: "main / section layout tokens",
      props: [
        ["containerMaxWidth", "container max", "text"],
        ["containerPadding", "container padding", "text"],
        ["sectionGap", "section gap", "text"]
      ]
    }
  ];

  var FALLBACK = {
    brand: { primary: "#344f9f", primarySoft: "#eef3ff", danger: "#b42318", success: "#15803d", warning: "#b45309" },
    page: { bg: "#f4f7fb", text: "#0f172a", muted: "#64748b" },
    surface: { bg: "#ffffff", border: "#cbd5e1", shadow: "0 8px 24px rgba(15,23,42,.06)" },
    radius: { sm: "6px", base: "10px", lg: "16px", pill: "999px" },
    space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px" },
    font: {
      family: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      size: "14px",
      sizeSm: "13px",
      sizeLg: "16px",
      weight: "500",
      weightBold: "700",
      lineHeight: "1.6"
    },
    motion: { duration: ".18s", easing: "ease" },
    layout: { containerMaxWidth: "1200px", containerPadding: "24px", sectionGap: "24px" },
    ":root": {
      "--sk-swipe-table-scale": "1",
      "--sk-swipe-table-font-size": "calc(17px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-table-row-min-height": "calc(64px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-table-main-padding": "calc(10px * var(--sk-swipe-table-scale, 1)) calc(16px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-table-main-gap": "calc(8px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-action-rail-width": "calc(124px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-primary-text-gap": "calc(6px * var(--sk-swipe-table-scale, 1))",
      "--sk-swipe-menu-font-size": "calc(16px * var(--sk-swipe-table-scale, 1))"
    }
  };

  var currentMap = null;

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    var target = el(STATUS_ID) || document.querySelector(ALT_STATUS_SELECTOR);
    if (target) target.textContent = text;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function cssVarName(className, property) {
    if (String(property || "").indexOf("--") === 0) return property;
    return "--skhps-" + className + "-" + property;
  }

  function legacyVarName(className, property) {
    var map = {
      "brand.primary": "--skh-primary",
      "brand.primarySoft": "--skh-primary-soft",
      "brand.danger": "--skh-danger",
      "brand.success": "--skh-success",
      "brand.warning": "--skh-warning",
      "page.bg": "--skh-page-bg",
      "page.text": "--skh-page-text",
      "page.muted": "--skh-page-muted",
      "surface.bg": "--skh-surface-bg",
      "surface.border": "--skh-surface-border",
      "surface.shadow": "--skh-surface-shadow",
      "radius.base": "--skh-radius",
      "radius.sm": "--skh-radius-sm",
      "radius.lg": "--skh-radius-lg",
      "radius.pill": "--skh-radius-pill",
      "space.xs": "--skh-space-xs",
      "space.sm": "--skh-space-sm",
      "space.md": "--skh-space-md",
      "space.lg": "--skh-space-lg",
      "space.xl": "--skh-space-xl",
      "font.family": "--skh-font-family",
      "font.size": "--skh-font-size",
      "font.sizeSm": "--skh-font-size-sm",
      "font.sizeLg": "--skh-font-size-lg",
      "font.weight": "--skh-font-weight",
      "font.weightBold": "--skh-font-weight-bold",
      "font.lineHeight": "--skh-line-height",
      "motion.duration": "--skh-transition-duration",
      "motion.easing": "--skh-transition-easing",
      "layout.containerMaxWidth": "--skh-container-max-width",
      "layout.containerPadding": "--skh-container-padding",
      "layout.sectionGap": "--skh-section-gap"
    };

    return map[className + "." + property] || "";
  }

  function setCssVar(className, property, value) {
    var root = document.documentElement;
    root.style.setProperty(cssVarName(className, property), value);

    var legacy = legacyVarName(className, property);
    if (legacy) root.style.setProperty(legacy, value);

    if (className === "motion") {
      var duration = getComputedStyle(root).getPropertyValue("--skhps-motion-duration").trim() || ".18s";
      var easing = getComputedStyle(root).getPropertyValue("--skhps-motion-easing").trim() || "ease";
      root.style.setProperty("--skhps-transition", duration + " " + easing);
      root.style.setProperty("--skh-transition", duration + " " + easing);
    }
  }

  function getMapValue(map, className, property) {
    return map && map[className] && map[className][property] !== undefined
      ? map[className][property]
      : "";
  }

  function setMapValue(map, className, property, value) {
    map[className] = map[className] || {};
    map[className][property] = value;
  }

  function injectCss() {
    /* CSS Setting editor 不再由 JS 注入硬寫視覺 CSS。 */
  }

  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path + " HTTP " + res.status);
      return res.json();
    });
  }

  function csvUrl(config) {
    var id = config && config.sheets && config.sheets.mainSpreadsheetId;

    if (!id) throw new Error("config.json missing sheets.mainSpreadsheetId");

    return "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(id) +
      "/export?format=csv&gid=" +
      encodeURIComponent(CSS_MAIN_TAB_GID) +
      "&ts=" +
      Date.now();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var quote = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      var n = text[i + 1];

      if (quote) {
        if (c === '"' && n === '"') {
          cell += '"';
          i++;
        } else if (c === '"') {
          quote = false;
        } else {
          cell += c;
        }
      } else {
        if (c === '"') {
          quote = true;
        } else if (c === ",") {
          row.push(cell);
          cell = "";
        } else if (c === "\n") {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = "";
        } else if (c !== "\r") {
          cell += c;
        }
      }
    }

    row.push(cell);
    rows.push(row);

    return rows.filter(function (r) {
      return r.some(function (x) {
        return String(x || "").trim() !== "";
      });
    });
  }

  function parseDate(value) {
    var raw = String(value || "").trim();
    if (!raw || raw.toLowerCase() === "default") return -1;

    var date = new Date(raw.replace(/\//g, "-"));
    if (!isNaN(date.getTime())) return date.getTime();

    return 0;
  }

  function buildMaps(rows) {
    var header = rows[0] || [];
    var idx = {};
    var grouped = {};

    header.forEach(function (h, i) {
      idx[String(h || "").trim()] = i;
    });

    rows.slice(1).forEach(function (row) {
      var component = String(row[idx.component] || "").trim();
      var className = String(row[idx.className] || "").trim();
      var property = String(row[idx.property] || "").trim();
      var value = String(row[idx.value] || "").trim();
      var description = String(row[idx.description] || "").trim();
      var updatedAt = String(row[idx.updatedAt] || "").trim();

      if (!component || !className || !property) return;

      var key = className + "|" + property;

      if (!grouped[key]) {
        grouped[key] = {
          className: className,
          property: property,
          defaultValue: "",
          currentValue: "",
          currentScore: -2,
          description: description
        };
      }

      if (description) grouped[key].description = description;

      if (updatedAt.toLowerCase() === "default") {
        grouped[key].defaultValue = value;
      } else {
        var score = parseDate(updatedAt);
        if (score >= grouped[key].currentScore) {
          grouped[key].currentValue = value;
          grouped[key].currentScore = score;
        }
      }
    });

    var current = clone(FALLBACK);
    var defaults = clone(FALLBACK);
    var descriptions = {};

    Object.keys(grouped).forEach(function (key) {
      var item = grouped[key];
      var effective = item.currentValue || item.defaultValue;

      current[item.className] = current[item.className] || {};
      defaults[item.className] = defaults[item.className] || {};
      descriptions[item.className] = descriptions[item.className] || {};

      if (effective) current[item.className][item.property] = effective;
      if (item.defaultValue) defaults[item.className][item.property] = item.defaultValue;
      if (item.description) descriptions[item.className][item.property] = item.description;
    });

    return {
      current: current,
      defaults: defaults,
      descriptions: descriptions
    };
  }

  function applyMap(map) {
    Object.keys(map).forEach(function (className) {
      Object.keys(map[className] || {}).forEach(function (property) {
        setCssVar(className, property, map[className][property]);
      });
    });
  }

  function renderDemo(group) {
    if (group.component === "swipe-table") {
      return [
        "<div style='font-size:var(--sk-swipe-table-font-size,calc(17px * var(--sk-swipe-table-scale,1)));border:1px solid var(--skhps-surface-border,#cbd5e1);border-radius:12px;overflow:hidden;background:#fff;'>",
        "<div style='min-height:var(--sk-swipe-table-row-min-height,calc(64px * var(--sk-swipe-table-scale,1)));padding:var(--sk-swipe-table-main-padding,calc(10px * var(--sk-swipe-table-scale,1)) calc(16px * var(--sk-swipe-table-scale,1)));display:flex;align-items:center;gap:var(--sk-swipe-table-main-gap,calc(8px * var(--sk-swipe-table-scale,1)));'>",
        "<strong style='display:block;'>Swipe Table</strong>",
        "<span style='color:var(--skhps-page-muted,#64748b);'>scale preview</span>",
        "</div>",
        "</div>"
      ].join("");
    }

    if (group.className === "brand") {
      return "<div style='display:grid;gap:8px;'><strong style='color:var(--skhps-brand-primary,#344f9f);'>Primary</strong><strong style='color:var(--skhps-brand-danger,#b42318);'>Danger</strong><strong style='color:var(--skhps-brand-success,#15803d);'>Success</strong><strong style='color:var(--skhps-brand-warning,#b45309);'>Warning</strong></div>";
    }

    if (group.className === "page") {
      return "<div style='padding:14px;border-radius:var(--skhps-radius-base,10px);background:var(--skhps-page-bg,#f4f7fb);border:1px solid var(--skhps-surface-border,#cbd5e1);'><strong style='color:var(--skhps-page-text,#0f172a);'>一般文字</strong><p style='margin:6px 0 0;color:var(--skhps-page-muted,#64748b);'>Muted description text</p></div>";
    }

    if (group.className === "surface") {
      return "<div class='base-demo-card'><strong>Surface Card</strong><p style='margin-bottom:0;'>bg / border / shadow</p></div>";
    }

    if (group.className === "radius") {
      return "<div class='base-pill-row'><span class='base-pill' style='border-radius:var(--skhps-radius-sm,6px);'>sm</span><span class='base-pill' style='border-radius:var(--skhps-radius-base,10px);'>base</span><span class='base-pill' style='border-radius:var(--skhps-radius-lg,16px);'>lg</span><span class='base-pill' style='border-radius:var(--skhps-radius-pill,999px);'>pill</span></div>";
    }

    if (group.className === "space") {
      return "<div style='display:grid;gap:8px;'><div style='padding:var(--skhps-space-xs,4px);border:1px solid var(--skhps-surface-border,#cbd5e1);'>xs</div><div style='padding:var(--skhps-space-md,12px);border:1px solid var(--skhps-surface-border,#cbd5e1);'>md</div><div style='padding:var(--skhps-space-xl,24px);border:1px solid var(--skhps-surface-border,#cbd5e1);'>xl</div></div>";
    }

    if (group.className === "font") {
      return "<div><strong>Font Preview</strong><p>字體、尺寸、行高會影響這段文字。</p></div>";
    }

    if (group.className === "motion") {
      return "<button type='button'>Hover transition</button>";
    }

    return "<div class='base-demo-card'><strong>Layout Preview</strong><p style='margin-bottom:0;'>container / padding / section gap</p></div>";
  }

  function cssPreviewFromInputs(editor) {
    var lines = [":root{"];

    editor.querySelectorAll("[data-css-var]").forEach(function (input) {
      lines.push("  " + input.getAttribute("data-css-var") + ": " + input.value + ";");
    });

    lines.push("}");

    return lines.join("\n");
  }

  function refreshEditorPreview(editor) {
    var pre = editor.querySelector("[data-css-preview]");
    if (pre) pre.textContent = cssPreviewFromInputs(editor);
  }

  function liveApplyInput(input) {
    var className = input.getAttribute("data-class-name");
    var property = input.getAttribute("data-property");

    setCssVar(className, property, input.value);
    setMapValue(currentMap, className, property, input.value);

    var editor = input.closest("[data-css-setting-editor]");
    if (!editor) return;

    var swatch = editor.querySelector("[data-swatch-for='" + input.getAttribute("data-css-var") + "']");
    if (swatch) swatch.style.setProperty("--base-swatch", input.value);

    refreshEditorPreview(editor);

    var status = editor.querySelector("[data-css-setting-status]");
    if (status) status.textContent = "已即時套用到本頁；尚未儲存。";
  }

  function renderControls(group, maps) {
    return group.props.map(function (p) {
      var key = p[0];
      var label = p[1];
      var type = p[2] === "color" ? "color" : "text";
      var value = getMapValue(maps.current, group.className, key);
      var def = getMapValue(maps.defaults, group.className, key) || value;
      var desc = getMapValue(maps.descriptions, group.className, key);
      var cssName = cssVarName(group.className, key);
      var swatch = type === "color"
        ? "<span class='base-swatch' data-swatch-for='" + cssName + "' style='--base-swatch:" + escapeHtml(value) + ";'></span>"
        : "<span></span>";

      return [
        "<section class='base-control-item' data-css-setting-editor data-css-setting-core='on' data-css-setting-sheet-save='on' data-css-setting-component='" + escapeHtml(group.component || group.className) + "' data-css-setting-tab-key='" + CSS_MAIN_TAB_KEY + "'>",
        "<strong title='" + escapeHtml(desc) + "'>" + escapeHtml(label) + "</strong>",
        "<input type='" + type + "' readonly data-css-var='" + cssName + "' data-class-name='" + escapeHtml(group.className) + "' data-property='" + escapeHtml(key) + "' data-default='" + escapeHtml(def) + "' value='" + escapeHtml(value) + "'>",
        swatch,
        "<p class='base-actions'>",
        "<button type='button' data-css-setting-action='edit'>編輯</button>",
        "<button type='button' data-css-setting-action='save'>儲存</button>",
        "<button type='button' data-css-setting-action='default'>恢復 default</button>",
        "</p>",
        "<p class='base-status' data-css-setting-status>預覽模式。</p>",
        "</section>"
      ].join("");
    }).join("");
  }
  function cssPreviewGroup(group, maps) {
    var lines = [":root{"];

    group.props.forEach(function (p) {
      lines.push("  " + cssVarName(group.className, p[0]) + ": " + getMapValue(maps.current, group.className, p[0]) + ";");
    });

    lines.push("}");

    return lines.join("\n");
  }

  function renderGroup(group, maps) {
    return [
      "<section class='base-editor-section' data-base-style-group='" + escapeHtml(group.className) + "'>",
      "<h2>" + escapeHtml(group.title) + "</h2>",
      "<div class='base-table-wrap'>",
      "<table class='base-table'>",
      "<thead><tr>",
      "<th class='base-col-usage'>用途 / CSS</th>",
      "<th class='base-col-demo'>演示</th>",
      "<th class='base-col-control'>控制</th>",
      "<th class='base-col-css'>目前 CSS</th>",
      "</tr></thead>",
      "<tbody><tr>",
      "<td><strong>" + escapeHtml(group.label) + "</strong><br><span class='skh-muted'>" + escapeHtml(group.desc) + "</span><p><code>" + escapeHtml(group.selector) + "</code></p></td>",
      "<td>" + renderDemo(group) + "</td>",
      "<td>",
      "<div class='base-control-grid'>" + renderControls(group, maps) + "</div>",
      "</td>",
      "<td><pre class='base-preview' data-css-preview>" + escapeHtml(cssPreviewGroup(group, maps)) + "</pre></td>",
      "</tr></tbody>",
      "</table>",
      "</div>",
      "</section>"
    ].join("");
  }

  function renderGlobalToolbar(maps) {
    return [
      "<section class='skh-section skh-surface'>",
      "<h2>儲存狀態</h2>",
      "<p class='base-save-note' id='baseSaveNote'>目前使用 CSS總表 effective values；儲存會寫回 Google Sheet。</p>",
      "</section>"
    ].join("");
  }
  function render(root, maps) {
    currentMap = clone(maps.current);
    applyMap(currentMap);

    root.innerHTML = [
      "<div class='base-editor-shell'>",
      renderGlobalToolbar(maps),
      GROUPS.map(function (group) {
        return renderGroup(group, maps);
      }).join(""),
      "</div>"
    ].join("");

    if (window.SKHPSCssSettingEditorCore && typeof window.SKHPSCssSettingEditorCore.init === "function") {
      window.SKHPSCssSettingEditorCore.init(root);
    }
  }

  function loadMaps() {
    setStatus("讀取 CSS總表 CSV 中...");

    return fetchJson("config.json")
      .then(function (config) {
        return fetch(csvUrl(config), { cache: "no-store" });
      })
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error("CSV HTTP " + res.status);
          return text;
        });
      })
      .then(function (csv) {
        var rows = parseCsv(csv);
        var maps = buildMaps(rows);
        setStatus("已套用 CSS總表 effective values。");
        return maps;
      });
  }

  function clearLocalDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("CSS Setting Style local draft clear failed:", error);
    }
  }

  function rerenderFromSheet() {
    clearLocalDraft();

    var root = el(ROOT_ID);
    if (!root) return;

    root.innerHTML = "<p class='skh-muted'>重新讀取 CSS總表中...</p>";

    loadMaps()
      .then(function (maps) {
        maps.hasLocalDraft = false;
        render(root, maps);
      })
      .catch(function (err) {
        root.innerHTML = "<pre>CSS總表 editor failed:\n" + escapeHtml(err.message || err) + "</pre>";
      });
  }

  function bind() {
    if (document.__skhpsCssSettingStyleInputBound) return;
    document.__skhpsCssSettingStyleInputBound = true;

    document.addEventListener("input", function (event) {
      var input = event.target.closest("[data-css-var]");
      if (!input) return;
      liveApplyInput(input);
    });
  }
  function boot() {
    injectCss();
    bind();

    var observer = new MutationObserver(function () {
      var root = el(ROOT_ID);
      if (!root) return;
      if (root.getAttribute(RENDERED_ATTR) === "1") return;

      root.setAttribute(RENDERED_ATTR, "1");
      root.innerHTML = "<p class='skh-muted'>讀取 CSS總表中...</p>";

      loadMaps()
        .then(function (maps) {
          render(root, maps);
        })
        .catch(function (err) {
          setStatus("載入失敗。");
          root.innerHTML = "<pre>CSS總表 editor failed:\n" + escapeHtml(err.message || err) + "</pre>";
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    var root = el(ROOT_ID);
    if (root && root.getAttribute(RENDERED_ATTR) !== "1") {
      root.setAttribute(RENDERED_ATTR, "1");
      root.innerHTML = "<p class='skh-muted'>讀取 CSS總表中...</p>";

      loadMaps()
        .then(function (maps) {
          render(root, maps);
        })
        .catch(function (err) {
          setStatus("載入失敗。");
          root.innerHTML = "<pre>CSS總表 editor failed:\n" + escapeHtml(err.message || err) + "</pre>";
        });
    }
  }

  window.SKHPSCssSettingStyleEditor = {
    boot: boot,
    rerenderFromSheet: rerenderFromSheet,
    loadMaps: loadMaps,
    csvUrl: csvUrl,
    cssMainTabKey: CSS_MAIN_TAB_KEY,
    cssMainTabGid: CSS_MAIN_TAB_GID,
    cssMainTabName: CSS_MAIN_TAB_NAME
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
