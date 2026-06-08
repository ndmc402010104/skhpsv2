function getCssSheetPreview_(tabKey) {
  tabKey = tabKey || '';

  var cssSheetConfig = getCssSheetConfig_(tabKey);

  if (!cssSheetConfig) {
    return {
      ok: false,
      configured: false,
      tabKey: tabKey,
      error: 'UNKNOWN_CSS_SHEET',
      message: 'Unknown CSS sheet key: ' + tabKey
    };
  }

  if (!cssSheetConfig.tabGid) {
    return {
      ok: false,
      configured: false,
      tabKey: tabKey,
      title: cssSheetConfig.title,
      message: 'tabGid is not configured.'
    };
  }

  var spreadsheetId = getSpreadsheetId_();

  if (!spreadsheetId) {
    return {
      ok: false,
      configured: false,
      tabKey: tabKey,
      title: cssSheetConfig.title,
      message: 'mainSpreadsheetId is not configured.'
    };
  }

  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets();
    var targetSheet = null;
    var targetGid = String(cssSheetConfig.tabGid);

    for (var i = 0; i < sheets.length; i++) {
      if (String(sheets[i].getSheetId()) === targetGid) {
        targetSheet = sheets[i];
        break;
      }
    }

    if (!targetSheet) {
      return {
        ok: false,
        configured: true,
        tabKey: tabKey,
        title: cssSheetConfig.title,
        tabGid: targetGid,
        error: 'SHEET_TAB_NOT_FOUND',
        message: 'Cannot find sheet tab gid: ' + targetGid
      };
    }

    var range = targetSheet.getDataRange();
    var values = range.getDisplayValues();
    var previewRows = values.slice(0, 10);

    return {
      ok: true,
      configured: true,
      tabKey: tabKey,
      title: cssSheetConfig.title,
      tabGid: targetGid,
      sheetName: targetSheet.getName(),
      rowCount: values.length,
      columnCount: values.length ? values[0].length : 0,
      previewRows: previewRows
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      tabKey: tabKey,
      title: cssSheetConfig.title,
      tabGid: String(cssSheetConfig.tabGid),
      error: error && error.message ? error.message : String(error)
    };
  }
}