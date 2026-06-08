(function(){
  function getEndpoint(){
    var config =
      window.SKHPSConfig && window.SKHPSConfig.getConfig
        ? window.SKHPSConfig.getConfig()
        : window.SKHPS_CONFIG;

    if(!config || !config.api || !config.api.webAppUrl){
      return "";
    }

    return String(config.api.webAppUrl).trim();
  }

  function call(action, payload){
    return new Promise(function(resolve, reject){
      var endpoint = getEndpoint();

      if(!endpoint){
        reject(new Error("找不到 config.json 裡的 api.webAppUrl"));
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

        try {
          delete window[callbackName];
        } catch(err) {
          window[callbackName] = undefined;
        }

        if(script.parentNode){
          script.parentNode.removeChild(script);
        }
      }

      window[callbackName] = function(result){
        cleanup();
        resolve(result);
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

  function bindHealthButton(buttonId, resultId){
    var button = document.getElementById(buttonId);
    var result = document.getElementById(resultId);

    if(!button || !result){
      return;
    }

    button.addEventListener("click", function(){
      result.textContent = "測試中...";

      call("health")
        .then(function(response){
          result.textContent = JSON.stringify({
            ok: true,
            endpoint: getEndpoint(),
            response: response
          }, null, 2);
        })
        .catch(function(error){
          result.textContent = JSON.stringify({
            ok: false,
            endpoint: getEndpoint() || null,
            error: error && error.message ? error.message : String(error)
          }, null, 2);
        });
    });
  }

  window.SKHPSBackend = {
    getEndpoint: getEndpoint,
    call: call,
    bindHealthButton: bindHealthButton
  };
})();