(function(){
  function pick(value){
    return typeof value === "string" && value.trim()
      ? value.trim()
      : "";
  }

  function resolveBackendUrl(){
    var list = [];

    if(window.SKHPS_CONFIG){
      list.push(
        window.SKHPS_CONFIG.webAppUrl,
        window.SKHPS_CONFIG.appsScriptUrl,
        window.SKHPS_CONFIG.execUrl,
        window.SKHPS_CONFIG.apiUrl,
        window.SKHPS_CONFIG.apiBaseUrl
      );

      if(window.SKHPS_CONFIG.endpoints){
        if(window.SKHPS_CONFIG.endpoints.prod){
          list.push(
            window.SKHPS_CONFIG.endpoints.prod.webAppUrl,
            window.SKHPS_CONFIG.endpoints.prod.appsScriptUrl,
            window.SKHPS_CONFIG.endpoints.prod.execUrl,
            window.SKHPS_CONFIG.endpoints.prod.apiUrl
          );
        }

        if(window.SKHPS_CONFIG.endpoints.dev){
          list.push(
            window.SKHPS_CONFIG.endpoints.dev.webAppUrl,
            window.SKHPS_CONFIG.endpoints.dev.appsScriptUrl,
            window.SKHPS_CONFIG.endpoints.dev.execUrl,
            window.SKHPS_CONFIG.endpoints.dev.apiUrl
          );
        }
      }
    }

    if(window.SKHPS_RUNTIME){
      list.push(
        window.SKHPS_RUNTIME.webAppUrl,
        window.SKHPS_RUNTIME.appsScriptUrl,
        window.SKHPS_RUNTIME.execUrl,
        window.SKHPS_RUNTIME.apiUrl,
        window.SKHPS_RUNTIME.apiBaseUrl
      );
    }

    for(var i = 0; i < list.length; i++){
      var found = pick(list[i]);
      if(found){
        return found;
      }
    }

    return "";
  }

  function callJsonp(action, payload){
    return new Promise(function(resolve, reject){
      var endpoint = resolveBackendUrl();

      if(!endpoint){
        reject(new Error("找不到 Apps Script Web App URL。請檢查 assets/js/portal-config.js。"));
        return;
      }

      var callbackName =
        "skhpsBackend_" +
        Date.now() +
        "_" +
        Math.floor(Math.random() * 100000);

      var script = document.createElement("script");

      var timer = setTimeout(function(){
        cleanup();
        reject(new Error("JSONP timeout: " + action));
      }, 15000);

      function cleanup(){
        clearTimeout(timer);

        try{
          delete window[callbackName];
        }
        catch(err){
          window[callbackName] = undefined;
        }

        if(script.parentNode){
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function(payload){
        cleanup();
        resolve(payload);
      };

      script.onerror = function(){
        cleanup();
        reject(new Error("JSONP failed: " + action));
      };

      script.src =
        endpoint +
        (endpoint.indexOf("?") >= 0 ? "&" : "?") +
        "action=" + encodeURIComponent(action) +
        "&callback=" + encodeURIComponent(callbackName) +
        "&ts=" + Date.now();

      if(payload){
        script.src +=
          "&payload=" +
          encodeURIComponent(JSON.stringify(payload));
      }

      document.head.appendChild(script);
    });
  }

  function showResult(targetId, value){
    var el = document.getElementById(targetId);
    if(!el){
      return;
    }

    el.textContent =
      typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  }

  function bindHealthButton(buttonId, resultId){
    var btn = document.getElementById(buttonId);
    if(!btn){
      return;
    }

    btn.addEventListener("click", function(){
      showResult(resultId, "測試中...");

      callJsonp("health")
        .then(function(payload){
          showResult(resultId, {
            ok: true,
            endpoint: resolveBackendUrl(),
            response: payload
          });
        })
        .catch(function(error){
          showResult(resultId, {
            ok: false,
            endpoint: resolveBackendUrl() || null,
            error: error && error.message ? error.message : String(error),
            hasConfig: !!window.SKHPS_CONFIG,
            hasRuntime: !!window.SKHPS_RUNTIME
          });
        });
    });
  }

  window.SKHPSBackendClient = {
    resolveBackendUrl: resolveBackendUrl,
    call: callJsonp,
    bindHealthButton: bindHealthButton
  };
})();