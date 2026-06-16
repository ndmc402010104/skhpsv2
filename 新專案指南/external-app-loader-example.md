# SKHPS 外部 App 水庫接入標準

時間戳記：2026-06-16 UTC+8  
用途：說明外部 App 如何接入 skhpsv2 水庫。  
狀態：規格文件，不是可直接部署的外部專案。真正 smoke test 專案之後另外建立。

---

## 1. 定位

`skhpsv2` 是水庫 / 共通地基 / runtime platform。

外部 App 是下游專案，只保留自己的：

- `index.html`
- `app-card.json`
- `version.js`
- `assets/js/app.js`
- `assets/js/ajax/*.js`，如有需要
- 自己的業務 UI
- 自己的業務流程
- 自己的 Apps Script action / Sheet / database，如有需要

共通能力由 skhpsv2 水庫提供：

- entry-core
- config loader
- route helper
- backend-client
- loading gate
- CSS Sheet runtime
- header
- footer
- diagnostics / runtime panel
- external app registry / registerExternalApp
- footer CSS cache 清除 + reload 工具

外部 App 不應把這些共通模組複製到自己的 repo。

---

## 2. 最新接入原則

外部 App 的 HTML 只直接載兩個水庫資源：

```txt
1. skhpsv2/assets/css/skhps-loading.css
2. skhpsv2/assets/js/app-entry.js
```

其中：

```txt
skhps-loading.css
  唯一獨立 loading CSS
  只處理 loading 階段防裸奔、防跳動
  不由 CSS Sheet 控制

app-entry.js
  外部 App 唯一 JS 入口
  負責讀 app-card.json / version.js
  建立 SKHPS_APP_CONFIG / SKHPS_APP_ENV
  再交給 entry-core.js
```

外部 App 不直接載入：

```txt
runtime.js
loading-gate.js
config.js
route.js
backend-client.js
css-sheet-runtime.js
header.js
page-map.js
footer.js
entry-core.js
```

這些全部由：

```txt
app-entry.js
  ↓
entry-core.js
```

統一載入。

---

## 3. Asset Version / Cache Bust 原則

目前接入程式裡會看到：

```txt
SKHPS_ENTRY_VERSION
```

注意：  
`SKHPS_ENTRY_VERSION` 不是業務版本，也不是 App 版本。  
它只是前端資源 cache buster / asset version，用途是避免瀏覽器或 CDN 吃到舊的 JS / CSS。

正確分工：

```txt
version.js
  業務版本
  顯示在 footer / runtime panel
  代表 App 或水庫目前版本

SKHPS_ENTRY_VERSION
  前端資源 cache buster
  只用在 script/link 的 ?v=
  不代表業務版本
```

水庫理論下，不應該每次改水庫 JS / CSS，就人工到處修改：

```txt
?v=2026061611
```

正確策略：

```txt
local-dev
  使用 Date.now()
  每次重新整理都抓最新水庫資源

dev
  使用 Date.now()
  避免 dev 測試時吃到舊 JS / CSS

prod
  長期應由 push.ps1 / version manifest / buildTime 自動產生
  不應人工到處改
```

目前外部 App 範本先使用：

```js
function assetVersion(runtime) {
  if (runtime === "local-dev" || runtime === "dev") {
    return String(Date.now());
  }

  return window.SKHPS_ASSET_VERSION || "prod";
}
```

說明：

```txt
dev / local：
  正確性優先，不要被 cache 卡住

prod：
  穩定性優先，之後由自動化 build version 接手
```

未來可以把名稱逐步整理為：

```txt
SKHPS_ASSET_VERSION
```

但目前為了相容既有 `app-entry.js`，HTML 仍設定：

```js
window.SKHPS_ENTRY_VERSION = assetVersion(resolvedRuntime);
```

---

## 4. Loading 狀態分工

目前 loading class 定義如下：

```txt
skhps-loading
  loading 畫面總開關
  只有 page ready / all-ready 才移除

skhps-css-loading
  CSS Sheet runtime 尚未完成
  CSS ready 後可以先移除
  但 loading 畫面不會因此關閉

skhps-shell-loading
  header / footer shell 尚未完成
  shell ready 後可以先移除
  但只要 skhps-loading 還在，畫面仍不露出

skhps-main-loading
  main / page content 尚未完成
  page ready 後移除
```

正確流程：

```txt
1. 進頁面
   skhps-loading
   skhps-css-loading
   skhps-shell-loading
   skhps-main-loading

2. CSS ready
   移除 skhps-css-loading
   loading 畫面繼續顯示

3. Shell ready
   移除 skhps-shell-loading
   header/footer 已 ready
   但仍被 skhps-loading 擋住

4. Page ready / all-ready
   移除 skhps-main-loading
   移除 skhps-loading
   loading 畫面關閉
   header/footer/main 一起出現
```

重點：

```txt
Header/Footer 可以先完成，但不能先露出畫面。
Loading 畫面要等整頁 ready 才關。
```

---

## 5. 最小檔案結構

真正外部專案最小結構：

```txt
your-app/
  index.html
  app-card.json
  version.js
  assets/
    js/
      app.js
```

如果有 ajax module：

```txt
your-app/
  assets/
    js/
      app.js
      ajax/
        your-action.js
```

---

## 6. index.html 最小範本

注意：

```txt
這段是文字範本。
真正 smoke test 專案之後再由 Smoke 建立。
```

```html
<!DOCTYPE html>
<!--
檔案位置：YOUR_EXTERNAL_APP/index.html
用途：SKHPS 外部 App 最小入口模板。

水庫法則：
- 本頁是外部 App，不是 skhpsv2 主體頁。
- 本頁只直接載入：
  1. skhpsv2/assets/css/skhps-loading.css
  2. skhpsv2/assets/js/app-entry.js
- 本頁不直接載入 runtime/config/backend/css/header/footer。
- 正式 CSS 由 CSS Sheet runtime / cache 負責。
- loading 階段由唯一 skhps-loading.css 負責。
- SKHPS_ENTRY_VERSION 只是前端資源 cache buster，不是業務版本。
-->
<html
  lang="zh-Hant"
  class="skhps-loading skhps-css-loading skhps-shell-loading skhps-main-loading"
  data-loading-title="YOUR_APP_TITLE"
  data-skhps-entry-scope="external-app"
  data-skhps-page-id="YOUR_APP_ID"
  data-skhps-page-map-current="YOUR_APP_TITLE"
  data-skhps-loading-tasks="css-runtime,app-ready"
  data-skhps-shell-ready="false"
  data-skhps-page-ready="false"
>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>YOUR_APP_TITLE</title>

  <script>
    (function () {
      "use strict";

      var APP_CARD_URL = "app-card.json";

      var host = String(location.hostname || "").toLowerCase();
      var params = new URLSearchParams(location.search || "");
      var runtime = String(params.get("skhpsRuntime") || params.get("runtime") || "").trim();

      var allowedRuntime = {
        "local-dev": true,
        dev: true,
        prod: true
      };

      function runtimeBaseUrl(value) {
        if (value === "local-dev") {
          return "http://127.0.0.1:5500/skhpsv2/";
        }

        if (value === "dev") {
          return "https://dev-skhps.jonaminz.com/";
        }

        return "https://skhps.jonaminz.com/";
      }

      function currentRuntime() {
        if (host === "127.0.0.1" || host === "localhost" || host === "") {
          return "local-dev";
        }

        if (allowedRuntime[runtime]) {
          return runtime;
        }

        if (
          host.indexOf("dev-") === 0 ||
          host.indexOf("dev.") === 0 ||
          host.indexOf("dev-skhps") >= 0
        ) {
          return "dev";
        }

        return "prod";
      }

      function assetVersion(value) {
        /*
          注意：
          這不是 app version。
          這只是前端資源 cache buster。

          local-dev / dev：
            使用 Date.now()，避免測試時吃舊水庫 JS / CSS。

          prod：
            長期應由 push.ps1 / version manifest / buildTime 自動產生。
            目前先保留穩定字串，等自動化補上。
        */
        if (value === "local-dev" || value === "dev") {
          return String(Date.now());
        }

        return window.SKHPS_ASSET_VERSION || "prod";
      }

      var resolvedRuntime = currentRuntime();

      window.SKHPS_ENTRY_VERSION = assetVersion(resolvedRuntime);
      window.SKHPS_ENTRY_BASE_URL = runtimeBaseUrl(resolvedRuntime);
      window.SKHPS_APP_CARD_URL = APP_CARD_URL;

      document.documentElement.setAttribute("data-skhps-runtime", resolvedRuntime);
      document.documentElement.setAttribute("data-skhps-entry-scope", "external-app");

      document.write(
        '<link rel="stylesheet" href="' +
        window.SKHPS_ENTRY_BASE_URL +
        'assets/css/skhps-loading.css?v=' +
        encodeURIComponent(window.SKHPS_ENTRY_VERSION) +
        '">'
      );

      document.write(
        '<script src="' +
        window.SKHPS_ENTRY_BASE_URL +
        'assets/js/app-entry.js?v=' +
        encodeURIComponent(window.SKHPS_ENTRY_VERSION) +
        '"><\/script>'
      );
    })();
  </script>
</head>

<body class="skhps-body">
  <header id="header" class="skhps-header" data-skhps-header></header>

  <main class="skhps-page" data-skhps-main>
    <div class="skhps-container">
      <section class="skhps-hero" aria-labelledby="appTitle">
        <div class="skhps-hero-card">
          <p class="skhps-eyebrow">External App</p>
          <h1 id="appTitle" class="skhps-page-title">YOUR_APP_TITLE</h1>
          <p class="skhps-page-subtitle">
            這是 SKHPS 外部 App。共用框架、CSS runtime、header、footer、backend client 由 skhpsv2 水庫載入。
          </p>
        </div>
      </section>

      <section class="skhps-section" aria-labelledby="appContentTitle">
        <div class="skhps-section-head">
          <div>
            <p class="skhps-eyebrow">App Content</p>
            <h2 id="appContentTitle" class="skhps-section-title">外部 App 內容</h2>
          </div>
        </div>

        <div class="skhps-hero-card">
          <p class="skhps-page-subtitle" data-app-status>
            App 初始化中...
          </p>

          <div data-app-root>
            <!-- assets/js/app.js 可以接管這裡 -->
          </div>
        </div>
      </section>
    </div>
  </main>

  <footer id="footer" data-skhps-footer class="skhps-footer">
    Footer 載入中...
  </footer>
</body>
</html>
```

---

## 7. app-card.json 範本

```json
{
  "appId": "your-app-id",
  "title": "外部 App",
  "group": "未分類",
  "order": 9999,
  "registerExternalApp": true,
  "versionUrl": "version.js",
  "afterScripts": [
    "assets/js/app.js"
  ],
  "href": {
    "local-dev": "http://127.0.0.1:5500/your-app/?skhpsRuntime=local-dev",
    "dev": "https://your-app.skhps.jonaminz.com/?skhpsRuntime=dev",
    "prod": "https://your-app.skhps.jonaminz.com/?skhpsRuntime=prod"
  }
}
```

說明：

```txt
appId
  外部專案唯一 ID。

title
  顯示名稱。

group
  顯示群組。

order
  預設排序。
  最終啟用 / 顯示位置 / 排序由 skhpsv2 後台 registry 決定。

registerExternalApp
  是否讓外部 App 進頁時背景報到。
  報到失敗不能阻擋頁面功能。

versionUrl
  version.js 路徑。

afterScripts
  外部 App 自己的業務 JS。
  路徑相對外部 App，不是相對 skhpsv2。

href
  各環境入口網址。
```

---

## 8. version.js 範本

`version.js` 是業務版本，不是 asset cache buster。

```js
window.SKHPS_VERSION = {
  appId: "your-app-id",
  version: "v0.1.0-20260616",
  major: 0,
  minor: 1,
  patch: 0,
  buildTime: "20260616",
  updatedAt: "2026-06-16T00:00:00+08:00",
  source: "version.js"
};
```

---

## 9. assets/js/app.js 最小範本

```js
/*
檔案位置：YOUR_EXTERNAL_APP/assets/js/app.js
用途：外部 App 自己的業務入口。
*/

(function () {
  "use strict";

  var READY_TASK = "app-ready";

  function loadingDone(task) {
    document.documentElement.setAttribute("data-skhps-" + task + "-ready", "true");

    if (window.SKHPSLoading && typeof window.SKHPSLoading.done === "function") {
      window.SKHPSLoading.done(task);
      return;
    }

    document.documentElement.classList.remove("skhps-loading");
    document.documentElement.classList.remove("skhps-css-loading");
    document.documentElement.classList.remove("skhps-shell-loading");
    document.documentElement.classList.remove("skhps-main-loading");
    document.documentElement.setAttribute("data-skhps-shell-ready", "true");
    document.documentElement.setAttribute("data-skhps-page-ready", "true");
  }

  function loadingFail(task, error) {
    document.documentElement.setAttribute("data-skhps-" + task + "-ready", "false");

    if (window.SKHPSLoading && typeof window.SKHPSLoading.fail === "function") {
      window.SKHPSLoading.fail(task, error);
      return;
    }

    document.documentElement.classList.remove("skhps-loading");
    document.documentElement.classList.remove("skhps-css-loading");
    document.documentElement.classList.remove("skhps-shell-loading");
    document.documentElement.classList.remove("skhps-main-loading");
    document.documentElement.setAttribute("data-skhps-shell-ready", "true");
    document.documentElement.setAttribute("data-skhps-page-ready", "true");
  }

  function setStatus(text) {
    var el = document.querySelector("[data-app-status]");
    if (el) {
      el.textContent = text;
    }
  }

  function init() {
    try {
      setStatus("App 已初始化。");

      /*
        App 初始化放這裡。

        如需後端：
        SKHPSBackend.call("actionName", payload).then(...)

        如需 AJAX module：
        由本檔自行載入 assets/js/ajax/*.js。
      */

      loadingDone(READY_TASK);
    } catch (error) {
      console.error(error);
      setStatus("App 初始化失敗。");
      loadingFail(READY_TASK, error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
```

---

## 10. Loading Gate 規則

外部 App 的 `<html>` 必須宣告：

```html
data-skhps-loading-tasks="css-runtime,app-ready"
```

其中：

```txt
css-runtime
  由 css-sheet-runtime.js 回報。

app-ready
  由外部 App 自己的 assets/js/app.js 回報。
```

App 初始化完成：

```js
SKHPSLoading.done("app-ready");
```

App 初始化失敗但仍要放行：

```js
SKHPSLoading.fail("app-ready", error);
```

注意：

```txt
fail 會讓 gate 以 WARN 狀態放行。
不要因為單一 App 初始化失敗就永久卡 loading。
```

---

## 11. CSS 原則

正式畫面樣式：

```txt
CSS Sheet
css-sheet-runtime.js
localStorage cache
```

唯一獨立 CSS：

```txt
skhpsv2/assets/css/skhps-loading.css
```

外部 App 不應：

```txt
不寫大量 inline style
不複製 skhpsv2 共通 CSS
不自己載 CSS runtime
不自己管理 header/footer 樣式
```

外部 App 可以：

```txt
使用既有語意 class：
  skhps-page
  skhps-container
  skhps-hero
  skhps-hero-card
  skhps-section
  skhps-section-head
  skhps-page-title
  skhps-page-subtitle
  skhps-btn
```

---

## 12. Cache 原則

目前定案：

```txt
CSS 可以 cache。
功能資料 / backend 資料預設不要 cache。
```

CSS cache：

```txt
由 css-sheet-runtime.js 管理。
footer 的 CSS 按鈕只清 CSS cache。
```

功能資料：

```txt
不要偷用 localStorage cache。
例如首頁 external apps registry 必須等 listExternalProjects 回來並 render 完，才 done external-apps-runtime。
```

未來如果真的需要 backend cache，必須獨立設計：

```txt
CSS cache 清除
Backend cache 清除
All cache 清除
```

不能讓 CSS 按鈕順手清 backend cache，也不能讓 backend cache 混在 CSS cache 裡。

---

## 13. 後端原則

外部 App 需要後端時，前端統一呼叫：

```js
SKHPSBackend.call("actionName", payload);
```

不要在外部 App repo 複製：

```txt
backend-client.js
config.js
Apps Script router
共通 action wrapper
```

外部 App 可以有自己的後端 action / Sheet / database。  
但前端呼叫入口仍然走水庫提供的 `SKHPSBackend.call()`。

---

## 14. Registry / 啟用 / 顯示位置

外部 App 不自己決定：

```txt
是否啟用
顯示在前台或後台
排序
顯示群組最終位置
哪個環境開放
是否出現在首頁
```

這些由 skhpsv2 後台 registry 管理。

外部 App 的 `app-card.json` 只提供：

```txt
appId
title
group 初始分類
order 初始排序
href
versionUrl
afterScripts
registerExternalApp
```

---

## 15. Smoke test 待辦

真正外部 smoke test 專案之後再建立。

建議 smoke 專案名稱：

```txt
skhps-external-smoke
```

最小驗證項目：

```txt
1. 外部 index.html 只直接載入 skhps-loading.css + app-entry.js
2. dev / local 不需要人工修改 ?v= 也能抓到最新水庫 JS
3. app-entry.js 成功讀 app-card.json
4. app-entry.js 成功讀 version.js
5. entry-core.js 成功載入共通 runtime
6. css-sheet-runtime.js 成功回報 css-runtime
7. header/footer 成功掛載
8. entry-core.js 成功 done("skhps-shell")
9. assets/js/app.js 成功 done("app-ready")
10. loading 畫面等 all-ready 後才關
11. header/footer/main 一起出現
12. registerExternalApp 背景報到失敗時不阻塞頁面
13. footer CSS 按鈕只清 CSS cache + reload
14. 功能資料 / backend 資料不使用 localStorage cache
```

---

## 16. 常見錯誤

### 錯誤：外部 App 自己直接載入共通 JS

不要：

```html
<script src="runtime.js"></script>
<script src="loading-gate.js"></script>
<script src="backend-client.js"></script>
<script src="css-sheet-runtime.js"></script>
<script src="header.js"></script>
<script src="footer.js"></script>
```

正確：

```html
<script src="skhpsv2/assets/js/app-entry.js"></script>
```

---

### 錯誤：把 SKHPS_ENTRY_VERSION 當成業務版本

不要：

```txt
每次改 App 版本就手動改 SKHPS_ENTRY_VERSION。
每次改水庫 JS 就人工到處改 ?v=。
```

正確：

```txt
version.js 才是業務版本。
SKHPS_ENTRY_VERSION 只是前端資源 cache buster。

dev / local 使用 Date.now()。
prod 長期由 push.ps1 / version manifest / buildTime 自動產生。
```

---

### 錯誤：loading 動畫跟 css-loading 綁死

不要把 loading 畫面總開關綁在：

```txt
skhps-css-loading
```

正確：

```txt
skhps-loading 是 loading 畫面總開關。
skhps-css-loading 只代表 CSS runtime 未完成。
```

---

### 錯誤：Shell ready 後 header/footer 先露出

不應該：

```txt
CSS ready
Shell ready
Header/Footer 直接露出
Main 還在 loading
```

正確：

```txt
CSS ready
Shell ready
Header/Footer 只代表已完成
但畫面仍被 skhps-loading 擋住
Page ready 後 header/footer/main 一起出現
```

---

### 錯誤：忘記 app-ready

如果 `data-skhps-loading-tasks` 有：

```txt
app-ready
```

但 `assets/js/app.js` 沒有呼叫：

```js
SKHPSLoading.done("app-ready");
```

頁面會等到 timeout fallback 才放行。

---

### 錯誤：功能資料偷用 localStorage cache

目前定案：

```txt
CSS 可以 cache。
功能資料 / backend 資料不要 cache。
```

如果功能資料需要快取，必須另外設計 backend cache scope，不可以混在 CSS cache 裡。

---

## 17. 本文件結論

外部 App 接入只記一句話：

```txt
外部 App 只宣告自己是誰，水庫負責共通地基。
```

也就是：

```txt
index.html
  設定 runtime
  載唯一 loading CSS
  載 app-entry.js
  dev / local 自動 cache bust，不人工改 ?v=

app-card.json
  宣告 appId / title / href / afterScripts

version.js
  宣告業務版本

assets/js/app.js
  做業務
  最後回報 app-ready
```