// 檔案位置：skhpsv2/UiSettingRoute.gs
// 時間戳記：2026-06-08 00:00 UTC+8
// 用途：UI 設定中心子頁載入 API；供 uiset.html 透過 google.script.run 呼叫。

function getUiSettingPageContent(path) {
  var allowMap = {
    UiSettingBase: 'UiSettingBase'
  };

  var fileName = allowMap[path];

  if (!fileName) {
    return '<section class="skh-card"><span class="skh-badge skh-badge--danger">Blocked</span><h2>未知 UI 設定頁</h2><p>path 不在 allowMap：' +
      escapeHtml_(path) +
      '</p></section>';
  }

  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
