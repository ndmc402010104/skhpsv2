/*
檔案位置：skhpsv2/assets/js/footer-sheet-status.js
時間戳記：2026-06-08 15:04 UTC+8
用途：footer 顯示目前頁面的 Sheet 連線狀態；UISet 基礎模式頁測試 getBaseCssSettings。
*/

(function(){
  'use strict';

  function getFooter(){
    return document.querySelector('[data-skhps-footer]');
  }

  function footerWantsSheet(){
    var footer = getFooter();
    if(!footer) return false;

    var status = footer.getAttribute('data-footer-status') || '';

    return status.split(',').map(function(item){
      return item.trim();
    }).indexOf('sheet') >= 0;
  }

  function readPath(obj,path){
    if(!obj || !path) return '';

    var parts = path.split('.');
    var current = obj;

    for(var i = 0; i < parts.length; i++){
      if(!current || typeof current !== 'object') return '';
      current = current[parts[i]];
    }

    return typeof current === 'string' ? current : '';
  }

  function resolveApiBaseUrl(){
    var candidates = [];

    function push(value){
      if(value && typeof value === 'string'){
        candidates.push(value);
      }
    }

    push(window.SKHPS_API_BASE_URL);

    [
      window.SKHPS_RUNTIME,
      window.SKHPS_CONFIG,
      window.SKHPS_PORTAL_CONFIG,
      window.SKHPS_PORTAL,
      window.SKHPS_APP_CONFIG,
      window.SKHPS
    ].forEach(function(obj){
      if(!obj || typeof obj !== 'object') return;

      [
        'apiBaseUrl',
        'webAppUrl',
        'appsScriptUrl',
        'execUrl',
        'appsScript.prod.webAppUrl',
        'appsScript.prod.appsScriptUrl',
        'appsScript.prod.apiBaseUrl',
        'endpoints.prod.webAppUrl',
        'endpoints.prod.appsScriptUrl',
        'endpoints.prod.apiBaseUrl',
        'appsScript.dev.webAppUrl',
        'endpoints.dev.webAppUrl'
      ].forEach(function(path){
        push(readPath(obj,path));
      });
    });

    for(var i = 0; i < candidates.length; i++){
      var value = String(candidates[i] || '').trim();
      var match = value.match(/https:\/\/script\.google\.com\/macros\/s\/[^"'<>\\s]+\/exec/);

      if(match) return match[0];
    }

    return '';
  }

  function jsonp(action){
    return new Promise(function(resolve,reject){
      var baseUrl = resolveApiBaseUrl();

      if(!baseUrl){
        reject(new Error('Apps Script endpoint not found'));
        return;
      }

      var callbackName =
        'skhpsFooterSheet_' + Date.now() + '_' + Math.floor(Math.random() * 100000);

      var url =
        baseUrl +
        (baseUrl.indexOf('?') >= 0 ? '&' : '?') +
        'action=' + encodeURIComponent(action) +
        '&ts=' + encodeURIComponent(Date.now()) +
        '&callback=' + encodeURIComponent(callbackName);

      var script = document.createElement('script');

      var timeoutId = window.setTimeout(function(){
        cleanup();
        reject(new Error('Sheet check timeout'));
      }, 12000);

      function cleanup(){
        if(timeoutId){
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        try{
          delete window[callbackName];
        }
        catch(err){
          window[callbackName] = undefined;
        }

        if(script && script.parentNode){
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function(payload){
        cleanup();

        if(!payload || payload.ok === false){
          reject(new Error(payload && payload.error ? payload.error : 'Sheet API failed'));
          return;
        }

        resolve(payload);
      };

      script.onerror = function(){
        cleanup();
        reject(new Error('Sheet JSONP failed'));
      };

      script.src = url;
      document.head.appendChild(script);
    });
  }

  function ensureSheetNode(){
    var footer = getFooter();
    if(!footer) return null;

    var node = footer.querySelector('[data-footer-sheet-status]');
    if(node) return node;

    node = document.createElement('span');
    node.setAttribute('data-footer-sheet-status','');
    node.className = 'skh-footer-status-item skh-footer-sheet-status';
    node.style.marginLeft = '12px';
    node.style.fontWeight = '700';

    footer.appendChild(node);

    return node;
  }

  function setSheetStatus(state,message,detail){
    var node = ensureSheetNode();
    if(!node) return;

    var label =
      state === 'ok'
        ? 'Sheet：基礎模式 connected'
        : (
          state === 'loading'
            ? 'Sheet：基礎模式 checking...'
            : 'Sheet：基礎模式 failed'
        );

    node.textContent = message || label;
    node.setAttribute('data-state',state);

    node.style.color =
      state === 'ok'
        ? '#15803d'
        : (
          state === 'loading'
            ? '#64748b'
            : '#b42318'
        );

    try{
      window.dispatchEvent(
        new CustomEvent('skhps-sheet-status', {
          detail:{
            state:state,
            message:message || label,
            raw:detail || null
          }
        })
      );
    }
    catch(err){}
  }

  function boot(){
    if(!footerWantsSheet()) return;

    setSheetStatus('loading');

    jsonp('getBaseCssSettings')
      .then(function(payload){
        setSheetStatus('ok','Sheet：基礎模式 connected',payload);
      })
      .catch(function(error){
        console.error('[skhpsv2] footer sheet status failed:', error);
        setSheetStatus('failed','Sheet：基礎模式 failed');
      });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  }
  else{
    boot();
  }
})();
