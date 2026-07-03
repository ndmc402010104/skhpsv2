/**
 * 檔案位置：skhpsv2/apps-script/Code.gs
 * 時間戳記：2026-06-19 00:45 UTC+8
 * 用途：skhpsv2 Apps Script API 入口與 action router；統一 JSON / JSONP 回傳，任何例外都包成 JSONP，並提供外部專案 Sheet registry 通用讀寫 action。
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
    /*
      TODO(拆除 Sheet 殭屍路徑，2026-07-03)：saveCssSheetRows 正式路徑已是 Cloudflare Worker → Supabase CssRegistryRule，
      這裡只剩直接打 GAS webApp 才會碰到的舊 Sheet 寫入。拆除時：移除此白名單項 + 下方 handler + CssSheetWriteApi.gs，
      改完要重新部署 Apps Script。水庫層 CSS 不再接 Google Sheet。
    */
    'saveCssSheetRows',
    'registerExternalApp',
    'listExternalApps',
    'setExternalAppActive',
    'updateExternalAppSettings',
    'listExternalProjects',
    'listExternalProjectsForLauncher',
    'updateExternalProjectActivation'
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

  /*
    TODO(拆除 Sheet 殭屍路徑，2026-07-03)：正式存檔已走 Worker → Supabase，此 handler 仍會寫 Google Sheet，
    僅直接呼叫 GAS webApp 時可達。拆除時連同上方白名單項與 CssSheetWriteApi.gs 一起移除，並重新部署。
  */
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

  if (action === 'listExternalProjects') {
    var projectListPayload = parsePayload_(params);
    var projectListResult = listExternalProjects(projectListPayload);

    projectListResult.action = action;
    projectListResult.app = 'skhpsv2';
    projectListResult.env = getServerEnv_();
    projectListResult.serverTime = getServerTime_();

    return projectListResult;
  }

  if (action === 'listExternalProjectsForLauncher') {
    var launcherListPayload = parsePayload_(params);
    var launcherListResult;

    if (typeof listExternalProjectsForLauncher === 'function') {
      launcherListResult = listExternalProjectsForLauncher(launcherListPayload);
    } else {
      launcherListPayload.activeOnly = false;
      launcherListPayload.includeDisabled = true;
      launcherListPayload.includeInactive = true;
      launcherListPayload.launcherMode = true;
      launcherListResult = listExternalProjects(launcherListPayload);
    }

    launcherListResult.action = action;
    launcherListResult.app = 'skhpsv2';
    launcherListResult.env = getServerEnv_();
    launcherListResult.serverTime = getServerTime_();

    return launcherListResult;
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

  if (action === 'updateExternalAppSettings') {
    var settingsPayload = parsePayload_(params);
    var settingsResult = updateExternalAppSettings(settingsPayload);

    settingsResult.action = action;
    settingsResult.app = 'skhpsv2';
    settingsResult.env = getServerEnv_();
    settingsResult.serverTime = getServerTime_();

    return settingsResult;
  }

  if (action === 'updateExternalProjectActivation') {
    var activationPayload = parsePayload_(params);
    var activationResult = updateExternalProjectActivation(activationPayload);

    activationResult.action = action;
    activationResult.app = 'skhpsv2';
    activationResult.env = getServerEnv_();
    activationResult.serverTime = getServerTime_();

    return activationResult;
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
