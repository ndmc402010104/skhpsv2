/**
 * 檔案位置：skhpsv2/apps-script/Code.gs
 * 時間戳記：2026-06-11 UTC+8
 * 用途：skhpsv2 Apps Script API 入口與 action router；統一 JSON / JSONP 回傳，任何例外都包成 JSONP，避免前端只看到 JSONP failed。
 */

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
  var result;

  try {
    result = routeAction_(action, params);
  } catch (error) {
    result = {
      ok: false,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      error: 'API_EXCEPTION',
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? String(error.stack) : '',
      serverTime: getServerTime_()
    };
  }

  if (typeof outputJsonOrJsonp_ === 'function') {
    return outputJsonOrJsonp_(result, callback);
  }

  if (callback) {
    var safeCallback = String(callback).replace(/[^\w.$]/g, '');

    return ContentService
      .createTextOutput(safeCallback + '(' + JSON.stringify(result) + ');')
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
    'sheetStatus',
    'getCssSheetPreview',
    'getCssSheetRuntime',
    'getQuickLoginStaff',
    'saveCssSheetRows',
    'registerExternalApp',
    'listExternalApps',
    'setExternalAppActive'
  ];

  if (allowedActions.indexOf(action) === -1) {
    return {
      ok: false,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
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
    if (typeof apiCheckRequiredServices === 'function') {
      var serviceResult = apiCheckRequiredServices();
      serviceResult.action = action;
      serviceResult.app = serviceResult.app || 'skhpsv2';
      serviceResult.env = serviceResult.env || getServerEnv_();
      serviceResult.serverTime = serviceResult.serverTime || getServerTime_();
      return serviceResult;
    }

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

  if (action === 'getCssSheetPreview') {
    var previewPayload = parsePayload_(params);
    var tabKey = params.tabKey || previewPayload.tabKey || '';

    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      data: getCssSheetPreview_(tabKey),
      serverTime: getServerTime_()
    };
  }

  if (action === 'getCssSheetRuntime') {
    var runtimePayload = parsePayload_(params);
    var sheetKeys = runtimePayload.sheetKeys || runtimePayload.sheets || [];

    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      rows: getCssSheetRuntime_(sheetKeys),
      serverTime: getServerTime_()
    };
  }

  if (action === 'getQuickLoginStaff') {
    return {
      ok: true,
      action: action,
      app: 'skhpsv2',
      env: getServerEnv_(),
      data: getQuickLoginStaff_(parsePayload_(params)),
      serverTime: getServerTime_()
    };
  }

  if (action === 'saveCssSheetRows') {
    var savePayload = parsePayload_(params);
    var saveResult = saveCssSheetRows_(savePayload);

    saveResult.action = action;
    saveResult.app = 'skhpsv2';
    saveResult.env = getServerEnv_();
    saveResult.serverTime = getServerTime_();

    return saveResult;
  }

  if (action === 'registerExternalApp') {
    var registerPayload = parsePayload_(params);
    var registerResult = registerExternalApp(registerPayload);

    registerResult.action = action;
    registerResult.app = 'skhpsv2';
    registerResult.env = getServerEnv_();
    registerResult.serverTime = getServerTime_();

    return registerResult;
  }

  if (action === 'listExternalApps') {
    var listPayload = parsePayload_(params);
    var listResult = listExternalApps(listPayload);

    listResult.action = action;
    listResult.app = 'skhpsv2';
    listResult.env = getServerEnv_();
    listResult.serverTime = getServerTime_();

    return listResult;
  }

  if (action === 'setExternalAppActive') {
    var activePayload = parsePayload_(params);
    var activeResult = setExternalAppActive(activePayload);

    activeResult.action = action;
    activeResult.app = 'skhpsv2';
    activeResult.env = getServerEnv_();
    activeResult.serverTime = getServerTime_();

    return activeResult;
  }

  return {
    ok: false,
    action: action,
    app: 'skhpsv2',
    env: getServerEnv_(),
    error: 'UNHANDLED_ACTION',
    serverTime: getServerTime_()
  };
}

function parsePayload_(params) {
  if (!params || !params.payload) {
    return {};
  }

  try {
    return JSON.parse(params.payload);
  } catch (error) {
    return {};
  }
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