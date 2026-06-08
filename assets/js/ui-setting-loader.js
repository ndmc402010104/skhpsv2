(function () {
  const READY_TIMEOUT_MS = 2800;

  let activeRequestId = 0;
  let isLoading = false;

  function getPages() {
    return window.SKHPS_UI_SETTING_PAGES || [];
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function setNavDisabled(disabled) {
    document.querySelectorAll('[data-uiset-page]').forEach(function (button) {
      const pageId = button.getAttribute('data-uiset-page');
      const page = getPages().find(function (item) {
        return item.id === pageId;
      });

      button.disabled = !!disabled || !!(page && page.disabled);
    });
  }

  function activateNav(pageId) {
    document.querySelectorAll('[data-uiset-page]').forEach(function (button) {
      button.classList.toggle(
        'is-active',
        button.getAttribute('data-uiset-page') === pageId
      );
    });
  }

  function showLoading(message) {
    const content = getEl('uiset-content');
    if (!content) return;

    content.classList.add('is-loading');
    content.innerHTML = [
      '<div class="uiset-loading-box">',
      '<div class="uiset-loading-card">',
      '<div class="uiset-loading-spinner"></div>',
      '<div class="uiset-loading-title">', message || '讀取 UI 設定中', '</div>',
      '<div class="uiset-loading-note">正在載入設定子頁；完成後才會顯示內容。</div>',
      '</div>',
      '</div>'
    ].join('');
  }

  function showError(error) {
    const content = getEl('uiset-content');
    if (!content) return;

    isLoading = false;
    setNavDisabled(false);
    content.classList.remove('is-loading');
    content.innerHTML = [
      '<div class="uiset-error">',
      '<strong>載入失敗</strong><br>',
      escapeHtml(error && error.message ? error.message : String(error)),
      '</div>'
    ].join('');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function runInsertedScripts(container) {
    const scripts = Array.prototype.slice.call(container.querySelectorAll('script'));

    scripts.forEach(function (oldScript) {
      const newScript = document.createElement('script');

      Array.prototype.slice.call(oldScript.attributes).forEach(function (attr) {
        newScript.setAttribute(attr.name, attr.value);
      });

      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  function buildFallbackBasePage() {
    return [
      '<section class="skh-card">',
      '<span class="skh-badge skh-badge--info">Base</span>',
      '<h2>00 基礎樣式</h2>',
      '<p>這是第一個 UI 設定子頁。現在先測試父頁 loader / AJAX-like 載入 / ready event gating，之後再接 Sheet 編輯器。</p>',

      '<div class="skh-alert skh-alert--info">',
      '<strong>樣式來源：</strong>Google Sheet「整外科務系統CSS樣式」<br>',
      '<strong>目前狀態：</strong>前端 token 已手動同步，Sheet 讀寫尚未接入。',
      '</div>',

      '<h3>Base Tokens Preview</h3>',
      '<div class="uiset-token-summary">',
      '<div class="uiset-token-card"><strong>Brand</strong><div class="uiset-color-row"><span class="uiset-swatch" style="background:var(--skh-color-primary)"></span><code>--skh-color-primary</code></div></div>',
      '<div class="uiset-token-card"><strong>Page</strong><div class="uiset-color-row"><span class="uiset-swatch" style="background:var(--skh-color-bg)"></span><code>--skh-color-bg</code></div></div>',
      '<div class="uiset-token-card"><strong>Surface</strong><div class="uiset-color-row"><span class="uiset-swatch" style="background:var(--skh-color-surface)"></span><code>--skh-color-surface</code></div></div>',
      '<div class="uiset-token-card"><strong>Warning</strong><div class="uiset-color-row"><span class="uiset-swatch" style="background:var(--skh-color-warning)"></span><code>--skh-color-warning</code></div></div>',
      '</div>',

      '<h3 class="skh-mt-4">Component Smoke Test</h3>',
      '<div class="ui-test-row">',
      '<button class="skh-btn skh-btn--primary">Primary Button</button>',
      '<button class="skh-btn skh-btn--secondary">Secondary Button</button>',
      '<button class="skh-btn skh-btn--danger">Danger Button</button>',
      '</div>',

      '<script>',
      '(function(){',
      '  window.setTimeout(function(){',
      '    window.dispatchEvent(new CustomEvent("skh-ui-setting-ready", { detail: { page: "base", source: "fallback" } }));',
      '  }, 120);',
      '})();',
      '<\/script>',
      '</section>'
    ].join('');
  }

  function fetchUiSettingPageContent(page) {
    return new Promise(function (resolve, reject) {
      if (window.google && google.script && google.script.run) {
        google.script.run
          .withSuccessHandler(function (html) {
            resolve(html);
          })
          .withFailureHandler(function (error) {
            reject(error);
          })
          .getUiSettingPageContent(page.path);
        return;
      }

      if (page.id === 'base') {
        resolve(buildFallbackBasePage());
        return;
      }

      resolve([
        '<section class="skh-card">',
        '<span class="skh-badge skh-badge--muted">Placeholder</span>',
        '<h2>', escapeHtml(page.name), '</h2>',
        '<p>此設定子頁尚未接入。</p>',
        '</section>'
      ].join(''));
    });
  }

  function revealWrapper(requestId, wrapper, loadingNode) {
    if (requestId !== activeRequestId) return;

    const content = getEl('uiset-content');
    if (!content) return;

    isLoading = false;
    setNavDisabled(false);

    if (loadingNode && loadingNode.parentNode) {
      loadingNode.parentNode.removeChild(loadingNode);
    }

    wrapper.classList.remove('is-waiting-ready');
    content.classList.remove('is-loading');
  }

  function waitForReadyAndReveal(page, requestId, wrapper, loadingNode) {
    const eventName = page.waitForReadyEvent;

    if (!eventName) {
      requestAnimationFrame(function () {
        revealWrapper(requestId, wrapper, loadingNode);
      });
      return;
    }

    let done = false;
    let timeoutId = null;

    function cleanup() {
      window.removeEventListener(eventName, onReady);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function finish() {
      if (done) return;
      done = true;
      cleanup();
      revealWrapper(requestId, wrapper, loadingNode);
    }

    function onReady(event) {
      if (requestId !== activeRequestId) return;
      finish();
    }

    window.addEventListener(eventName, onReady);

    timeoutId = window.setTimeout(function () {
      console.warn('[skhpsv2] UI setting ready timeout:', page.id);
      finish();
    }, READY_TIMEOUT_MS);
  }

  function loadPage(pageId) {
    const page = getPages().find(function (item) {
      return item.id === pageId;
    });

    if (!page || page.disabled) return;
    if (isLoading) return;

    const content = getEl('uiset-content');
    if (!content) return;

    const requestId = ++activeRequestId;
    isLoading = true;

    activateNav(page.id);
    setNavDisabled(true);
    showLoading('讀取 ' + page.name);

    fetchUiSettingPageContent(page)
      .then(function (html) {
        if (requestId !== activeRequestId) return;

        content.innerHTML = '';

        const loadingNode = document.createElement('div');
        loadingNode.className = 'uiset-loading-box';
        loadingNode.innerHTML = [
          '<div class="uiset-loading-card">',
          '<div class="uiset-loading-spinner"></div>',
          '<div class="uiset-loading-title">套用 ', page.name, '</div>',
          '<div class="uiset-loading-note">等待子頁完成初始化。</div>',
          '</div>'
        ].join('');

        const wrapper = document.createElement('div');
        wrapper.className = 'uiset-page-wrapper is-waiting-ready';
        wrapper.innerHTML = html;

        content.appendChild(loadingNode);
        content.appendChild(wrapper);

        runInsertedScripts(wrapper);
        waitForReadyAndReveal(page, requestId, wrapper, loadingNode);
      })
      .catch(showError);
  }

  function renderNav() {
    const sidebar = getEl('uiset-sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = '';

    getPages().forEach(function (page) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'uiset-nav-button';
      button.setAttribute('data-uiset-page', page.id);
      button.disabled = !!page.disabled;
      button.title = page.description || '';
      button.innerHTML = [
        '<span>', escapeHtml(page.name), '</span>'
      ].join('');

      button.addEventListener('click', function () {
        loadPage(page.id);
      });

      sidebar.appendChild(button);
    });
  }

  function boot() {
    renderNav();

    const firstPage = getPages().find(function (page) {
      return !page.disabled;
    });

    if (firstPage) {
      loadPage(firstPage.id);
    }
  }

  window.SKHPS_UI_SETTING_LOADER = {
    boot: boot,
    loadPage: loadPage
  };

  document.addEventListener('DOMContentLoaded', boot);
})();
