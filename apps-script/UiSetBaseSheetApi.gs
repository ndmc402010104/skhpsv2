/*
檔案位置：skhpsv2/apps-script/UiSetBaseSheetApi.gs
時間戳記：2026-06-08 14:57 UTC+8
用途：skhpsv2 UI 設定中心「基礎模式」Sheet API；讀取 Google Sheet 的 base token，供 GitHub 前端透過 Web App API / JSONP 套用。
*/

var UISET_CSS_DB_SPREADSHEET_ID =
  '1Kd2T_XhkeAUyDzmdXvDUBcHKbmGII-7sky5nfJ8PY50';

var UISET_BASE_COMPONENT =
  'base';

var UISET_BASE_SHEET_NAMES =
  [
    '基礎模式',
    '00_基礎'
  ];

var UISET_DEFAULT_MARK =
  'default';


function getUiSetBaseCssSettings() {
  return readUiSetBaseCssSettingsByDefaultMark_(false);
}


function getUiSetBaseDefaultCssSettings() {
  return readUiSetBaseCssSettingsByDefaultMark_(true);
}


function getUiSetThemeSettings() {
  return {
    base: getUiSetBaseCssSettings()
  };
}


function readUiSetBaseCssSettingsByDefaultMark_(wantDefault) {
  var sh =
    getUiSetBaseSheet_();

  var data =
    sh.getDataRange().getValues();

  if (!data || data.length === 0) {
    return {};
  }

  var headerInfo =
    findUiSetHeaderRow_(data);

  if (!headerInfo) {
    throw new Error('找不到 CSS 設定表 header：需要 component / className / property / value / updatedAt');
  }

  var headerRowIndex =
    headerInfo.rowIndex;

  var col =
    headerInfo.col;

  var latestMap = {};

  for (var r = headerRowIndex + 1; r < data.length; r++) {
    var row = data[r];

    var component =
      String(row[col.component] || '').trim();

    var className =
      String(row[col.className] || '').trim();

    var property =
      String(row[col.property] || '').trim();

    var value =
      row[col.value];

    var updatedAt =
      String(row[col.updatedAt] || '').trim();

    if (component !== UISET_BASE_COMPONENT) {
      continue;
    }

    if (!className || !property) {
      continue;
    }

    var isDefault =
      updatedAt === UISET_DEFAULT_MARK;

    if (wantDefault !== isDefault) {
      continue;
    }

    var key =
      className + '|' + property;

    latestMap[key] = {
      className: className,
      property: property,
      value: value
    };
  }

  var result = {};

  Object.keys(latestMap).forEach(function(key) {
    var item = latestMap[key];

    if (!result[item.className]) {
      result[item.className] = {};
    }

    result[item.className][item.property] =
      item.value;
  });

  return result;
}


function getUiSetBaseSheet_() {
  var ss =
    SpreadsheetApp.openById(UISET_CSS_DB_SPREADSHEET_ID);

  for (var i = 0; i < UISET_BASE_SHEET_NAMES.length; i++) {
    var sh =
      ss.getSheetByName(UISET_BASE_SHEET_NAMES[i]);

    if (sh) {
      return sh;
    }
  }

  throw new Error(
    '找不到基礎模式 Sheet，已嘗試：' +
    UISET_BASE_SHEET_NAMES.join(', ')
  );
}


function findUiSetHeaderRow_(data) {
  for (var r = 0; r < Math.min(data.length, 20); r++) {
    var row =
      data[r].map(function(cell) {
        return String(cell || '').trim();
      });

    var col = {
      component: row.indexOf('component'),
      className: row.indexOf('className'),
      property: row.indexOf('property'),
      value: row.indexOf('value'),
      description: row.indexOf('description'),
      updatedAt: row.indexOf('updatedAt')
    };

    if (
      col.component >= 0 &&
      col.className >= 0 &&
      col.property >= 0 &&
      col.value >= 0 &&
      col.updatedAt >= 0
    ) {
      return {
        rowIndex: r,
        col: col
      };
    }
  }

  return null;
}
