/*
檔案位置：skhpsv2/assets/js/footer-style-editor.js
時間戳記：2026-06-09 19:00 UTC+8
用途：Footer Style Editor；只產生 Footer 欄位，編輯狀態交給 css-setting-editor-core.js，儲存交給 css-setting-sheet-save.js。
*/

(function () {
  "use strict";

  var ROOT_ID = "footerStyleEditorRoot";
  var STATUS_ID = "footerStyleEditorStatus";
  var RENDERED_ATTR = "data-css-setting-footer-editor-rendered";

  var COMPONENT = "footer";
  var TAB_KEY = "footerStyle";

  var FIELDS = [
    ["Footer 背景", ".skhps-footer", "background", "#ffffff", "footer 背景色"],
    ["Footer 文字顏色", ".skhps-footer", "color", "#64748b", "footer 主要文字顏色"],
    ["Footer 上框線", ".skhps-footer", "border-top", "1px solid #cbd5e1", "footer 與頁面內容之間的分隔線"],
    ["Footer 內距", ".skhps-footer", "padding", "12px 16px", "footer 內距"],
    ["Footer 字體大小", ".skhps-footer", "font-size", "13px", "footer 字體大小"],
    ["Footer 對齊", ".skhps-footer", "text-align", "center", "footer 文字對齊"]
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function setStatus(message) {
    var target = el(STATUS_ID);
    if (target) target.textContent = message;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fetchJson(path) {
    return fetch(path, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error(path + " HTTP " + res.status);
      return res.json();
    });
  }

  function csvUrl(config) {
    var id = config && config.sheets && config.sheets.mainSpreadsheetId;
    var tab = config && config.sheets && config.sheets.cssSheets && config.sheets.cssSheets[TAB_KEY];

    if (!id) throw new Error("config.json missing sheets.mainSpreadsheetId");
    if (!tab || tab.tabGid === undefined || tab.tabGid === null || tab.tabGid === "") {
      throw new Error("config.json missing sheets.cssSheets." + TAB_KEY + ".tabGid");
    }

    return "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(id) +
      "/export?format=csv&gid=" +
      encodeURIComponent(tab.tabGid);
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

  function buildValueMap(rows) {
    var values = {};
    var header = rows[0] || [];
    var idx = {};

    header.forEach(function (h, i) {
      idx[String(h || "").trim()] = i;
    });

    rows.slice(1).forEach(function (row) {
      var component = String(row[idx.component] || "").trim();
      var className = String(row[idx.className] || "").trim();
      var property = String(row[idx.property] || "").trim();
      var value = String(row[idx.value] || "").trim();
      var updatedAt = String(row[idx.updatedAt] || "").trim();

      if (component !== COMPONENT || !className || !property) return;

      var key = className + "|" + property;
      var score = updatedAt.toLowerCase() === "default" ? -1 : parseDate(updatedAt);

      if (!values[key] || score >= values[key].score) {
        values[key] = { value: value, score: score };
      }
    });

    return values;
  }

  function getValue(values, className, property, fallback) {
    var key = className + "|" + property;
    return values[key] && values[key].value ? values[key].value : fallback;
  }

  function renderRows(values) {
    return FIELDS.map(function (field) {
      var label = field[0];
      var className = field[1];
      var property = field[2];
      var def = field[3];
      var desc = field[4];
      var value = getValue(values, className, property, def);

      return [
        "<tr>",
        "<td><strong title='" + escapeHtml(desc) + "'>" + escapeHtml(label) + "</strong><br><code>" + escapeHtml(className) + "</code></td>",
        "<td><code>" + escapeHtml(property) + "</code></td>",
        "<td>",
        "<input type='text' readonly ",
        "data-class-name='" + escapeHtml(className) + "' ",
        "data-property='" + escapeHtml(property) + "' ",
        "data-default='" + escapeHtml(def) + "' ",
        "value='" + escapeHtml(value) + "'>",
        "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function render(root, values) {
    root.innerHTML = [
      "<section data-css-setting-editor data-css-setting-core='on' data-css-setting-sheet-save='on' data-css-setting-component='" + COMPONENT + "' data-css-setting-tab-key='" + TAB_KEY + "'>",
      "<h3>Footer 欄位</h3>",
      "<p data-css-setting-status>已載入 footerStyle。按「編輯」後可修改。</p>",
      "<table>",
      "<thead><tr><th>項目</th><th>CSS property</th><th>值</th></tr></thead>",
      "<tbody>",
      renderRows(values),
      "</tbody>",
      "</table>",
      "<p>",
      "<button type='button' data-css-setting-action='edit'>編輯</button> ",
      "<button type='button' data-css-setting-action='save'>儲存</button> ",
      "<button type='button' data-css-setting-action='default'>恢復 default</button> ",
      "<button type='button' data-css-setting-action='reload-sheet'>回到 Sheet 值</button>",
      "</p>",
      "</section>"
    ].join("");

    if (window.SKHPSCssSettingEditorCore && typeof window.SKHPSCssSettingEditorCore.init === "function") {
      window.SKHPSCssSettingEditorCore.init(root);
    }
  }

  function loadValues() {
    setStatus("讀取 footerStyle CSV 中...");

    return fetchJson("config.json")
      .then(function (config) {
        return fetch(csvUrl(config), { cache: "no-store" });
      })
      .then(function (res) {
        return res.text().then(function (text) {
          if (!res.ok) throw new Error("footerStyle CSV HTTP " + res.status);
          return text;
        });
      })
      .then(function (csv) {
        setStatus("footerStyle 已載入。");
        return buildValueMap(parseCsv(csv));
      });
  }

  function boot() {
    var root = el(ROOT_ID);
    if (!root) return;
    if (root.getAttribute(RENDERED_ATTR) === "1") return;

    root.setAttribute(RENDERED_ATTR, "1");
    root.innerHTML = "<p>讀取 footerStyle 中...</p>";

    loadValues()
      .then(function (values) {
        render(root, values);
      })
      .catch(function (error) {
        setStatus("footerStyle 載入失敗。");
        root.innerHTML = "<pre>footerStyle editor failed:\n" + escapeHtml(error.message || error) + "</pre>";
      });
  }

  function init() {
    boot();
  }

  window.SKHPSFooterStyleEditor = {
    init: init
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
