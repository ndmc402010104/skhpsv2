/*
檔案位置：skhpsv2/assets/js/css-sheet-runtime.js
時間戳記：2026-06-09 20:40 UTC+8
用途：統一 CSS Sheet runtime；從 config.json 的 sheets.cssSheets 動態讀取所有 CSS Sheet，優先走 Apps Script 後端，失敗時 fallback 直接讀 Google Sheet CSV，並把 rows 轉成頁面可用 CSS。
*/

(function () {
  "use strict";

  var STYLE_ID = "skhps-css-sheet-runtime";
  var STATUS_ATTR = "data-css-sheet-runtime-status";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function setStatus(message, ok) {
    var el = document.querySelector("[" + STATUS_ATTR + "]");
    if (!el) return;

    el.textContent = message;
    el.setAttribute("data-ok", ok ? "true" : "false");
  }

  function getConfig() {
    if (window.SKHPSConfig && typeof window.SKHPSConfig.loadConfig === "function") {
      return window.SKHPSConfig.loadConfig();
    }

    if (window.SKHPS_CONFIG) {
      return Promise.resolve(window.SKHPS_CONFIG);
    }

    return fetch("config.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw new Error("config.json HTTP " + res.status);
      return res.json();
    });
  }

  function getCssSheets(config) {
    return config &&
      config.sheets &&
      config.sheets.cssSheets
      ? config.sheets.cssSheets
      : {};
  }

  function getEnabledSheetKeys(config) {
    var cssSheets = getCssSheets(config);

    return Object.keys(cssSheets).filter(function (key) {
      var sheet = cssSheets[key] || {};
      return sheet.enabled !== false;
    });
  }

  function csvUrl(config, sheetKey) {
    var spreadsheetId = config &&
      config.sheets &&
      config.sheets.mainSpreadsheetId;

    var sheet = getCssSheets(config)[sheetKey];

    if (!spreadsheetId) {
      throw new Error("config.json missing sheets.mainSpreadsheetId");
    }

    if (!sheet || sheet.tabGid === undefined || sheet.tabGid === null || sheet.tabGid === "") {
      throw new Error("config.json missing sheets.cssSheets." + sheetKey + ".tabGid");
    }

    return "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(spreadsheetId) +
      "/export?format=csv&gid=" +
      encodeURIComponent(sheet.tabGid) +
      "&ts=" +
      Date.now();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var quote = false;

    for (var i = 0; i < text.length; i += 1) {
      var c = text[i];
      var n = text[i + 1];

      if (quote) {
        if (c === '"' && n === '"') {
          cell += '"';
          i += 1;
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

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return r.some(function (x) {
        return String(x || "").trim() !== "";
      });
    });
  }

  function rowsFromCsv(sheetKey, csvRows) {
    var header = csvRows[0] || [];
    var idx = {};

    header.forEach(function (h, i) {
      idx[String(h || "").trim()] = i;
    });

    return csvRows.slice(1).map(function (row, order) {
      return {
        sheetKey: sheetKey,
        component: String(row[idx.component] || "").trim(),
        className: String(row[idx.className] || "").trim(),
        property: String(row[idx.property] || "").trim(),
        value: String(row[idx.value] || "").trim(),
        description: String(row[idx.description] || "").trim(),
        updatedAt: String(row[idx.updatedAt] || "").trim(),
        __order: order
      };
    }).filter(function (row) {
      return row.className && row.property && row.value;
    });
  }

  function normalizeBackendRows(response, sheetKeys) {
    if (!response) return [];

    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response.rows)) {
      return response.rows;
    }

    if (Array.isArray(response.data)) {
      return response.data;
    }

    var out = [];

    sheetKeys.forEach(function (sheetKey) {
      var section = response[sheetKey];

      if (!section) return;

      if (Array.isArray(section)) {
        section.forEach(function (row) {
          if (!row.sheetKey) row.sheetKey = sheetKey;
          out.push(row);
        });
        return;
      }

      if (Array.isArray(section.rows)) {
        section.rows.forEach(function (row) {
          if (!row.sheetKey) row.sheetKey = sheetKey;
          out.push(row);
        });
      }
    });

    return out;
  }

  function loadRowsFromBackend(config, sheetKeys) {
    if (!window.SKHPSBackend || typeof window.SKHPSBackend.call !== "function") {
      return Promise.reject(new Error("SKHPSBackend.call not available"));
    }

    /*
      後端理想支援：
      action = getCssSheetRuntime 或 getCssSheetPreview
      payload = {
        sheetKeys: ["baseStyle", "tokenStyle", ...],
        sheets: ["baseStyle", "tokenStyle", ...]
      }

      這裡先試 getCssSheetRuntime；如果後端還沒有，再試 getCssSheetPreview。
    */
    return window.SKHPSBackend.call("getCssSheetRuntime", {
      sheetKeys: sheetKeys,
      sheets: sheetKeys
    }).then(function (res) {
      if (!res || res.ok === false) {
        throw new Error(res && (res.message || res.error) ? (res.message || res.error) : "getCssSheetRuntime failed");
      }

      var rows = normalizeBackendRows(res, sheetKeys);
      if (!rows.length) {
        throw new Error("getCssSheetRuntime returned no rows");
      }

      return rows;
    }).catch(function () {
      return window.SKHPSBackend.call("getCssSheetPreview", {
        sheetKeys: sheetKeys,
        sheets: sheetKeys
      }).then(function (res) {
        if (!res || res.ok === false) {
          throw new Error(res && (res.message || res.error) ? (res.message || res.error) : "getCssSheetPreview failed");
        }

        var rows = normalizeBackendRows(res, sheetKeys);
        if (!rows.length) {
          throw new Error("getCssSheetPreview returned no rows");
        }

        return rows;
      });
    });
  }

  function loadRowsFromCsv(config, sheetKeys) {
    return Promise.all(sheetKeys.map(function (sheetKey) {
      return fetch(csvUrl(config, sheetKey), { cache: "no-store" })
        .then(function (res) {
          return res.text().then(function (text) {
            if (!res.ok) {
              throw new Error(sheetKey + " CSV HTTP " + res.status);
            }

            return rowsFromCsv(sheetKey, parseCsv(text));
          });
        });
    })).then(function (groups) {
      return groups.reduce(function (acc, rows) {
        return acc.concat(rows);
      }, []);
    });
  }

  function normalizeSelector(className, component) {
    var raw = String(className || "").trim();

    if (!raw && component) {
      raw = String(component || "").trim();
    }

    if (!raw) return "";

    if (
      raw === "body" ||
      raw === "html" ||
      raw === ":root" ||
      raw.indexOf(".") === 0 ||
      raw.indexOf("#") === 0 ||
      raw.indexOf("[") === 0 ||
      raw.indexOf(":") === 0
    ) {
      return raw;
    }

    return "." + raw;
  }

  function isDated(updatedAt) {
    var raw = String(updatedAt || "").trim().toLowerCase();
    return raw && raw !== "default";
  }

  function rowScore(row, index) {
    var updatedAt = String(row.updatedAt || "").trim();

    if (!isDated(updatedAt)) {
      return {
        rank: 1,
        time: 0,
        index: index
      };
    }

    var parsed = new Date(updatedAt.replace(/\//g, "-")).getTime();

    return {
      rank: 2,
      time: isNaN(parsed) ? 1 : parsed,
      index: index
    };
  }

  function compareScore(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.time !== b.time) return a.time - b.time;
    return a.index - b.index;
  }

  function pickLatestRows(rows) {
    var map = {};

    rows.forEach(function (row, index) {
      var selector = normalizeSelector(row.className, row.component);
      var property = String(row.property || "").trim();
      var value = String(row.value || "").trim();

      if (!selector || !property || !value) return;

      var key = selector + "||" + property;
      var candidate = {
        selector: selector,
        property: property,
        value: value,
        sheetKey: row.sheetKey || "",
        component: row.component || "",
        updatedAt: row.updatedAt || "",
        score: rowScore(row, index)
      };

      if (!map[key] || compareScore(map[key].score, candidate.score) <= 0) {
        map[key] = candidate;
      }
    });

    return Object.keys(map).map(function (key) {
      return map[key];
    });
  }

  function buildCss(rows) {
    var latest = pickLatestRows(rows);
    var grouped = {};

    latest.forEach(function (row) {
      grouped[row.selector] = grouped[row.selector] || [];
      grouped[row.selector].push(row);
    });

    var css = [
      "/* skhps css sheet runtime generated */"
    ];

    Object.keys(grouped).forEach(function (selector) {
      css.push("");
      css.push(selector + " {");

      grouped[selector].forEach(function (row) {
        css.push("  " + row.property + ": " + row.value + ";");
      });

      css.push("}");
    });

    return {
      cssText: css.join("\n"),
      latestRows: latest
    };
  }

  function injectCss(cssText) {
    var style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-source", "css-sheet-runtime");
      document.head.appendChild(style);
    }

    style.textContent = cssText || "";
  }

  function load() {
    return getConfig().then(function (config) {
      var sheetKeys = getEnabledSheetKeys(config);

      if (!sheetKeys.length) {
        throw new Error("config.json sheets.cssSheets is empty");
      }

      setStatus("CSS Sheet：讀取中（" + sheetKeys.length + " 張）", false);

      return loadRowsFromBackend(config, sheetKeys)
        .then(function (rows) {
          return {
            source: "backend",
            config: config,
            sheetKeys: sheetKeys,
            rows: rows
          };
        })
        .catch(function (backendError) {
          console.warn("CSS Sheet backend failed, fallback to CSV:", backendError);

          return loadRowsFromCsv(config, sheetKeys).then(function (rows) {
            return {
              source: "csv",
              config: config,
              sheetKeys: sheetKeys,
              rows: rows,
              backendError: backendError
            };
          });
        });
    }).then(function (result) {
      var built = buildCss(result.rows);

      injectCss(built.cssText);

      window.SKHPSCssSheetRuntime = {
        source: result.source,
        sheetKeys: result.sheetKeys,
        rows: result.rows,
        latestRows: built.latestRows,
        cssText: built.cssText,
        reload: load
      };

      setStatus(
        "CSS Sheet：已套用 " +
        result.sheetKeys.length +
        " 張 / " +
        built.latestRows.length +
        " 組樣式（" +
        result.source +
        "）",
        true
      );

      document.dispatchEvent(new CustomEvent("skhps-css-sheet-runtime-ready", {
        detail: window.SKHPSCssSheetRuntime
      }));

      return window.SKHPSCssSheetRuntime;
    }).catch(function (error) {
      console.error("CSS Sheet runtime failed:", error);
      setStatus("CSS Sheet：載入失敗：" + (error.message || String(error)), false);
      throw error;
    });
  }

  ready(function () {
    load().catch(function () {});
  });

  window.SKHPSCssSheetRuntimeLoader = {
    load: load
  };
})();
