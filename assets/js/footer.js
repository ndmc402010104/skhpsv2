/*
檔案位置：assets/js/footer.js
時間戳記：2026-06-08 12:00 UTC+8
用途：skhpsv2 共用 footer 狀態列；顯示 version、Apps Script 連線狀態，並依頁面宣告選擇性顯示 Calendar 狀態。
*/
(function () {
  const FOOTER_SELECTOR = '[data-skhps-footer]';
  const DEFAULT_STATUS = 'version,api';
  const VERSION_URL = './version.json';

  function getFooter() {
    return document.querySelector(FOOTER_SELECTOR);
  }

  function parseStatusList(footer) {
    const raw = footer.getAttribute('data-footer-status') || DEFAULT_STATUS;
    return raw
      .split(',')
      .map(function (item) { return item.trim().toLowerCase(); })
      .filter(Boolean);
  }

  function hasStatus(statusList, name) {
    return statusList.indexOf(name) !== -1;
  }

  function createItem(id, label, value, state) {
    const item = document.createElement('span');
    item.className = 'skh-footer-status-item';
    item.setAttribute('data-footer-item', id);
    item.setAttribute('data-state', state || 'neutral');
    item.innerHTML =
      '<strong>' + escapeHtml(label) + '：</strong>' +
      '<span>' + escapeHtml(value || 'checking') + '</span>';
    return item;
  }

  function setItem(footer, id, label, value, state) {
    let item = footer.querySelector('[data-footer-item="' + id + '"]');

    if (!item) {
      item = createItem(id, label, value, state);
      footer.appendChild(item);
      return;
    }

    item.setAttribute('data-state', state || 'neutral');
    item.innerHTML =
      '<strong>' + escapeHtml(label) + '：</strong>' +
      '<span>' + escapeHtml(value || '') + '</span>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getRuntimeApiUrl() {
    const candidates = [
      window.SKH_RUNTIME && window.SKH_RUNTIME.apiBaseUrl,
      window.SKH_RUNTIME && window.SKH_RUNTIME.webAppUrl,
      window.SKH_RUNTIME && window.SKH_RUNTIME.appsScriptUrl,
      window.SKHPS_RUNTIME && window.SKHPS_RUNTIME.apiBaseUrl,
      window.SKHPS_RUNTIME && window.SKHPS_RUNTIME.webAppUrl,
      window.SKHPS_RUNTIME && window.SKHPS_RUNTIME.appsScriptUrl,
      window.SKHPS_CONFIG && window.SKHPS_CONFIG.apiBaseUrl,
      window.SKHPS_CONFIG && window.SKHPS_CONFIG.webAppUrl,
      window.SKHPS_CONFIG && window.SKHPS_CONFIG.appsScriptUrl
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      if (typeof candidates[i] === 'string' && candidates[i].trim()) {
        return candidates[i].trim();
      }
    }

    return '';
  }

  function buildHealthUrl(baseUrl) {
    if (!baseUrl) return '';

    const separator = baseUrl.indexOf('?') === -1 ? '?' : '&';
    return baseUrl + separator + 'action=health&ts=' + encodeURIComponent(Date.now());
  }

  function loadVersion(footer) {
    setItem(footer, 'version', 'Version', 'loading', 'checking');

    fetch(VERSION_URL + '?ts=' + encodeURIComponent(Date.now()), {
      method: 'GET',
      cache: 'no-store'
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('version.json HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        const version = data.version || data.VERSION || data.name || 'unknown';
        setItem(footer, 'version', 'Version', version, 'ok');
      })
      .catch(function () {
        setItem(footer, 'version', 'Version', 'version.json failed', 'error');
      });
  }

  function loadApiStatus(footer, statusList) {
    setItem(footer, 'api', 'Apps Script', 'checking', 'checking');

    const apiUrl = getRuntimeApiUrl();

    if (!apiUrl) {
      setItem(footer, 'api', 'Apps Script', 'not configured', 'error');

      if (hasStatus(statusList, 'calendar')) {
        setItem(footer, 'calendar', 'Calendar', 'hidden: API not configured', 'error');
      }

      return;
    }

    fetch(buildHealthUrl(apiUrl), {
      method: 'GET',
      cache: 'no-store'
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Apps Script HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          throw new Error(data && data.message ? data.message : 'health check failed');
        }

        setItem(footer, 'api', 'Apps Script', data.env ? 'OK / ' + data.env : 'OK', 'ok');

        if (hasStatus(statusList, 'calendar')) {
          const calendarText =
            data.calendarName ||
            data.calendarId ||
            data.calendar ||
            'not configured';

          setItem(
            footer,
            'calendar',
            'Calendar',
            calendarText,
            calendarText === 'not configured' ? 'error' : 'ok'
          );
        }
      })
      .catch(function (error) {
        setItem(
          footer,
          'api',
          'Apps Script',
          error && error.message ? 'failed: ' + error.message : 'failed',
          'error'
        );

        if (hasStatus(statusList, 'calendar')) {
          setItem(footer, 'calendar', 'Calendar', 'unavailable', 'error');
        }
      });
  }

  function initFooter() {
    const footer = getFooter();
    if (!footer) return;

    const statusList = parseStatusList(footer);

    footer.classList.add('skh-footer--status');
    footer.innerHTML = '';

    if (hasStatus(statusList, 'version')) {
      loadVersion(footer);
    }

    if (hasStatus(statusList, 'api')) {
      loadApiStatus(footer, statusList);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFooter);
  } else {
    initFooter();
  }
})();

