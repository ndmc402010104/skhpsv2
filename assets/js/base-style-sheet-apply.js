/*
File: skhpsv2/assets/js/base-style-sheet-apply.js
Purpose: Apply baseStyle rows from Google Sheet to the current page. This file contains no hard-coded visual theme values.
*/

(function () {
  "use strict";

  var STYLE_ID = "skhps-sheet-base-style";

  function getConfig() {
    if (window.SKHPS_CONFIG) {
      return Promise.resolve(window.SKHPS_CONFIG);
    }

    if (window.SKHPSConfig && typeof window.SKHPSConfig.getConfig === "function") {
      try {
        var maybeConfig = window.SKHPSConfig.getConfig();

        if (maybeConfig && typeof maybeConfig.then === "function") {
          return maybeConfig;
        }

        if (maybeConfig) {
          return Promise.resolve(maybeConfig);
        }
      } catch (error) {
        console.warn("SKHPSConfig.getConfig failed, fallback to config.json", error);
      }
    }

    return fetch("config.json", { cache: "no-store" }).then(function (res) {
      if (!res.ok) {
        throw new Error("config.json HTTP " + res.status);
      }
      return res.json();
    });
  }

  function getBaseStyleCsvUrl(config) {
    var sheet = config &&
      config.sheets &&
      config.sheets.cssSheets &&
      config.sheets.cssSheets.baseStyle;

    if (!sheet) {
      throw new Error("Missing config.sheets.cssSheets.baseStyle");
    }

    var gid = String(sheet.tabGid || "").trim();
    var spreadsheetId = String(config.sheets.mainSpreadsheetId || "").trim();

    if (!gid) {
      throw new Error("Missing baseStyle.tabGid");
    }

    if (!spreadsheetId) {
      throw new Error("Missing sheets.mainSpreadsheetId");
    }

    return "https://docs.google.com/spreadsheets/d/" +
      encodeURIComponent(spreadsheetId) +
      "/gviz/tq?tqx=out:csv&gid=" +
      encodeURIComponent(gid) +
      "&ts=" +
      Date.now();
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var next = text[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cell += '"';
        i++;
        continue;
      }

      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (ch === "," && !inQuotes) {
        row.push(cell);
        cell = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") {
          i++;
        }

        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
        continue;
      }

      cell += ch;
    }

    if (cell.length || row.length) {
      row.push(cell);
      rows.push(row);
    }

    return rows;
  }

  function normalizeRows(csvRows) {
    if (!csvRows.length) {
      return [];
    }

    var header = csvRows[0].map(function (h) {
      return String(h || "").trim();
    });

    function indexOf(name) {
      return header.indexOf(name);
    }

    var idx = {
      component: indexOf("component"),
      className: indexOf("className"),
      property: indexOf("property"),
      value: indexOf("value"),
      description: indexOf("description"),
      updatedAt: indexOf("updatedAt")
    };

    return csvRows.slice(1).map(function (r) {
      return {
        component: String(r[idx.component] || "").trim(),
        className: String(r[idx.className] || "").trim(),
        property: String(r[idx.property] || "").trim(),
        value: String(r[idx.value] || "").trim(),
        description: String(r[idx.description] || "").trim(),
        updatedAt: String(r[idx.updatedAt] || "").trim()
      };
    }).filter(function (r) {
      return r.component && r.className && r.property;
    });
  }

  function isDatedValue(updatedAt) {
    if (!updatedAt) {
      return false;
    }

    if (String(updatedAt).trim().toLowerCase() === "default") {
      return false;
    }

    return true;
  }

  function pickLatestRows(rows) {
    var map = new Map();

    rows.forEach(function (row, order) {
      if (row.component !== "base") {
        return;
      }

      var key = row.component + "||" + row.className + "||" + row.property;
      var current = map.get(key);

      var candidateRank = isDatedValue(row.updatedAt) ? 2 : 1;
      var currentRank = current && isDatedValue(current.updatedAt) ? 2 : 1;

      if (!current) {
        row.__order = order;
        map.set(key, row);
        return;
      }

      if (candidateRank > currentRank) {
        row.__order = order;
        map.set(key, row);
        return;
      }

      if (candidateRank === currentRank) {
        var a = String(current.updatedAt || "");
        var b = String(row.updatedAt || "");

        if (b >= a) {
          row.__order = order;
          map.set(key, row);
        }
      }
    });

    return Array.from(map.values()).sort(function (a, b) {
      return (a.__order || 0) - (b.__order || 0);
    });
  }

  function buildCss(rows) {
    var grouped = new Map();

    rows.forEach(function (row) {
      if (!grouped.has(row.className)) {
        grouped.set(row.className, []);
      }

      grouped.get(row.className).push(row);
    });

    var css = [];

    grouped.forEach(function (items, selector) {
      css.push(selector + " {");

      items.forEach(function (row) {
        css.push("  " + row.property + ": " + row.value + ";");
      });

      css.push("}");
      css.push("");
    });

    return css.join("\n");
  }

  function applyCss(css) {
    var style = document.getElementById(STYLE_ID);

    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      style.setAttribute("data-source", "Google Sheet baseStyle");
      document.head.appendChild(style);
    }

    style.textContent = css;
  }

  function setStatus(message) {
    var el = document.querySelector("[data-skhps-base-style-status]");

    if (el) {
      el.textContent = message;
    }
  }

  function applyBaseStyleFromSheet() {
    setStatus("baseStyle loading from Sheet...");

    return getConfig()
      .then(function (config) {
        return fetch(getBaseStyleCsvUrl(config), { cache: "no-store" });
      })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("baseStyle CSV HTTP " + res.status);
        }

        return res.text();
      })
      .then(function (csvText) {
        var rows = normalizeRows(parseCsv(csvText));
        var latestRows = pickLatestRows(rows);
        var css = buildCss(latestRows);

        applyCss(css);
        setStatus("baseStyle applied from Sheet (" + latestRows.length + " rules)");
      })
      .catch(function (error) {
        setStatus("baseStyle failed: " + String(error.message || error));
        throw error;
      });
  }

  window.SKHPSApplyBaseStyleFromSheet = applyBaseStyleFromSheet;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBaseStyleFromSheet);
  } else {
    applyBaseStyleFromSheet();
  }
})();