/**
 * 檔案位置：skhpsv2/apps-script/CssSheetWriteApi.gs
 * 時間戳記：2026-06-11 UTC+8
 * 用途：CSS Setting 寫回 Google Sheet；固定寫入 gid 0 / CSS總表；同一組 component + className + property 採 upsert，不再無限 append。
 * TODO(拆除 Sheet 殭屍路徑，2026-07-03)：Google Sheet 已 retire，正式存檔路徑是 Cloudflare Worker → Supabase CssRegistryRule。
 * 本檔只剩直接打 GAS webApp 的 saveCssSheetRows 會碰到；之後整檔拆除（連同 Code.gs 白名單與 handler）並重新部署 GAS。
 */

var CSS_MAIN_TAB_KEY_ = 'cssMain';
var CSS_MAIN_TAB_NAME_ = 'CSS總表';
var CSS_MAIN_TAB_GID_ = '0';

function normalizeCssSheetTabKeyForWrite_(tabKey) {
  tabKey = String(tabKey || '').trim();

  var legacyMap = {
    baseStyle: CSS_MAIN_TAB_KEY_,
    tokenStyle: CSS_MAIN_TAB_KEY_,
    layoutStyle: CSS_MAIN_TAB_KEY_,
    headerStyle: CSS_MAIN_TAB_KEY_,
    footerStyle: CSS_MAIN_TAB_KEY_,
    buttonStyle: CSS_MAIN_TAB_KEY_,
    formStyle: CSS_MAIN_TAB_KEY_
  };

  if (!tabKey) return CSS_MAIN_TAB_KEY_;
  return legacyMap[tabKey] || tabKey;
}

function getCssSheetConfigForWrite_(tabKey) {
  tabKey = normalizeCssSheetTabKeyForWrite_(tabKey);

  var config = typeof getServerConfig_ === 'function' ? getServerConfig_() : null;
  var fromConfig =
    config &&
    config.sheets &&
    config.sheets.cssSheets &&
    config.sheets.cssSheets[tabKey];

  if (fromConfig) {
    return {
      key: fromConfig.key || tabKey,
      title: fromConfig.title || CSS_MAIN_TAB_NAME_,
      tabName: fromConfig.tabName || fromConfig.title || CSS_MAIN_TAB_NAME_,
      tabGid: String(fromConfig.tabGid === undefined || fromConfig.tabGid === null ? CSS_MAIN_TAB_GID_ : fromConfig.tabGid)
    };
  }

  if (tabKey === CSS_MAIN_TAB_KEY_) {
    return {
      key: CSS_MAIN_TAB_KEY_,
      title: CSS_MAIN_TAB_NAME_,
      tabName: CSS_MAIN_TAB_NAME_,
      tabGid: CSS_MAIN_TAB_GID_
    };
  }

  return null;
}

function saveCssSheetRows_(payload) {
  payload = payload || {};

  var originalTabKey = String(payload.tabKey || payload.sheetKey || '').trim();
  var tabKey = normalizeCssSheetTabKeyForWrite_(originalTabKey);
  var rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (!tabKey) throw new Error('Missing tabKey');
  if (!rows.length) throw new Error('Missing rows');

  var sheetConfig = getCssSheetConfigForWrite_(tabKey);

  if (!sheetConfig) {
    throw new Error('Unknown css sheet tabKey: ' + tabKey);
  }

  if (!sheetConfig.tabGid && String(sheetConfig.tabGid) !== '0') {
    throw new Error('tabGid is not configured: ' + tabKey);
  }

  var ss = SpreadsheetApp.openById(getSpreadsheetId_());
  var sheet = getSheetByGidForCssWrite_(ss, String(sheetConfig.tabGid));

  if (!sheet) {
    throw new Error('Sheet not found by tabGid: ' + sheetConfig.tabGid);
  }

  ensureCssMainSheetNameForWrite_(ss, sheet, sheetConfig.tabName || CSS_MAIN_TAB_NAME_);
  ensureCssSheetWriteHeader_(sheet);

  var updatedAt = Utilities.formatDate(
    new Date(),
    'Asia/Taipei',
    'yyyy/MM/dd HH:mm:ss'
  );

  var values = rows.map(function(row) {
    return {
      component: String(row.component || '').trim(),
      className: String(row.className || '').trim(),
      property: String(row.property || '').trim(),
      value: String(row.value || '').trim(),
      description: String(row.description || '').trim(),
      updatedAt: String(row.updatedAt || '').trim().toLowerCase() === 'default' ? 'default' : updatedAt
    };
  }).filter(function(row) {
    return row.component && row.className && row.property && row.value !== '';
  });

  if (!values.length) throw new Error('No valid rows');

  var result = upsertCssSheetRowsByKey_(sheet, values);

  return {
    ok: true,
    action: 'saveCssSheetRows',
    mode: 'upsert',
    tabKey: tabKey,
    originalTabKey: originalTabKey || tabKey,
    sheetName: sheet.getName(),
    tabGid: String(sheet.getSheetId()),
    insertedRows: result.insertedRows,
    updatedRows: result.updatedRows,
    appendedRows: result.insertedRows,
    touchedRows: values.length,
    updatedAt: updatedAt
  };
}

/**
 * Upsert key:
 *   component + className + property
 *
 * 規則：
 * - 寫入 default row 時：更新最後一筆 default row。
 * - 寫入 override row 時：更新最後一筆非 default row。
 * - 寫入 override row 但只有 default row：保留 default，另外新增一筆 override row。
 * - 若完全沒有：新增一筆。
 *
 * 這樣可以保留 DEFAULT 種子資料，同時避免同一設定一直無限 append。
 */
function upsertCssSheetRowsByKey_(sheet, values) {
  var lastRow = sheet.getLastRow();
  var columns = getCssSheetWriteColumns_(sheet);
  var index = {};

  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    existing.forEach(function(row, i) {
      var component = String(row[columns.component] || '').trim();
      var className = String(row[columns.className] || '').trim();
      var property = String(row[columns.property] || '').trim();
      var updatedAt = String(row[columns.updatedAt] || '').trim().toLowerCase();

      if (!component || !className || !property) return;

      var key = cssSheetUpsertKey_(component, className, property);
      index[key] = index[key] || { defaultRowNumber: 0, overrideRowNumber: 0 };

      var rowNumber = i + 2;

      if (updatedAt === 'default') {
        index[key].defaultRowNumber = rowNumber;
      } else {
        // 取最後一筆 override；舊的重複列不刪，之後可手動清，但不再新增更多。
        index[key].overrideRowNumber = rowNumber;
      }
    });
  }

  var toAppend = [];
  var updatedRows = 0;

  values.forEach(function(valueRow) {
    var key = cssSheetUpsertKey_(valueRow.component, valueRow.className, valueRow.property);
    var hit = index[key];
    var isDefaultWrite = String(valueRow.updatedAt || '').trim().toLowerCase() === 'default';
    var targetRow = 0;

    if (hit) {
      if (isDefaultWrite && hit.defaultRowNumber) {
        targetRow = hit.defaultRowNumber;
      } else if (!isDefaultWrite && hit.overrideRowNumber) {
        targetRow = hit.overrideRowNumber;
      }
    }

    if (targetRow) {
      writeCssSheetValueRow_(sheet, targetRow, valueRow, columns);
      updatedRows += 1;
    } else {
      toAppend.push(valueRow);
    }
  });

  if (toAppend.length) {
    appendCssSheetValueRows_(sheet, toAppend, columns);
  }

  return {
    insertedRows: toAppend.length,
    updatedRows: updatedRows
  };
}

function cssSheetUpsertKey_(component, className, property) {
  return [
    String(component || '').trim(),
    String(className || '').trim(),
    String(property || '').trim()
  ].join('||');
}

function ensureCssSheetWriteHeader_(sheet) {
  var header = [
    'component',
    'className',
    'property',
    'value',
    'description',
    'updatedAt'
  ];

  var range = sheet.getRange(1, 1, 1, header.length);
  var current = range.getValues()[0];

  var needWrite = false;

  for (var i = 0; i < header.length; i++) {
    if (String(current[i] || '').trim() !== header[i]) {
      needWrite = true;
      break;
    }
  }

  if (needWrite) {
    range.setValues([header]);
  }
}

function getCssSheetWriteColumns_(sheet) {
  var required = [
    'component',
    'className',
    'property',
    'value',
    'description',
    'updatedAt'
  ];

  var lastColumn = Math.max(sheet.getLastColumn(), required.length);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function(header) {
      return String(header || '').trim();
    });

  var missing = required.filter(function(name) {
    return headers.indexOf(name) === -1;
  });

  if (missing.length) {
    sheet.getRange(1, lastColumn + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }

  return {
    component: headers.indexOf('component'),
    className: headers.indexOf('className'),
    property: headers.indexOf('property'),
    value: headers.indexOf('value'),
    description: headers.indexOf('description'),
    updatedAt: headers.indexOf('updatedAt'),
    headers: headers
  };
}

function writeCssSheetValueRow_(sheet, rowNumber, valueRow, columns) {
  Object.keys(valueRow).forEach(function(key) {
    var columnIndex = columns[key];

    if (columnIndex === undefined || columnIndex < 0) {
      throw new Error('CSS sheet header missing: ' + key);
    }

    sheet.getRange(rowNumber, columnIndex + 1).setValue(valueRow[key]);
  });
}

function appendCssSheetValueRows_(sheet, valueRows, columns) {
  var headers = columns.headers || [];
  var startRow = sheet.getLastRow() + 1;
  var output = valueRows.map(function(valueRow) {
    return headers.map(function(header) {
      if (Object.prototype.hasOwnProperty.call(valueRow, header)) {
        return valueRow[header];
      }

      return '';
    });
  });

  sheet.getRange(startRow, 1, output.length, headers.length).setValues(output);
}

function ensureCssMainSheetNameForWrite_(ss, sheet, expectedName) {
  expectedName = String(expectedName || CSS_MAIN_TAB_NAME_).trim();

  if (!expectedName || sheet.getName() === expectedName) {
    return;
  }

  var existing = ss.getSheetByName(expectedName);

  if (existing && existing.getSheetId() !== sheet.getSheetId()) {
    throw new Error(
      'Cannot rename gid ' + sheet.getSheetId() + ' to ' + expectedName +
      ': another sheet with this name already exists. Please remove/rename the duplicate first.'
    );
  }

  sheet.setName(expectedName);
}

function getSheetByGidForCssWrite_(ss, gid) {
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === String(gid)) {
      return sheets[i];
    }
  }

  return null;
}
