const SKHPS_SERVER_CONFIG = {
  app: 'skhpsv2',
  env: 'prod',
  appsScript: {
    scriptId: '1Qp-aHNtuDr4Jv_yYx006bo8JVfMkUikmdrhhL2YPBYoQYWszKHdVX7d2'
  },
  sheets: {
    mainSpreadsheetId: '1Kd2T_XhkeAUyDzmdXvDUBcHKbmGII-7sky5nfJ8PY50',
    mainGid: '311728002'
  }
};

function getServerConfig_() {
  return SKHPS_SERVER_CONFIG;
}

function getSpreadsheetId_() {
  if (
    typeof SKHPS_SERVER_CONFIG !== 'undefined' &&
    SKHPS_SERVER_CONFIG &&
    SKHPS_SERVER_CONFIG.sheets &&
    SKHPS_SERVER_CONFIG.sheets.mainSpreadsheetId
  ) {
    return SKHPS_SERVER_CONFIG.sheets.mainSpreadsheetId;
  }

  var props = PropertiesService.getScriptProperties();

  return (
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('SHEET_ID') ||
    ''
  );
}