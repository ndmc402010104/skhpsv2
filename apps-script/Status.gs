/*
檔案位置：apps-script/Status.gs
時間戳記：2026-06-08 13:56 UTC+8
用途：skhpsv2 Apps Script health check；支援 JSON 與 JSONP。
*/

function getBackendStatus() {
  return {
    ok: true,
    app: 'skhpsv2',
    env: 'prod',
    serverTime: Utilities.formatDate(
      new Date(),
      'Asia/Taipei',
      'yyyy-MM-dd HH:mm:ss'
    )
  };
}

function outputJson_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function outputJsonOrJsonp_(data, callback) {
  if (callback) {
    var safeCallback = String(callback).replace(/[^\w.$]/g, '');

    return ContentService
      .createTextOutput(safeCallback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return outputJson_(data);
}
