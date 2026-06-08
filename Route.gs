// 檔案位置：skhpsv2/Route.gs
// 時間戳記：2026-06-08 00:00 UTC+8
// 用途：skhpsv2 route placeholder；後續可依 page 參數分流，目前 doGet 固定進 UI 設定頁。

function getBackendStatus() {
  return {
    ok: true,
    app: 'skhpsv2',
    service: 'Apps Script',
    message: 'skhpsv2 Apps Script backend is reachable.',
    timestamp: new Date().toISOString()
  };
}
