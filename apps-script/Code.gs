function doGet(e) {
  return handleApiRequest_(e);
}

function doPost(e) {
  return handleApiRequest_(e);
}

function handleApiRequest_(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || '';
  var callback = params.callback || '';

  var result = routeAction_(action, params);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(result) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function routeAction_(action, params) {
  var allowedActions = [
    'health',
    'checkRequiredServices',
    'sheetStatus'
  ];

  if (allowedActions.indexOf(action) === -1) {
    return {
      ok: false,
      action: action,
      error: 'UNKNOWN_ACTION',
      message: 'Unknown action: ' + action,
      allowedActions: allowedActions,
      serverTime: getServerTime_()
    };
  }

  if (action === 'health') {
    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      serverTime: getServerTime_()
    };
  }

  if (action === 'checkRequiredServices') {
    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      services: {
        spreadsheet: typeof SpreadsheetApp !== 'undefined',
        properties: typeof PropertiesService !== 'undefined'
      },
      serverTime: getServerTime_()
    };
  }

  if (action === 'sheetStatus') {
    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      data: getSheetStatus_(),
      serverTime: getServerTime_()
    };
  }

  return {
    ok: false,
    action: action,
    error: 'UNHANDLED_ACTION',
    serverTime: getServerTime_()
  };
}

function getServerEnv_() {
  if (
    typeof getServerConfig_ === 'function' &&
    getServerConfig_() &&
    getServerConfig_().env
  ) {
    return getServerConfig_().env;
  }

  return 'prod';
}

function getServerTime_() {
  return Utilities.formatDate(
    new Date(),
    'Asia/Taipei',
    'yyyy-MM-dd HH:mm:ss'
  );
}