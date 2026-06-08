window.SKHPS_ROUTE_CONFIG = {
  app: 'skhpsv2',
  stage: 'css-ui-foundation',

  routes: {
    'portal.home': {
      label: '前台首頁',
      type: 'internal',
      href: 'index.html',
      description: 'skhpsv2 前台 Portal 首頁'
    },

    'portal.admin': {
      label: '後台入口',
      type: 'internal',
      href: 'admin.html',
      description: 'skhpsv2 後台入口'
    },


    'qr.signIn': {
      label: '晨會 QR 簽到',
      type: 'placeholder',
      href: '#',
      description: '未來連接晨會 QR 簽到功能，目前只作為按鈕與 route placeholder'
    },

    'qr.generator': {
      label: '晨會 QR 產生',
      type: 'placeholder',
      href: '#',
      description: '未來連接晨會 QR 產生頁，目前只作為 route placeholder'
    },

    'qr.admin': {
      label: '晨會簽到後台',
      type: 'placeholder',
      href: '#',
      description: '未來連接晨會簽到後台，目前只作為 route placeholder'
    },

    'api.health': {
      label: 'API Health Check',
      type: 'placeholder',
      href: '#',
      description: '未來連接 Apps Script health check，目前不連線'
    }
  }
};

/*
*/
window.SKHPS_UI_SET_ROUTE =;