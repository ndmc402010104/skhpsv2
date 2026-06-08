/*
檔案位置：skhpsv2/apps-script/Code.gs
時間戳記：2026-06-08 20:15 UTC+8
用途：skhpsv2 Apps Script Web App API 單一入口。skhpsv2 Apps Script Web App API 單一入口。
*/

function doGet(e) {
  return handleApiRequest_(e, 'GET');
}

function doPost(e) {
  return handleApiRequest_(e, 'POST');
}

function handleApiRequest_(e, method) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || '';
  var callback = params.callback || '';

  try {
    var payload = parseApiPayload_(e, params);
    var result = dispatchApiAction_(action, payload, {
      method: method,
      params: params
    });

    return outputJsonOrJsonp_(result, callback);
  } catch (err) {
    var normalized = normalizeApiError_(err);

    return outputJsonOrJsonp_(
      {
        ok: false,
        action: action,
        error: normalized.message,
        stack: normalized.stack,
        serverTime: formatTaipeiDateTimeForApi_(new Date())
      },
      callback
    );
  }
}

function parseApiPayload_(e, params) {
  if (params && params.payload) {
    return JSON.parse(params.payload);
  }

  if (
    e &&
    e.postData &&
    e.postData.contents &&
    String(e.postData.contents).trim()
  ) {
    return JSON.parse(e.postData.contents);
  }

  return {};
}

function dispatchApiAction_(action, payload, context) {
  if (!action) {
    return apiRoot_();
  }

  switch (action) {
    case 'health':
      return apiHealth_();

    case 'checkRequiredServices':
      return apiCheckRequiredServices();

    default:
      return {
        ok: false,
        action: action,
        error: 'UNKNOWN_ACTION',
        message: 'Unknown action: ' + action,
        allowedActions: [
          'health',
          'checkRequiredServices'],
        serverTime: formatTaipeiDateTimeForApi_(new Date())
      };
  }
}

function apiRoot_() {
  return {
    ok: true,
    app: 'skhpsv2',
    env: 'prod',
    service: 'Apps Script Web App API',
    message: 'skhpsv2 API is running. Use ?action=health.',
    mode: 'api-only',
    serverTime: formatTaipeiDateTimeForApi_(new Date())
  };
}

function apiHealth_() {
  return {
    ok: true,
    app: 'skhpsv2',
    env: 'prod',
    service: 'Apps Script Web App API',
    mode: 'api-only',
    serverTime: formatTaipeiDateTimeForApi_(new Date())
  };
}