/**
 * 檔案：ExternalApps.gs
 * 用途：skhpsv2 外部專案報到 / 清單 / 啟用管理
 *
 * Sheet：外部專案
 * 欄位：
 * 專案ID、環境、專案名稱、入口網址、顯示位置、顯示群組、排序、啟用、版本、最後報到時間、報到次數
 *
 * 規則：
 * - 唯一鍵 = 專案ID + 環境
 * - 第一次看到 專案ID + 環境：新增，啟用 = FALSE
 * - 再次看到 專案ID + 環境：更新名片資料，但不動啟用
 * - 啟用只能由 setExternalAppActive 修改
 */

const SKHPS_EXTERNAL_APPS_SHEET_NAME = '外部專案';

const SKHPS_EXTERNAL_APPS_HEADERS = [
  '專案ID',
  '環境',
  '專案名稱',
  '入口網址',
  '顯示位置',
  '顯示群組',
  '排序',
  '啟用',
  '版本',
  '最後報到時間',
  '報到次數'
];

function registerExternalApp(payload) {
  payload = payload || {};

  const app = normalizeExternalAppPayload_(payload);
  const now = new Date();

  if (!app.appId) {
    return {
      ok: false,
      message: '缺少專案ID'
    };
  }

  if (!app.env) {
    return {
      ok: false,
      message: '缺少環境'
    };
  }

  if (!app.title) {
    return {
      ok: false,
      message: '缺少專案名稱'
    };
  }

  if (!app.href) {
    return {
      ok: false,
      message: '缺少入口網址'
    };
  }

  const sheet = getExternalAppsSheet_();
  const table = readExternalAppsTable_(sheet);

  const found = table.rows.find(function (row) {
    return String(row['專案ID'] || '').trim() === app.appId &&
      String(row['環境'] || '').trim() === app.env;
  });

  if (!found) {
    sheet.appendRow([
      app.appId,
      app.env,
      app.title,
      app.href,
      app.appType,
      app.group,
      app.order,
      false,
      app.version,
      now,
      1
    ]);

    return {
      ok: true,
      status: 'created',
      appId: app.appId,
      env: app.env,
      active: false,
      message: '外部專案第一次報到，已建立為未啟用'
    };
  }

  const currentActive = toBoolean_(found['啟用']);
  const currentCount = Number(found['報到次數'] || 0) || 0;

  updateExternalAppRow_(sheet, found.rowIndex, {
    '專案名稱': app.title,
    '入口網址': app.href,
    '顯示位置': app.appType,
    '顯示群組': app.group,
    '排序': app.order,
    // 重要：啟用不動，避免覆蓋後台設定
    '版本': app.version,
    '最後報到時間': now,
    '報到次數': currentCount + 1
  });

  return {
    ok: true,
    status: 'updated',
    appId: app.appId,
    env: app.env,
    active: currentActive,
    message: '外部專案已存在，已更新報到資訊，啟用狀態維持不變'
  };
}

function listExternalApps(payload) {
  payload = payload || {};

  const activeOnly = payload.activeOnly === true;
  const appType = String(payload.appType || '').trim();
  const env = String(payload.env || payload.runtime || '').trim();

  const sheet = getExternalAppsSheet_();
  const table = readExternalAppsTable_(sheet);

  let apps = table.rows.map(function (row) {
    return {
      appId: String(row['專案ID'] || '').trim(),
      env: String(row['環境'] || '').trim(),
      title: String(row['專案名稱'] || '').trim(),
      href: String(row['入口網址'] || '').trim(),
      appType: String(row['顯示位置'] || '').trim() || '前台',
      group: String(row['顯示群組'] || '').trim(),
      order: Number(row['排序'] || 9999) || 9999,
      active: toBoolean_(row['啟用']),
      version: String(row['版本'] || '').trim(),
      lastSeenAt: row['最後報到時間'] || '',
      registerCount: Number(row['報到次數'] || 0) || 0
    };
  }).filter(function (app) {
    return app.appId && app.env && app.title && app.href;
  });

  if (activeOnly) {
    apps = apps.filter(function (app) {
      return app.active === true;
    });
  }

  if (appType) {
    apps = apps.filter(function (app) {
      return app.appType === appType;
    });
  }

  if (env) {
    apps = apps.filter(function (app) {
      return app.env === env;
    });
  }

  apps.sort(function (a, b) {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title, 'zh-Hant');
  });

  return {
    ok: true,
    apps: apps,
    count: apps.length
  };
}

function setExternalAppActive(payload) {
  payload = payload || {};

  const appId = String(payload.appId || payload['專案ID'] || '').trim();
  const env = String(payload.env || payload['環境'] || '').trim();
  const active = payload.active === true || payload.active === 'TRUE' || payload.active === 'true';

  if (!appId) {
    return {
      ok: false,
      message: '缺少專案ID'
    };
  }

  if (!env) {
    return {
      ok: false,
      message: '缺少環境'
    };
  }

  const sheet = getExternalAppsSheet_();
  const table = readExternalAppsTable_(sheet);

  const found = table.rows.find(function (row) {
    return String(row['專案ID'] || '').trim() === appId &&
      String(row['環境'] || '').trim() === env;
  });

  if (!found) {
    return {
      ok: false,
      message: '找不到外部專案：' + appId + ' / ' + env
    };
  }

  updateExternalAppRow_(sheet, found.rowIndex, {
    '啟用': active
  });

  return {
    ok: true,
    appId: appId,
    env: env,
    active: active,
    message: active ? '已啟用外部專案' : '已停用外部專案'
  };
}

/**
 * ===== helpers =====
 */

function normalizeExternalAppPayload_(payload) {
  const config = payload.config || payload.appConfig || payload || {};

  return {
    appId: String(
      config.appId ||
      config.id ||
      payload.appId ||
      payload.id ||
      ''
    ).trim(),

    env: String(
      config.env ||
      payload.env ||
      payload.runtime ||
      payload.requestedRuntime ||
      'prod'
    ).trim(),

    title: String(
      config.title ||
      config.name ||
      payload.title ||
      ''
    ).trim(),

    href: String(
      config.href ||
      config.url ||
      payload.href ||
      payload.url ||
      ''
    ).trim(),

    appType: String(
      config.appType ||
      config.displayLocation ||
      payload.appType ||
      payload.displayLocation ||
      '前台'
    ).trim(),

    group: String(
      config.group ||
      payload.group ||
      ''
    ).trim(),

    order: Number(
      config.order ||
      payload.order ||
      9999
    ) || 9999,

    version: String(
      config.version ||
      payload.version ||
      ''
    ).trim()
  };
}

function getExternalAppsSheet_() {
  const spreadsheetId = getSpreadsheetId_();

  if (!spreadsheetId) {
    throw new Error('CONFIG_MISSING_MAIN_SPREADSHEET_ID');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(SKHPS_EXTERNAL_APPS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SKHPS_EXTERNAL_APPS_SHEET_NAME);
  }

  ensureExternalAppsHeaders_(sheet);
  return sheet;
}

function ensureExternalAppsHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), SKHPS_EXTERNAL_APPS_HEADERS.length);
  const current = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];

  let needsWrite = false;

  SKHPS_EXTERNAL_APPS_HEADERS.forEach(function (header, index) {
    if (String(current[index] || '').trim() !== header) {
      needsWrite = true;
    }
  });

  if (needsWrite) {
    sheet.getRange(1, 1, 1, SKHPS_EXTERNAL_APPS_HEADERS.length)
      .setValues([SKHPS_EXTERNAL_APPS_HEADERS]);
  }
}

function readExternalAppsTable_(sheet) {
  ensureExternalAppsHeaders_(sheet);

  const lastRow = sheet.getLastRow();
  const lastColumn = Math.max(sheet.getLastColumn(), SKHPS_EXTERNAL_APPS_HEADERS.length);

  if (lastRow < 2) {
    return {
      headers: SKHPS_EXTERNAL_APPS_HEADERS.slice(),
      rows: []
    };
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();

  const headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  const rows = values.slice(1).map(function (rowValues, rowOffset) {
    const row = {
      rowIndex: rowOffset + 2
    };

    headers.forEach(function (header, index) {
      if (header) {
        row[header] = rowValues[index];
      }
    });

    return row;
  });

  return {
    headers: headers,
    rows: rows
  };
}

function updateExternalAppRow_(sheet, rowIndex, patch) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (header) {
      return String(header || '').trim();
    });

  Object.keys(patch).forEach(function (key) {
    const colIndex = headers.indexOf(key) + 1;

    if (colIndex <= 0) {
      return;
    }

    sheet.getRange(rowIndex, colIndex).setValue(patch[key]);
  });
}

function toBoolean_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '是' || text === '1' || text === 'yes';
}