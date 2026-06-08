/*
檔案位置：skhpsv2/apps-script/Code.gs
時間戳記：2026-06-08 14:57 UTC+8
用途：skhpsv2 Apps Script Web App API 入口；支援 health 與 UI 設定中心 base Sheet 讀取。
*/

function doGet(e) {
  var action =
    e && e.parameter && e.parameter.action;

  var callback =
    e && e.parameter && e.parameter.callback;

  try {
    if (action === 'health') {
      return outputJsonOrJsonp_(
        getBackendStatus(),
        callback
      );
    }

    if (action === 'getBaseCssSettings') {
      return outputJsonOrJsonp_(
        {
          ok: true,
          action: action,
          data: getUiSetBaseCssSettings()
        },
        callback
      );
    }

    if (action === 'getBaseDefaultCssSettings') {
      return outputJsonOrJsonp_(
        {
          ok: true,
          action: action,
          data: getUiSetBaseDefaultCssSettings()
        },
        callback
      );
    }

    if (action === 'getUiThemeSettings') {
      return outputJsonOrJsonp_(
        {
          ok: true,
          action: action,
          data: getUiSetThemeSettings()
        },
        callback
      );
    }

    return outputJsonOrJsonp_(
      {
        ok: false,
        action: action || '',
        error: 'Unknown action: ' + action
      },
      callback
    );
  }
  catch (err) {
    return outputJsonOrJsonp_(
      {
        ok: false,
        action: action || '',
        error: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : ''
      },
      callback
    );
  }
}
