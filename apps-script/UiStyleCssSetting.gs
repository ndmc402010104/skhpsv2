const UI_STYLE_COMPONENT =
  'base';

const UI_STYLE_SHEET_NAME =
  '00_基礎';


/* =========================================================
   00 UiStyle CSS DB
   功能：
   1. 第一次讀取時，如果沒有 00_基礎 Sheet，會自動建立
   2. 如果 Sheet 已存在但缺 token，會自動補齊
   3. 不會清掉既有設定
   4. setupCssDb_00Style() 保留為「手動重建」用

   依賴：
   - CSS_DB_SPREADSHEET_ID
   - DEFAULT_MARK
   - CSS_DB_HEADER
   - getOrCreateCssSheet_()
   - ensureCssDbHeader_()
   - writeCssDbHeader_()
   - formatCssDbSheet_()

   以上已在 01_按鈕/ButtonCssSetting.gs 裡存在。
   所以這支不要重複宣告那些 const。
========================================================= */


/* 手動重建：會清空 00_基礎，重新寫入全部 default + current */
function setupCssDb_00Style(){

  const ss =
    SpreadsheetApp.openById(
      CSS_DB_SPREADSHEET_ID
    );

  const sh =
    getOrCreateCssSheet_(
      ss,
      UI_STYLE_SHEET_NAME
    );

  sh.clear();

  writeCssDbHeader_(
    sh
  );

  const rows =
    buildBaseRows_(
      true
    );

  sh
    .getRange(
      2,
      1,
      rows.length,
      CSS_DB_HEADER.length
    )
    .setValues(
      rows
    );

  formatCssDbSheet_(
    sh
  );

}


/* 讀目前系統設定：updatedAt 不是 default 的最新值 */
function getBaseCssSettings(){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  return getBaseCssSettingsByDefaultMark_(
    false
  );

}


/* 讀 default：updatedAt 是 default */
function getBaseDefaultCssSettings(){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  return getBaseCssSettingsByDefaultMark_(
    true
  );

}


function getBaseCssSettingsByDefaultMark_(
  wantDefault
){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  const values =
    sh
      .getDataRange()
      .getValues();

  const result = {};
  const latestMap = {};

  for(let i = 1; i < values.length; i++){

    const row =
      values[i];

    const component =
      row[0];

    const className =
      row[1];

    const property =
      row[2];

    const value =
      row[3];

    const updatedAt =
      row[5];

    const isDefault =
      String(updatedAt).trim() === DEFAULT_MARK;

    if(component !== UI_STYLE_COMPONENT){
      continue;
    }

    if(wantDefault !== isDefault){
      continue;
    }

    const key =
      className + '|' + property;

    /*
      default 理論上一筆。
      current 如果歷史上有重複列，吃最後一筆。
    */
    latestMap[key] = {
      className:className,
      property:property,
      value:value,
      rowIndex:i
    };

  }

  Object.keys(latestMap).forEach(function(key){

    const item =
      latestMap[key];

    if(!result[item.className]){
      result[item.className] = {};
    }

    result[item.className][item.property] =
      item.value;

  });

  return result;

}


/* 儲存目前系統設定 */
function saveBaseCssSetting(
  className,
  property,
  value
){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  return saveBaseCssSetting_(
    className,
    property,
    value,
    new Date()
  );

}


/* 設為新 default */
function saveBaseDefaultCssSetting(
  className,
  property,
  value
){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  return saveBaseCssSetting_(
    className,
    property,
    value,
    DEFAULT_MARK
  );

}


function saveBaseCssSetting_(
  className,
  property,
  value,
  updatedAtValue
){

  const sh =
    getOrCreateBaseSheet_();

  ensureBaseRows_(
    sh
  );

  const values =
    sh
      .getDataRange()
      .getValues();

  const wantDefault =
    String(updatedAtValue).trim() === DEFAULT_MARK;

  for(let i = 1; i < values.length; i++){

    const row =
      values[i];

    const isDefaultRow =
      String(row[5]).trim() === DEFAULT_MARK;

    if(
      row[0] === UI_STYLE_COMPONENT &&
      row[1] === className &&
      row[2] === property &&
      isDefaultRow === wantDefault
    ){

      sh
        .getRange(i + 1,4)
        .setValue(value);

      sh
        .getRange(i + 1,6)
        .setValue(updatedAtValue);

      return {
        ok:true,
        updated:true
      };

    }

  }

  sh.appendRow([
    UI_STYLE_COMPONENT,
    className,
    property,
    value,
    getBaseDescription_(
      className,
      property
    ),
    updatedAtValue
  ]);

  formatCssDbSheet_(
    sh
  );

  return {
    ok:true,
    inserted:true
  };

}


/* =========================================================
   Sheet 建立 / 補齊
========================================================= */


function getOrCreateBaseSheet_(){

  const ss =
    SpreadsheetApp.openById(
      CSS_DB_SPREADSHEET_ID
    );

  const sh =
    getOrCreateCssSheet_(
      ss,
      UI_STYLE_SHEET_NAME
    );

  ensureCssDbHeader_(
    sh
  );

  return sh;

}


function ensureBaseRows_(
  sh
){

  ensureCssDbHeader_(
    sh
  );

  const values =
    sh
      .getDataRange()
      .getValues();

  const existing = {};

  for(let i = 1; i < values.length; i++){

    const row =
      values[i];

    if(row[0] !== UI_STYLE_COMPONENT){
      continue;
    }

    const isDefault =
      String(row[5]).trim() === DEFAULT_MARK;

    const mode =
      isDefault
      ? 'default'
      : 'current';

    const key =
      mode + '|' + row[1] + '|' + row[2];

    existing[key] =
      true;

  }

  const missingRows = [];

  getBaseDefaultTokens_().forEach(function(item){

    const defaultKey =
      'default|' +
      item.className +
      '|' +
      item.property;

    if(!existing[defaultKey]){

      missingRows.push([
        UI_STYLE_COMPONENT,
        item.className,
        item.property,
        item.value,
        item.description,
        DEFAULT_MARK
      ]);

    }

    const currentKey =
      'current|' +
      item.className +
      '|' +
      item.property;

    if(!existing[currentKey]){

      missingRows.push([
        UI_STYLE_COMPONENT,
        item.className,
        item.property,
        item.value,
        item.description,
        new Date()
      ]);

    }

  });

  if(missingRows.length > 0){

    sh
      .getRange(
        sh.getLastRow() + 1,
        1,
        missingRows.length,
        CSS_DB_HEADER.length
      )
      .setValues(
        missingRows
      );

    formatCssDbSheet_(
      sh
    );

  }

}


/* =========================================================
   UiStyle 預設 token
========================================================= */


function buildBaseRows_(
  includeCurrent
){

  const rows = [];

  getBaseDefaultTokens_().forEach(function(item){

    rows.push([
      UI_STYLE_COMPONENT,
      item.className,
      item.property,
      item.value,
      item.description,
      DEFAULT_MARK
    ]);

    if(includeCurrent){

      rows.push([
        UI_STYLE_COMPONENT,
        item.className,
        item.property,
        item.value,
        item.description,
        new Date()
      ]);

    }

  });

  return rows;

}


function getBaseDescription_(
  className,
  property
){

  const found =
    getBaseDefaultTokens_().find(function(item){
      return (
        item.className === className &&
        item.property === property
      );
    });

  return found
    ? found.description
    : className + ' ' + property;

}


function getBaseDefaultTokens_(){

  return [

    /* Brand */
    baseToken_('brand','primary','#344f9f','Brand primary'),
    baseToken_('brand','primarySoft','#eef3ff','Brand primary soft'),
    baseToken_('brand','danger','#b42318','Brand danger'),
    baseToken_('brand','success','#15803d','Brand success'),
    baseToken_('brand','warning','#b45309','Brand warning'),

    /* Page */
    baseToken_('page','bg','#f4f7fb','Page background'),
    baseToken_('page','text','#0f172a','Page text'),
    baseToken_('page','muted','#64748b','Page muted text'),

    /* Surface */
    baseToken_('surface','bg','#ffffff','Surface background'),
    baseToken_('surface','border','#cbd5e1','Surface border'),
    baseToken_('surface','shadow','0 8px 24px rgba(15,23,42,.06)','Surface shadow'),

    /* Radius */
    baseToken_('radius','base','10px','Radius base'),
    baseToken_('radius','sm','6px','Radius small'),
    baseToken_('radius','lg','16px','Radius large'),
    baseToken_('radius','pill','999px','Radius pill'),

    /* Spacing */
    baseToken_('space','xs','4px','Spacing xs'),
    baseToken_('space','sm','8px','Spacing sm'),
    baseToken_('space','md','12px','Spacing md'),
    baseToken_('space','lg','16px','Spacing lg'),
    baseToken_('space','xl','24px','Spacing xl'),

    /* Font */
    baseToken_('font','family','system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif','Font family'),
    baseToken_('font','size','14px','Font size'),
    baseToken_('font','sizeSm','13px','Font size small'),
    baseToken_('font','sizeLg','16px','Font size large'),
    baseToken_('font','weight','500','Font weight'),
    baseToken_('font','weightBold','700','Font weight bold'),
    baseToken_('font','lineHeight','1.6','Line height'),

    /* Motion */
    baseToken_('motion','duration','.18s','Transition duration'),
    baseToken_('motion','easing','ease','Transition easing'),

    /* Layout */
    baseToken_('layout','containerMaxWidth','1200px','Container max width'),
    baseToken_('layout','containerPadding','24px','Container padding'),
    baseToken_('layout','sectionGap','24px','Section gap')

  ];

}


function baseToken_(
  className,
  property,
  value,
  description
){

  return {
    className:className,
    property:property,
    value:value,
    description:description
  };

}
