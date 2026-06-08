(function(){
  var state = {
    config: null,
    version: null
  };

  function loadJson(url){
    return fetch(url, {
      cache: "no-store"
    }).then(function(response){
      if(!response.ok){
        throw new Error(url + " failed: HTTP " + response.status);
      }

      return response.json();
    });
  }

  function loadConfig(){
    if(state.config){
      return Promise.resolve(state.config);
    }

    return loadJson("config.json").then(function(config){
      state.config = config;
      window.SKHPS_CONFIG = config;
      return config;
    });
  }

  function loadVersion(){
    return loadConfig().then(function(config){
      var versionUrl = config.versionUrl || "version.json";

      return loadJson(versionUrl).then(function(version){
        state.version = version;
        window.SKHPS_VERSION = version;
        return version;
      });
    });
  }

  function getConfig(){
    return state.config || window.SKHPS_CONFIG || null;
  }

  function getVersion(){
    return state.version || window.SKHPS_VERSION || null;
  }

  window.SKHPSConfig = {
    loadJson: loadJson,
    loadConfig: loadConfig,
    loadVersion: loadVersion,
    getConfig: getConfig,
    getVersion: getVersion
  };
})();