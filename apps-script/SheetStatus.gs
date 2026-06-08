function getSheetStatus_() {
  var spreadsheetId = '';

  if (typeof getSpreadsheetId_ === 'function') {
    spreadsheetId = getSpreadsheetId_();
  }

  if (!spreadsheetId) {
    return {
      ok: false,
      configured: false,
      message: 'SPREADSHEET_ID is not configured.'
    };
  }

  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);

    return {
      ok: true,
      configured: true,
      spreadsheetName: ss.getName(),
      sheetCount: ss.getSheets().length
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      error: error && error.message ? error.message : String(error)
    };
  }
}