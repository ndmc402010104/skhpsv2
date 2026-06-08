/*
檔案位置：assets/js/footer.js
時間戳記：2026-06-08 12:45 UTC+8
用途：skhpsv2 共用 footer 狀態列；顯示 version、Apps Script 連線狀態，並依頁面宣告選擇性顯示 Calendar 狀態。不得寫死部署網址。
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
      .map(function (item) {
        return item.trim().toLowerCase();
      })
      .filter(Boolean);
  }

  function hasStatus(statusList, name) {
    return statusList.indexOf(name) !== -1;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setItem(footer, id, label, value, state) {
    let item = footer.querySelector('[data-footer-item="' + id + '"]');

    if (!item) {
      item = document.createElement('span');
      item.className = 'skh-footer-status-item';
      item.setAttribute('data-footer-item', id);
      footer.appendChild(item);
    }

    item.setAttribute('data-state', state || 'neutral');
    item.innerHTML =
      '<strong>' + escapeHtml(label) + '：</strong>' +
      '<span>' + escapeHtml(value || '') + '</span>';
  }

  function getNestedValue(source, paths) {
    if (!source) return '';

    for (let i = 0; i < paths.length; i += 1) {
      const path = paths[i].split('.');
      let current = source;

      for (let j = 0; j < path.length; j += 1) {
        if (!current || typeof current !== 'object') {
          current = null;
          break;
        }
        current = current[path[j]];
      }

      if (typeof current === 'string' && current.trim()) {
        return current.trim();
      }
    }

    return '';
  }

  function inferEnvFromLocation() {
    const host = window.location && window.location.hostname
      ? window.location.hostname.toLowerCase()
      : '';

    if (!host || host === 'localhost' || host === '127.0.0.1') {
      return 'local';
    }

    if (host.indexOf('dev') !== -1 || host.indexOf('test') !== -1) {
      return 'dev';
    }

    return 'prod';
  }

  function getRuntimeEnv() {
    return (
      getNestedValue(window.SKH_RUNTIME, ['env', 'mode', 'environment']) ||
      getNestedValue(window.SKHPS_RUNTIME, ['env', 'mode', 'environment']) ||
      getNestedValue(window.SKHPS_CONFIG, ['env', 'mode', 'environment']) ||
      inferEnvFromLocation()
    );
  }

  function getRuntimeApiUrl() {
    const env = getRuntimeEnv();

    const directUrl =
      getNestedValue(window.SKH_RUNTIME, [
        'apiBaseUrl',
        'webAppUrl',
        'appsScriptUrl',
        'api.url',
        'appsScript.url'
      ]) ||
      getNestedValue(window.SKHPS_RUNTIME, [
        'apiBaseUrl',
        'webAppUrl',
        'appsScriptUrl',
        'api.url',
        'appsScript.url'
      ]) ||
      getNestedValue(window.SKHPS_CONFIG, [
        'apiBaseUrl',
        'webAppUrl',
        'appsScriptUrl',
        'api.url',
        'appsScript.url'
      ]);

    if (directUrl) return directUrl;

    const envUrl =
      getNestedValue(window.SKH_RUNTIME, [
        'endpoints.' + env + '.apiBaseUrl',
        'endpoints.' + env + '.webAppUrl',
        'endpoints.' + env + '.appsScriptUrl',
        'appsScript.' + env + '.url'
      ]) ||
      getNestedValue(window.SKHPS_RUNTIME, [
        'endpoints.' + env + '.apiBaseUrl',
        'endpoints.' + env + '.webAppUrl',
        'endpoints.' + env + '.appsScriptUrl',
        'appsScript.' + env + '.url'
      ]) ||
      getNestedValue(window.SKHPS_CONFIG, [
        'endpoints.' + env + '.apiBaseUrl',
        'endpoints.' + env + '.webAppUrl',
        'endpoints.' + env + '.appsScriptUrl',
        'appsScript.' + env + '.url'
      ]);

    return envUrl || '';
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
        const current = data.current || {};
        const envKey = current.env || data.repoRole || data.defaultEnv || 'prod';
        const envInfo =
          data.environments && data.environments[envKey]
            ? data.environments[envKey]
            : {};

        const label =
          current.label ||
          envInfo.label ||
          envKey;

        const version =
          current.version ||
          envInfo.version ||
          data.version ||
          data.VERSION ||
          data.name ||
          'unknown';

        const displayVersion = label ? label + ' ' + version : version;

        setItem(footer, 'version', 'Version', displayVersion, 'ok');
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
      return;
    }

    fetch(buildHealthUrl(apiUrl), {
      method: 'GET',
      cache: 'no-store'
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) {
          throw new Error(data && data.message ? data.message : 'health check failed');
        }

        setItem(
          footer,
          'api',
          'Apps Script',
          data.env ? 'OK / ' + data.env : 'OK',
          'ok'
        );

        if (hasStatus(statusList, 'calendar')) {
          const calendarText =
            data.calendarName ||
            data.calendarId ||
            data.calendar ||
            '';

          if (calendarText) {
            setItem(footer, 'calendar', 'Calendar', calendarText, 'ok');
          }
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

