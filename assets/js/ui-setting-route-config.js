/*
檔案位置：skhpsv2/assets/js/ui-setting-route-config.js
時間戳記：2026-06-08 14:22 UTC+8
用途：skhpsv2 UI 設定中心子頁清單；控制左側選單顯示名稱、順序、載入路徑與 ready event。
*/
window.SKHPS_UI_SETTING_PAGES = [
  {
    id: 'base',
    name: '基礎模式',
    path: 'UiSettingBase',
    badge: 'Base',
    waitForReadyEvent: 'skh-ui-setting-ready',
    description: 'Brand / Page / Surface / Radius / Spacing / Font / Motion / Layout tokens'
  },
  {
    id: 'header',
    name: 'Header',
    path: 'UiSettingHeader',
    badge: 'Soon',
    disabled: true,
    description: '全站 Header 樣式設定，包含頁首標題、返回鍵、導覽列與頁面狀態'
  },
  {
    id: 'footer',
    name: 'Footer',
    path: 'UiSettingFooter',
    badge: 'Soon',
    disabled: true,
    description: '全站 Footer 狀態列設定，包含 version、Apps Script 連線狀態與各頁功能狀態'
  },
  {
    id: 'button',
    name: '按鈕',
    path: 'UiSettingButton',
    badge: 'Soon',
    disabled: true,
    description: '按鈕樣式設定，下一階段接入'
  },
  {
    id: 'form',
    name: '表單',
    path: 'UiSettingForm',
    badge: 'Soon',
    disabled: true,
    description: '表單樣式設定，下一階段接入'
  },
  {
    id: 'table',
    name: '表格',
    path: 'UiSettingTable',
    badge: 'Soon',
    disabled: true,
    description: '表格樣式設定，下一階段接入'
  },
  {
    id: 'feedback',
    name: '提示訊息',
    path: 'UiSettingFeedback',
    badge: 'Soon',
    disabled: true,
    description: 'alert / loading / modal / toast 樣式設定，下一階段接入'
  },
  {
    id: 'layout',
    name: '版面工具',
    path: 'UiSettingLayout',
    badge: 'Soon',
    disabled: true,
    description: 'container / grid / spacing / responsive utilities 樣式設定，下一階段接入'
  }
];
