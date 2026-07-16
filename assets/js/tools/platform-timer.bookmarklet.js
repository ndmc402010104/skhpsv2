(() => {
  const TAG = 'SKH_PLATFORM_TIMER_V2';

  // ===== 可調設定 =====
  const TARGET_HOUR = 18;
  const TARGET_MIN = 0;
  const TARGET_SEC = 0;
  const AFTER_TARGET_DELAY_MS = 250;
  const GAP_MS = 650;

  // true = 開啟申請視窗後自動按「是」；會真的送出
  const AUTO_CONFIRM_YES = true;

  // 預設篩選條件
  const REQUIRE_INPATIENT_SURGERY = true;
  const REQUIRE_ROOM3 = true;
  // ===================

  ['SKH_PLATFORM_TIMER_V1', 'SKH_PLATFORM_TIMER_V2', 'SKH_QUICK_PLATFORM_V1'].forEach(id => {
    document.getElementById(id)?.remove();
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const unwrap = v => {
    try {
      return typeof ko !== 'undefined' && ko.unwrap
        ? ko.unwrap(v)
        : (typeof v === 'function' ? v() : v);
    } catch {
      return v;
    }
  };

  const clean = s => String(s ?? '').replace(/\s+/g, '');

  const visible = el => {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
  };

  const waitFor = async (getter, timeoutMs = 2500, intervalMs = 35) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const v = getter();
      if (v) return v;
      await sleep(intervalMs);
    }
    return null;
  };

  const getAllValuesByKey = (d, keyRe) => {
    return Object.entries(d || {})
      .filter(([k]) => keyRe.test(k))
      .map(([k, v]) => ({ key: k, value: unwrap(v) }))
      .filter(x => x.value !== undefined && x.value !== null && String(x.value).trim() !== '');
  };

  const findApplyFn = d => {
    const preferred = [
      'openApplyPalformClick',
      'openApplyPlatformClick',
      'applyPalformClick',
      'applyPlatformClick'
    ];

    for (const k of preferred) {
      if (typeof d?.[k] === 'function') return { key: k, fn: d[k] };
    }

    for (const [k, v] of Object.entries(d || {})) {
      if (typeof v !== 'function') continue;
      let hit = /palform|platform|跳台|apply/i.test(k);
      try {
        hit = hit || /ApplyPalformInfo|applyPalformInfo|palform|platform|跳台/i.test(String(v));
      } catch {}
      if (hit) return { key: k, fn: v };
    }

    return null;
  };

  const getSourceText = (d, tr) => {
    const direct = [
      unwrap(d.OperationSourceCodeName),
      unwrap(d.SourceCodeName),
      unwrap(d.OperationSourceTypeName),
      unwrap(d.OperationSourceCode),
      unwrap(d.SourceCode)
    ].filter(Boolean);

    const byKey = getAllValuesByKey(d, /source|來源|OperationSource/i)
      .map(x => x.value);

    const rowHit = (tr?.innerText || '').match(/住院手術|門診手術|急診手術/);

    return [...direct, ...byKey, rowHit?.[0]]
      .filter(Boolean)
      .map(String)
      .join(' / ');
  };

  const isInpatientSurgery = (d, tr) => {
    const source = getSourceText(d, tr);
    return /住院手術/.test(source);
  };

  const roomValueIs3 = v => {
    const s = clean(v);
    if (!s) return false;

    // 精準值：03、3、三房、第三房、第3房
    if (/^(0?3|三房|第?三房|第?3房)$/.test(s)) return true;

    // 避免 13 被判成 3：前後都不能是數字
    return /(^|[^\d])0?3([^\d]|$)/.test(` ${s} `) && !/13/.test(s);
  };

  const getRoomCandidates = (d, tr) => {
    const direct = [
      unwrap(d.OperationRoomNo),
      unwrap(d.OperationRoomCode),
      unwrap(d.OperationRoomCodeName),
      unwrap(d.OperationRoomName),
      unwrap(d.OperatingRoomNo),
      unwrap(d.OperatingRoomCode),
      unwrap(d.OperatingRoomName),
      unwrap(d.RoomNo),
      unwrap(d.RoomCode),
      unwrap(d.RoomName),
      unwrap(d.ORRoomNo),
      unwrap(d.ORRoomName)
    ].filter(Boolean);

    const byKey = getAllValuesByKey(
      d,
      /room|operatingroom|operationroom|oproom|orroom|theater|theatre|knife|刀房|房間|房號/i
    ).map(x => x.value);

    const tokens = String(tr?.innerText || '')
      .split(/\s+/)
      .filter(Boolean)
      .filter(t => /^(0?3|三房|第?三房|第?3房)$/.test(clean(t)));

    return [...direct, ...byKey, ...tokens].filter(Boolean);
  };

  const isRoom3 = (d, tr) => {
    return getRoomCandidates(d, tr).some(roomValueIs3);
  };

  const getRoomText = (d, tr) => {
    const c = getRoomCandidates(d, tr).map(String);
    return c.length ? [...new Set(c)].join(' / ') : '';
  };

  const getRowText = (d, tr) => {
    const name = unwrap(d.PatientName) || '';
    const mrn = unwrap(d.MedicalNoteNo) || '';
    const opId = unwrap(d.OperationAppointId) || '';
    const source = getSourceText(d, tr);
    const room = getRoomText(d, tr);
    const level = unwrap(d.OperationLevelCodeName) || '';
    const status = unwrap(d.ReservationStatusCodeName) || '';
    const available = unwrap(d.IsPlatformAvailable);

    return [
      name && `姓名:${name}`,
      mrn && `病歷:${mrn}`,
      opId && `預約ID:${opId}`,
      source && `來源:${source}`,
      room && `刀房:${room}`,
      level && `等級:${level}`,
      status && `狀態:${status}`,
      `跳台可用:${available}`
    ].filter(Boolean).join(' / ');
  };

  const rawRows = [...document.querySelectorAll('tr')]
    .map(tr => {
      try {
        const d = ko.dataFor(tr);
        if (!d || typeof d !== 'object') return null;

        const fnInfo = findApplyFn(d);
        const opId = unwrap(d.OperationAppointId);

        if (!fnInfo || !opId) return null;

        const inpatient = isInpatientSurgery(d, tr);
        const room3 = isRoom3(d, tr);
        const matched =
          (!REQUIRE_INPATIENT_SURGERY || inpatient) &&
          (!REQUIRE_ROOM3 || room3);

        return {
          tr,
          d,
          opId: String(opId),
          name: unwrap(d.PatientName) || '',
          mrn: unwrap(d.MedicalNoteNo) || '',
          available: unwrap(d.IsPlatformAvailable),
          inpatient,
          room3,
          matched,
          sourceText: getSourceText(d, tr),
          roomText: getRoomText(d, tr),
          fnInfo,
          text: getRowText(d, tr)
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const seen = new Set();
  const rows = rawRows.filter(r => {
    if (seen.has(r.opId)) return false;
    seen.add(r.opId);
    return true;
  });

  let armed = false;
  let running = false;
  let fired = false;
  let serverOffsetMs = 0;

  const nowServer = () => new Date(Date.now() + serverOffsetMs);

  const getTargetTime = () => {
    const n = nowServer();
    const t = new Date(n);
    t.setHours(TARGET_HOUR, TARGET_MIN, TARGET_SEC, AFTER_TARGET_DELAY_MS);
    return t;
  };

  const fmtMs = ms => {
    const neg = ms < 0;
    ms = Math.abs(ms);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const x = Math.floor(ms % 1000);
    return `${neg ? '-' : ''}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`;
  };

  const panel = document.createElement('div');
  panel.id = TAG;
  panel.style.cssText = `
    position: fixed;
    right: 10px;
    top: 10px;
    z-index: 2147483646;
    width: min(560px, calc(100vw - 20px));
    max-height: 88vh;
    overflow: auto;
    background: #fff;
    color: #111;
    border: 2px solid #222;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(0,0,0,.28);
    font-size: 13px;
    line-height: 1.45;
    padding: 12px;
  `;

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
      <b>18:00 跳台倒數自動送出 v2</b>
      <button id="${TAG}_close" class="btn btn-xs btn-default">關閉</button>
    </div>

    <div style="padding:8px;border:1px solid #ffeeba;background:#fff3cd;border-radius:6px;margin-bottom:8px;">
      預設篩選：<b>住院手術 + 三房</b>。時間到後會對勾選列開啟原生跳台申請，並自動按「是」。
    </div>

    <div style="display:grid;grid-template-columns:120px 1fr;gap:4px 8px;margin-bottom:8px;">
      <div>目標時間</div><div id="${TAG}_target">--</div>
      <div>伺服器校時</div><div id="${TAG}_offset">尚未校時</div>
      <div>倒數</div><div id="${TAG}_count" style="font-size:22px;font-weight:700;">--</div>
      <div>狀態</div><div id="${TAG}_status">未武裝</div>
    </div>

    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
      <button id="${TAG}_sync" class="btn btn-sm btn-default">校正伺服器時間</button>
      <button id="${TAG}_selectMatched" class="btn btn-sm skh-btn skh-btn-primary">選住院+三房</button>
      <button id="${TAG}_selectInpatient" class="btn btn-sm btn-default">只選住院手術</button>
      <button id="${TAG}_selectRoom3" class="btn btn-sm btn-default">只選三房</button>
      <button id="${TAG}_selectNone" class="btn btn-sm btn-default">全不選</button>
      <button id="${TAG}_arm" class="btn btn-sm btn-danger">武裝倒數</button>
      <button id="${TAG}_disarm" class="btn btn-sm btn-warning">解除</button>
    </div>

    <div style="margin-bottom:6px;color:#555;">
      找到 ${rows.length} 筆可呼叫跳台函式的列；
      符合「住院手術+三房」：${rows.filter(r => r.matched).length} 筆。
    </div>

    <div id="${TAG}_list"></div>

    <pre id="${TAG}_log" style="margin-top:8px;max-height:130px;overflow:auto;background:#111;color:#ddd;padding:8px;border-radius:6px;font-size:12px;"></pre>
  `;

  document.body.appendChild(panel);

  const $ = id => document.getElementById(`${TAG}_${id}`);
  const logEl = $('log');

  const log = msg => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    console.log('[跳台倒數]', msg);
    logEl.textContent += line + '\n';
    logEl.scrollTop = logEl.scrollHeight;
  };

  const setStatus = msg => {
    $('status').textContent = msg;
  };

  $('close').onclick = () => panel.remove();

  const list = $('list');

  if (!rows.length) {
    list.innerHTML = `
      <div style="padding:8px;background:#f8d7da;border:1px solid #f5c2c7;border-radius:6px;">
        沒抓到可用列。請確認表格已載入完成。
      </div>
    `;
  } else {
    rows.forEach((r, idx) => {
      const box = document.createElement('label');
      const badgeBg = r.matched ? '#e8f7ee' : '#fafafa';
      const badgeText = [
        r.inpatient ? '住院✓' : '非住院',
        r.room3 ? '三房✓' : '非三房'
      ].join(' / ');

      box.style.cssText = `
        display:block;
        border:1px solid ${r.matched ? '#8fd19e' : '#ddd'};
        border-radius:8px;
        padding:8px;
        margin-bottom:6px;
        background:${badgeBg};
        cursor:pointer;
      `;

      box.innerHTML = `
        <div style="display:flex;gap:8px;align-items:flex-start;">
          <input type="checkbox" class="${TAG}_check" data-idx="${idx}" ${r.matched ? 'checked' : ''} style="margin-top:3px;">
          <div>
            <div style="font-weight:700;">#${idx + 1} ${r.name || ''} / ${r.mrn || ''}</div>
            <div style="margin:2px 0;">
              <span style="display:inline-block;padding:1px 6px;border-radius:999px;background:${r.matched ? '#cdeed6' : '#eee'};">
                ${badgeText}
              </span>
            </div>
            <div>${r.text}</div>
            <div style="font-size:12px;color:#666;">呼叫函式：${r.fnInfo.key}</div>
          </div>
        </div>
      `;

      list.appendChild(box);
    });
  }

  const getSelectedRows = () => {
    return [...document.querySelectorAll(`.${TAG}_check:checked`)]
      .map(chk => rows[Number(chk.dataset.idx)])
      .filter(Boolean);
  };

  const selectBy = predicate => {
    document.querySelectorAll(`.${TAG}_check`).forEach(chk => {
      const r = rows[Number(chk.dataset.idx)];
      chk.checked = !!predicate(r);
    });
    log(`目前勾選 ${getSelectedRows().length} 筆`);
  };

  $('selectMatched').onclick = () => selectBy(r => r.matched);
  $('selectInpatient').onclick = () => selectBy(r => r.inpatient);
  $('selectRoom3').onclick = () => selectBy(r => r.room3);
  $('selectNone').onclick = () => selectBy(() => false);

  const findYesButton = () => {
    const buttons = [
      ...document.querySelectorAll('.bootbox.modal.in button[data-bb-handler="confirm"]'),
      ...document.querySelectorAll('.modal.in button[data-bb-handler="confirm"]'),
      ...document.querySelectorAll('button[data-bb-handler="confirm"]')
    ];

    return buttons.find(btn => visible(btn) && /是|確定|確認|Yes|OK/i.test(btn.innerText || btn.textContent || ''));
  };

  const runOne = async (r, i, total) => {
    log(`第 ${i + 1}/${total} 筆：${r.name} / ${r.mrn} / 預約ID:${r.opId} / ${r.inpatient ? '住院' : '非住院'} / ${r.room3 ? '三房' : '非三房'}`);

    try {
      r.fnInfo.fn.call(r.d, r.d);
    } catch (err) {
      console.error(err);
      log(`失敗：openApplyPalformClick 呼叫錯誤：${err.message || err}`);
      return;
    }

    if (!AUTO_CONFIRM_YES) {
      log('AUTO_CONFIRM_YES=false，已停在申請視窗，請手動按是');
      return;
    }

    const yesBtn = await waitFor(findYesButton, 2500, 35);

    if (!yesBtn) {
      log(`找不到「是」按鈕：${r.name} / ${r.mrn}`);
      return;
    }

    log(`自動按「是」：${r.name} / ${r.mrn}`);
    yesBtn.click();

    await sleep(GAP_MS);
  };

  const runSelected = async () => {
    if (running || fired) return;

    const selected = getSelectedRows();
    if (!selected.length) {
      armed = false;
      setStatus('沒有勾選任何列，已取消');
      log('沒有勾選任何列，取消執行');
      return;
    }

    running = true;
    fired = true;
    armed = false;

    setStatus(`執行中：0/${selected.length}`);
    log(`開始執行，共 ${selected.length} 筆，間隔 ${GAP_MS}ms`);

    for (let i = 0; i < selected.length; i++) {
      setStatus(`執行中：${i + 1}/${selected.length}`);
      await runOne(selected[i], i, selected.length);
    }

    setStatus('已執行完畢');
    log('全部勾選列已執行完畢');
    running = false;
  };

  $('arm').onclick = () => {
    const selected = getSelectedRows();

    if (!selected.length) {
      alert('請先勾選要搶的病人。');
      return;
    }

    const nonMatched = selected.filter(r => !r.matched).length;

    const msg =
      `確定武裝倒數？\n\n` +
      `時間到會自動對 ${selected.length} 筆送出跳台申請。\n` +
      `其中符合「住院手術+三房」：${selected.length - nonMatched} 筆\n` +
      `不符合預設條件：${nonMatched} 筆\n\n` +
      `請確認沒有勾錯。`;

    if (!confirm(msg)) return;

    armed = true;
    fired = false;
    setStatus(`已武裝，等待 ${TARGET_HOUR}:00`);
    log(`已武裝，選取 ${selected.length} 筆；不符合預設條件 ${nonMatched} 筆`);
  };

  $('disarm').onclick = () => {
    armed = false;
    setStatus('已解除');
    log('已解除武裝');
  };

  const syncServerClock = async () => {
    try {
      const start = Date.now();
      const res = await fetch(location.href, {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'same-origin'
      });
      const end = Date.now();
      const dateHeader = res.headers.get('date');

      if (!dateHeader) {
        serverOffsetMs = 0;
        $('offset').textContent = '抓不到 Date header，使用本機時間';
        log('抓不到 Date header，使用本機時間');
        return;
      }

      const serverMs = Date.parse(dateHeader);
      const approxLocalAtResponse = (start + end) / 2;
      serverOffsetMs = serverMs - approxLocalAtResponse;

      $('offset').textContent = `${serverOffsetMs >= 0 ? '+' : ''}${Math.round(serverOffsetMs)} ms`;
      log(`伺服器校時完成：offset=${Math.round(serverOffsetMs)}ms`);
    } catch (err) {
      serverOffsetMs = 0;
      $('offset').textContent = '校時失敗，使用本機時間';
      log(`校時失敗，使用本機時間：${err.message || err}`);
    }
  };

  $('sync').onclick = syncServerClock;

  const tick = () => {
    const target = getTargetTime();
    const n = nowServer();
    const diff = target.getTime() - n.getTime();

    $('target').textContent = target.toLocaleTimeString() + `.${String(AFTER_TARGET_DELAY_MS).padStart(3, '0')}`;
    $('count').textContent = diff > 0 ? fmtMs(diff) : '00:00:00.000';

    if (armed && !running && !fired && diff <= 0) {
      runSelected();
    }
  };

  setInterval(tick, 50);
  tick();

  syncServerClock();

  log(`面板已建立。預設已勾選：住院手術 + 三房，共 ${rows.filter(r => r.matched).length} 筆。`);
})();
