const SKHPS_SERVER_CONFIG = {
  app: 'skhpsv2',
  env: 'prod'
};

function getServerConfig_() {
  return SKHPS_SERVER_CONFIG;
}

function getSpreadsheetId_() {
  const props = PropertiesService.getScriptProperties();

  return (
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('SHEET_ID') ||
    ''
  );
}