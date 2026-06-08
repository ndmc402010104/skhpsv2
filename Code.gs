// 檔案位置：skhpsv2/Code.gs
// 時間戳記：2026-06-08 00:00 UTC+8
// 用途：skhpsv2 Apps Script 入口；目前只測試 UI 設定頁與子頁載入。

function doGet(e) {
  return showUiSettingPage_();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function showUiSettingPage_() {
  return HtmlService
    .createTemplateFromFile('uiset')
    .evaluate()
    .setTitle('skhpsv2 UI 設定')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
