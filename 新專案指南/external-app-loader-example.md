# external-app-loader.js 範例

## 定位

`skhpsv2/assets/js/external-app-loader.js` 是外部 App 接入 skhpsv2 共用 runtime 的 include loader。

它不是 Bootstrap UI framework、不是 skhpsv2 主站業務功能、不是 external-app-shell，也不是 manifest / app.json 架構。它只負責讓外部 App HTML 載入一支 loader，接著由 loader 依序載入 skhpsv2 共用 runtime 和共用 header / footer，再載入外部 App 自己的 `afterScripts`。

## 水庫理論摘要

skhpsv2 是水庫 / 共通地基 / runtime platform，提供 config loader、backend-client、loading gate、CSS Sheet runtime、footer、version / diagnostics / status，以及 external app registry / activation 接入能力。

QR、Dressing、Quick Login、HIS patient list、Staff maintain 等都應保持為外部 App。外部 App 只專注自己的 HTML、業務 JS、version.json、後端 action，以及必要時透過 skhpsv2 共用 runtime 接 config / backend / css / loading / footer。

## 最小 HTML 範例

```html
<!DOCTYPE html>
<html
  lang="zh-Hant"
  class="skhps-css-loading"
  data-loading-title="外部 App"
  data-skhps-loading-tasks="css-runtime,app-ready"
>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>外部 App</title>

  <link rel="stylesheet" href="https://dev-skhps.jonaminz.com/assets/css/skhps-loading.css" />

  <script>
    window.SKHPS_APP_ENV = {
      appId: "example-app",
      title: "外部 App",
      env: "dev",
      requestedRuntime: "dev",
      sharedBaseUrl: "https://dev-skhps.jonaminz.com/",
      version: "20260611",
      afterScripts: [
        "assets/js/app.js"
      ]
    };

    window.SKHPS_APP_CONFIG = {
      appId: "example-app",
      title: "外部 App",
      href: location.href,
      group: "測試",
      order: 9999,
      registerExternalApp: true
    };
  </script>

  <script src="https://dev-skhps.jonaminz.com/assets/js/external-app-loader.js?v=20260611"></script>
</head>
<body>
  <main>
    外部 App 自己的畫面 DOM
  </main>
</body>
</html>
```

## quick-login test.html 範例

```html
<!DOCTYPE html>
<html
  lang="zh-Hant"
  class="skhps-css-loading"
  data-loading-title="快速登入測試頁"
  data-skhps-loading-tasks="css-runtime,external-app-data"
>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>快速登入測試頁</title>

  <link
    rel="stylesheet"
    href="https://dev-skhps.jonaminz.com/assets/css/skhps-loading.css"
  />

  <script>
    window.SKHPS_APP_ENV = {
      appId: "quick-login-test",
      title: "快速登入測試頁",
      env: "dev",
      requestedRuntime: "dev",
      sharedBaseUrl: "https://dev-skhps.jonaminz.com/",
      version: "20260611",
      afterScripts: [
        "assets/js/login.js"
      ]
    };

    window.SKHPS_APP_CONFIG = {
      appId: "quick-login-test",
      title: "快速登入測試頁",
      href: location.href,
      group: "測試",
      order: 9999,
      registerExternalApp: true
    };
  </script>

  <script src="https://dev-skhps.jonaminz.com/assets/js/external-app-loader.js?v=20260611"></script>
</head>

<body>
  <!-- quick-login 必要 DOM 結構 -->
</body>
</html>
```

## 注意事項

- 外部 App 原則上只載入 `external-app-loader.js`。
- 外部 App 不要自己再載入 `config.js`、`loading-gate.js`、`backend-client.js`、`css-sheet-runtime.js`、`header.js`、`footer.js`。
- loading CSS 仍建議放在 HTML head 很前面，避免畫面閃爍。
- App 自己的 JS 放在 `afterScripts`。
- App 自己的 JS 內部仍應等待 `DOMContentLoaded`。
- `afterScripts` 載入時 DOM 不一定完全 ready。
- 相對路徑的 `afterScripts` 是相對外部 App 頁面，不是相對 `sharedBaseUrl`。
- `registerExternalApp` 是背景報到，失敗不應阻斷 App 功能。
- `runtime.js` 是正式診斷核心，會由 `external-app-loader.js` 自動載入；外部 App 不需要自己另外載入。
- 這只是 include MVP，不是 shell / manifest / app.json 架構。
