# skhpsv2 architecture

## 第一階段

本專案第一階段只建立 CSS / UI Design System 與 Portal shell。

不連接 Apps Script。
不搬移 QR / Dressing / HIS。
不修改 legacy 舊系統。

## CSS 分層

- 00-skhps-tokens.css：設計 token
- 01-skhps-reset.css：reset
- 02-skhps-base.css：基礎字體與文字
- 03-skhps-layout.css：layout / header / footer
- 04-skhps-components.css：button / card / badge
- 05-skhps-forms.css：表單
- 06-skhps-tables.css：表格
- 07-skhps-feedback.css：alert / empty state
- 08-skhps-utilities.css：工具 class
- 20-portal.css：前台 Portal 專用
- 21-admin.css：後台入口專用
- 99-ui-test.css：UI 測試頁專用

## 命名規則

共用 class 使用 skh- prefix。
Portal 專用 class 使用 portal- prefix。
Admin 專用 class 使用 admin- prefix。
UI 測試頁專用 class 使用 ui-test- prefix。
