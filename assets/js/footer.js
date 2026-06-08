(function(){
  function findFooter(){
    return document.querySelector("[data-skhps-footer]");
  }

  function renderFooter(state){
    var footer = findFooter();

    if(!footer){
      return;
    }

    footer.innerHTML = "";

    var version = document.createElement("span");
    version.textContent = "Version：" + (state.versionText || "unknown");
    footer.appendChild(version);

    footer.appendChild(document.createTextNode("　"));

    var api = document.createElement("span");
    api.textContent = "Apps Script：" + (state.apiText || "not tested");
    footer.appendChild(api);
  }

  function boot(){
    var state = {
      versionText: "loading",
      apiText: "testing"
    };

    renderFooter(state);

    var configPromise =
      window.SKHPSConfig
        ? window.SKHPSConfig.loadConfig()
        : Promise.reject(new Error("SKHPSConfig not loaded"));

    var versionPromise =
      window.SKHPSConfig
        ? window.SKHPSConfig.loadVersion()
        : Promise.reject(new Error("SKHPSConfig not loaded"));

    versionPromise
      .then(function(version){
        state.versionText =
          version.version ||
          version.name ||
          "unknown";
        renderFooter(state);
      })
      .catch(function(error){
        state.versionText = "version.json failed";
        renderFooter(state);
      });

    configPromise
      .then(function(){
        if(!window.SKHPSBackend){
          throw new Error("SKHPSBackend not loaded");
        }

        return window.SKHPSBackend.call("health");
      })
      .then(function(response){
        if(response && response.ok){
          state.apiText =
            "OK" +
            (response.env ? " / " + response.env : "");
        } else {
          state.apiText = "failed";
        }

        renderFooter(state);
      })
      .catch(function(error){
        state.apiText = "failed";
        renderFooter(state);
      });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();