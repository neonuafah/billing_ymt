/* app.js — ตัวควบคุมหลักของแอป (รองรับ หน่วยธุรกิจ + ข้อมูลรายเดือน) */
(function () {
  'use strict';
  const P = window.AdsParser, R = window.AdsRecommend, AI = window.AdsAI, U = window.AdsUnits;

  // ---------- config ----------
  const PLATFORMS = ['facebook', 'google', 'tiktok'];
  const LABEL = { facebook: 'Facebook Ads', google: 'Google Ads', tiktok: 'TikTok Ads' };
  const SHORT = { facebook: 'Facebook', google: 'Google', tiktok: 'TikTok' };
  const COLOR = { facebook: '#1877f2', google: '#34a853', tiktok: '#888' };
  const TAGCLASS = { facebook: 'fb', google: 'gg', tiktok: 'tt' };
  const UNIT_COLOR = {
    bigfan: '#5b8cff', industrial: '#34c77b', supply: '#ffb547', group: '#a374ff',
    fnb: '#ff5c6c', denki: '#23c2c2', ymt: '#ff8e3c', system: '#8a93a6',
    solution: '#e368c9', rental: '#aee35a', unassigned: '#555b66',
  };

  // ---------- state / ชั้นเก็บข้อมูล ----------
  // เก็บข้อมูลได้ 2 โหมด แล้วสลับให้อัตโนมัติ (ไฟล์ชุดเดียวใช้ได้ทั้งแบบ static และบน Plesk):
  //   useServer = true  → เก็บบนเซิร์ฟเวอร์ (MySQL ผ่าน api/data.php) ทุกคนเห็นข้อมูลชุดเดียวกัน
  //   useServer = false → เก็บใน localStorage ของเบราว์เซอร์ (รันแบบ static / ไม่มี PHP)
  const STORE_KEY = 'ads_store_v1';
  const API_URL = 'api/data.php';
  let useServer = false;

  const state = {
    store: {},           // { 'YYYY-MM': { facebook:[], google:[], tiktok:[] } } — เติมค่าใน bootStore()
    month: null,         // เดือนที่กำลังแสดง
    unit: 'all',         // หน่วยธุรกิจที่กรอง
    targets: Object.assign({}, R.DEFAULT_TARGETS),
    charts: {},
  };

  function loadTargets() {
    try { return Object.assign({}, R.DEFAULT_TARGETS, JSON.parse(localStorage.getItem('ads_targets')) || {}); }
    catch { return Object.assign({}, R.DEFAULT_TARGETS); }
  }
  function saveTargets() {
    if (useServer) enqueue({ action: 'saveTargets', targets: state.targets });
    else { try { localStorage.setItem('ads_targets', JSON.stringify(state.targets)); } catch {} }
  }

  // รีเฟรช derived + หน่วยธุรกิจตามกฎล่าสุด เผื่อกฎมีการอัปเดต
  // (คงค่าหน่วยธุรกิจที่บันทึกไว้ เช่น ที่มาจากชื่อไฟล์ ถ้าไม่มีค่อย detect จากชื่อแคมเปญ)
  function normalizeStore(s) {
    s = s || {};
    for (const m in s) {
      for (const p of PLATFORMS) {
        s[m][p] = (s[m][p] || []).map((r) => { const d = P.computeDerived(r); if (!d.unit) d.unit = U.detect(d.campaign); return d; });
      }
    }
    return s;
  }

  // ---- โหลดข้อมูลตอนเปิดแอป: ลองเซิร์ฟเวอร์ (MySQL) ก่อน ถ้าต่อไม่ได้ค่อย fallback localStorage ----
  async function bootStore() {
    try {
      const res = await fetch(API_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('api');
      const j = await res.json();
      if (!j || j.ok !== true) throw new Error('api');
      useServer = true;
      state.store = normalizeStore(j.store || {});
      state.targets = Object.assign({}, R.DEFAULT_TARGETS, j.targets || {});
    } catch {
      // เซิร์ฟเวอร์ไม่พร้อม (เช่นเปิดแบบ static / ไม่มี PHP) → ใช้ข้อมูลในเบราว์เซอร์แทน
      useServer = false;
      try { state.store = normalizeStore(JSON.parse(localStorage.getItem(STORE_KEY)) || {}); } catch { state.store = {}; }
      state.targets = loadTargets();
    }
  }

  // POST ไปเซิร์ฟเวอร์ (toast เตือนเมื่อพลาด เพื่อให้รู้ว่ายังไม่ถูกบันทึกถาวร)
  async function persist(body) {
    try {
      const res = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok || !j || j.ok !== true) throw new Error((j && j.error) || 'save');
    } catch (e) {
      toast('บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ — ลองอีกครั้ง' + (e && e.message ? ' (' + e.message + ')' : ''));
    }
  }

  // ---- คิวบันทึกแบบต่อคิว กันยิง POST พร้อมกันแล้วทับกันเองตอนอัปหลายไฟล์เร็วๆ ----
  // (คำขอสุดท้ายอ่าน state.store ล่าสุดเสมอ ข้อมูลจึงครบ ไม่ถูกคำขอเก่าที่ข้อมูลน้อยกว่าทับ)
  let saveChain = Promise.resolve();
  function enqueue(body) {
    saveChain = saveChain.then(() => persist(body)).catch(() => {});
    return saveChain;
  }

  // ---- บันทึกข้อมูลทุกเดือน ----
  // เซิร์ฟเวอร์: upsert ทุกเดือนที่มีในหน่วยความจำ (ไม่ลบเดือนที่คนอื่นเพิ่งเพิ่ม) — การลบใช้ deleteMonth แยก
  function saveStore() {
    if (useServer) {
      enqueue({ action: 'save', store: state.store });
    } else {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state.store)); }
      catch (e) { toast('บันทึกข้อมูลไม่สำเร็จ — พื้นที่เบราว์เซอร์อาจเต็ม'); }
    }
  }

  // ใช้เมื่อมีการลบ "ทั้งเดือน" ออกจาก state แล้ว ให้ลบบนเซิร์ฟเวอร์ด้วย (โหมด local ใช้ saveStore เขียนทับทั้งก้อนพอ)
  function persistDeleteMonth(m) {
    if (useServer) enqueue({ action: 'deleteMonth', month: m });
    else saveStore();
  }

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const baht = (n) => '฿' + Math.round(n || 0).toLocaleString('th-TH');
  const intf = (n) => Math.round(n || 0).toLocaleString('th-TH');
  const f2 = (n) => (n || 0).toFixed(2);
  const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 3000);
  }
  function destroyChart(id) { if (state.charts[id]) { state.charts[id].destroy(); delete state.charts[id]; } }

  // ---------- data access (เคารพเดือน + ฟิลเตอร์หน่วยธุรกิจ) ----------
  function ensureMonth(m) { if (!state.store[m]) state.store[m] = { facebook: [], google: [], tiktok: [] }; return state.store[m]; }
  function monthsAvailable() { return Object.keys(state.store).filter((m) => PLATFORMS.some((p) => state.store[m][p].length)).sort(); }
  function monthData() { return state.store[state.month] || { facebook: [], google: [], tiktok: [] }; }
  function filterUnit(recs) { return state.unit === 'all' ? recs : recs.filter((r) => r.unit === state.unit); }
  function recordsFor(platform) { return filterUnit(monthData()[platform] || []); }
  function allRecords() { return PLATFORMS.flatMap((p) => recordsFor(p)); }
  function allRecordsUnfiltered() { return PLATFORMS.flatMap((p) => monthData()[p] || []); }
  function allRecordsForMonth(m) { const d = state.store[m] || { facebook: [], google: [], tiktok: [] }; return filterUnit(PLATFORMS.flatMap((p) => d[p] || [])); }
  function hasAnyData() { return allRecords().length > 0; }

  // ---------- navigation ----------
  const TITLES = {
    overview: ['ภาพรวมทุกแพลตฟอร์ม', ''],
    facebook: ['Facebook Ads', 'รายละเอียดแคมเปญบน Facebook'],
    google: ['Google Ads', 'รายละเอียดแคมเปญบน Google'],
    tiktok: ['TikTok Ads', 'รายละเอียดแคมเปญบน TikTok'],
    units: ['หน่วยธุรกิจ Yushi', 'สรุปแยกแต่ละหน่วยธุรกิจ ข้ามทุกแพลตฟอร์ม'],
    compare: ['เปรียบเทียบเดือน', 'ดูแนวโน้มทุกเดือนที่บันทึกไว้ ว่าเดือนไหนดี/แย่'],
    recommend: ['คำแนะนำการ optimize', 'สิ่งที่ควรทำเดือนหน้า เรียงตามผลกระทบ'],
    data: ['จัดการข้อมูล', 'อัปโหลด CSV และตั้งค่าเป้าหมาย'],
  };
  let currentView = 'overview';

  function subtitle() {
    const u = state.unit === 'all' ? 'ทุกหน่วยธุรกิจ' : U.label(state.unit);
    const m = state.month ? formatMonth(state.month) : '—';
    return `${m} · ${u}`;
  }

  function switchView(view) {
    currentView = view;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.add('hidden'));
    $('#view-' + view).classList.remove('hidden');
    $('#viewTitle').textContent = TITLES[view][0];
    $('#viewSubtitle').textContent = view === 'data' ? TITLES[view][1] : (TITLES[view][1] ? TITLES[view][1] + ' · ' + subtitle() : subtitle());
    render();
  }

  function render() {
    const v = currentView;
    if (v === 'overview') renderOverview();
    else if (PLATFORMS.includes(v)) renderPlatform(v);
    else if (v === 'units') renderUnits();
    else if (v === 'compare') renderCompare();
    else if (v === 'recommend') renderRecommend(false);
  }

  function formatMonth(m) {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    const names = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return names[parseInt(mo, 10) - 1] + ' ' + (parseInt(y, 10) + 543);
  }

  // ---------- KPI ----------
  function kpiCard(label, value, sub) {
    return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ''}</div>`;
  }
  function cpaClass(cpa) { if (!cpa) return ''; return cpa > state.targets.cpaTarget ? 'cell-bad' : 'cell-good'; }
  function roasClass(roas) { if (!roas) return ''; return roas >= state.targets.roasTarget ? 'cell-good' : 'cell-bad'; }

  function emptyState(emoji = '📊', msg) {
    msg = msg || `ยังไม่มีข้อมูลสำหรับ ${state.month ? formatMonth(state.month) : 'เดือนนี้'} — ไปที่ "จัดการข้อมูล" เพื่ออัปโหลด CSV หรือกด "โหลดข้อมูลตัวอย่าง"`;
    return `<div class="card" style="grid-column:1/-1"><div class="empty"><div class="empty-emoji">${emoji}</div>${msg}</div></div>`;
  }

  // ---------- OVERVIEW ----------
  function renderOverview() {
    const host = $('#overviewKpis');
    if (!hasAnyData()) { host.innerHTML = emptyState(); destroyChart('spend'); destroyChart('cmp'); $('#platformSummaryTable').innerHTML = ''; $('#unitSummaryTable').innerHTML = ''; return; }
    const totals = P.aggregate(allRecords());
    host.innerHTML =
      kpiCard('งบที่ใช้ทั้งหมด', baht(totals.spend)) +
      kpiCard('Impressions', intf(totals.impressions)) +
      kpiCard('Clicks', intf(totals.clicks), 'CTR ' + f2(totals.ctr) + '%') +
      kpiCard('Conversions', intf(totals.conversions), 'CPA ' + baht(totals.cpa)) +
      kpiCard('รายได้รวม', baht(totals.revenue)) +
      kpiCard('ROAS รวม', f2(totals.roas) + 'x', totals.roas >= state.targets.roasTarget ? '✅ ถึงเป้า' : '⚠️ ต่ำกว่าเป้า');

    const active = PLATFORMS.filter((p) => recordsFor(p).length);
    destroyChart('spend');
    state.charts.spend = new Chart($('#spendByPlatformChart'), {
      type: 'doughnut',
      data: { labels: active.map((p) => LABEL[p]), datasets: [{ data: active.map((p) => P.aggregate(recordsFor(p)).spend), backgroundColor: active.map((p) => COLOR[p]), borderWidth: 0 }] },
      options: chartOpts({ legend: true }),
    });
    destroyChart('cmp');
    state.charts.cmp = new Chart($('#platformCompareChart'), {
      type: 'bar',
      data: {
        labels: active.map((p) => LABEL[p]),
        datasets: [
          { label: 'ROAS (x)', data: active.map((p) => P.aggregate(recordsFor(p)).roas), backgroundColor: '#5b8cff' },
          { label: 'CTR (%)', data: active.map((p) => P.aggregate(recordsFor(p)).ctr), backgroundColor: '#a374ff' },
        ],
      },
      options: chartOpts({ legend: true }),
    });

    const rows = active.map((p) => {
      const a = P.aggregate(recordsFor(p));
      return `<tr><td>${LABEL[p]}</td><td>${a.campaigns}</td><td>${baht(a.spend)}</td><td>${intf(a.impressions)}</td><td>${intf(a.clicks)}</td><td>${f2(a.ctr)}%</td><td>${intf(a.conversions)}</td><td class="${cpaClass(a.cpa)}">${baht(a.cpa)}</td><td class="${roasClass(a.roas)}">${f2(a.roas)}x</td></tr>`;
    }).join('');
    $('#platformSummaryTable').innerHTML =
      `<thead><tr><th>แพลตฟอร์ม</th><th>แคมเปญ</th><th>งบ</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>Conv.</th><th>CPA</th><th>ROAS</th></tr></thead><tbody>${rows}</tbody>`;

    // สรุปรายบริษัท (หน่วยธุรกิจ) — แตกงบเป็นรายแพลตฟอร์ม Facebook / Google / TikTok
    const recs = allRecords();
    const groups = {};
    for (const r of recs) (groups[r.unit] = groups[r.unit] || []).push(r);
    const uorder = Object.keys(groups).sort((a, b) => P.aggregate(groups[b]).spend - P.aggregate(groups[a]).spend);
    const spendOf = (list, p) => P.aggregate(list.filter((r) => r.platform === p)).spend;
    const urows = uorder.map((uid) => {
      const list = groups[uid];
      const a = P.aggregate(list);
      const color = UNIT_COLOR[uid] || '#888';
      const fb = spendOf(list, 'facebook'), gg = spendOf(list, 'google'), tt = spendOf(list, 'tiktok');
      return `<tr>
        <td><span class="unit-dot" style="background:${color};margin-right:7px"></span>${U.label(uid)}</td>
        <td>${fb ? baht(fb) : '—'}</td>
        <td>${gg ? baht(gg) : '—'}</td>
        <td>${tt ? baht(tt) : '—'}</td>
        <td><b>${baht(a.spend)}</b></td>
        <td>${intf(a.conversions)}</td>
        <td class="${cpaClass(a.cpa)}">${a.cpa ? baht(a.cpa) : '—'}</td>
        <td class="${roasClass(a.roas)}">${a.roas ? f2(a.roas) + 'x' : '—'}</td>
      </tr>`;
    }).join('');
    // แถวรวมท้ายตาราง
    const tot = P.aggregate(recs);
    const totFb = spendOf(recs, 'facebook'), totGg = spendOf(recs, 'google'), totTt = spendOf(recs, 'tiktok');
    const tfoot = `<tr style="font-weight:700;border-top:2px solid var(--line)">
        <td>รวมทุกบริษัท</td>
        <td>${baht(totFb)}</td><td>${baht(totGg)}</td><td>${baht(totTt)}</td>
        <td>${baht(tot.spend)}</td><td>${intf(tot.conversions)}</td>
        <td>${tot.cpa ? baht(tot.cpa) : '—'}</td><td>${tot.roas ? f2(tot.roas) + 'x' : '—'}</td>
      </tr>`;
    $('#unitSummaryTable').innerHTML =
      `<thead><tr><th>บริษัท</th><th>🔵 Facebook</th><th>🟢 Google</th><th>⚫ TikTok</th><th>งบรวม</th><th>Conv.</th><th>CPA</th><th>ROAS</th></tr></thead><tbody>${urows}</tbody><tfoot>${tfoot}</tfoot>`;
  }

  // ---------- PLATFORM ----------
  function renderPlatform(p) {
    const host = $('#view-' + p);
    const recs = recordsFor(p);
    if (!recs.length) {
      host.innerHTML = `<div class="card"><div class="empty"><div class="empty-emoji">📤</div>ยังไม่มีข้อมูล ${LABEL[p]} สำหรับ ${formatMonth(state.month)}${state.unit !== 'all' ? ' (' + U.label(state.unit) + ')' : ''}<br/><span class="muted">อัปโหลดที่หน้า "จัดการข้อมูล"</span></div></div>`;
      return;
    }
    const a = P.aggregate(recs);
    const kpis = kpiCard('งบที่ใช้', baht(a.spend)) + kpiCard('Impressions', intf(a.impressions)) +
      kpiCard('Clicks', intf(a.clicks), 'CTR ' + f2(a.ctr) + '%') + kpiCard('CPC', baht(a.cpc)) +
      kpiCard('Conversions', intf(a.conversions), 'CPA ' + baht(a.cpa)) + kpiCard('ROAS', f2(a.roas) + 'x');

    const sorted = recs.slice().sort((x, y) => y.spend - x.spend);
    const rows = sorted.map((r) =>
      `<tr><td title="${r.campaign}">${truncate(r.campaign, 42)}</td><td><span class="tag" style="background:${UNIT_COLOR[r.unit]}33;color:${UNIT_COLOR[r.unit]}">${U.label(r.unit).replace('Yushi ', '')}</span></td><td>${baht(r.spend)}</td><td>${intf(r.impressions)}</td><td>${intf(r.clicks)}</td><td>${f2(r.ctr)}%</td><td>${baht(r.cpc)}</td><td>${intf(r.conversions)}</td><td class="${cpaClass(r.cpa)}">${r.cpa ? baht(r.cpa) : '—'}</td><td class="${roasClass(r.roas)}">${r.roas ? f2(r.roas) + 'x' : '—'}</td></tr>`
    ).join('');

    host.innerHTML = `
      <div class="kpi-grid">${kpis}</div>
      <div class="card chart-card"><div class="card-head"><h3>งบประมาณรายแคมเปญ (Top 10)</h3></div><canvas id="chart-${p}"></canvas></div>
      <div class="card"><div class="card-head"><h3>รายละเอียดแคมเปญ (${recs.length})</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>แคมเปญ</th><th>หน่วยธุรกิจ</th><th>งบ</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>CPC</th><th>Conv.</th><th>CPA</th><th>ROAS</th></tr></thead>
          <tbody>${rows}</tbody></table></div></div>`;

    const top = sorted.slice(0, 10);
    destroyChart('plat-' + p);
    state.charts['plat-' + p] = new Chart($('#chart-' + p), {
      type: 'bar',
      data: { labels: top.map((r) => truncate(r.campaign, 20)), datasets: [{ label: 'งบ (฿)', data: top.map((r) => r.spend), backgroundColor: COLOR[p] }] },
      options: chartOpts({ indexAxis: 'y' }),
    });
  }

  // ---------- BUSINESS UNITS ----------
  function renderUnits() {
    const host = $('#view-units');
    const recs = allRecords();
    if (!recs.length) { host.innerHTML = emptyState('🏢'); return; }

    // group by unit
    const groups = {};
    for (const r of recs) { (groups[r.unit] = groups[r.unit] || []).push(r); }
    // เรียงตามงบที่ใช้มากสุด
    const order = Object.keys(groups).sort((a, b) => P.aggregate(groups[b]).spend - P.aggregate(groups[a]).spend);

    host.innerHTML = order.map((uid) => {
      const list = groups[uid];
      const a = P.aggregate(list);
      const color = UNIT_COLOR[uid] || '#888';

      // per-platform breakdown
      const platRows = PLATFORMS.filter((p) => list.some((r) => r.platform === p)).map((p) => {
        const pa = P.aggregate(list.filter((r) => r.platform === p));
        return `<tr><td><span class="tag ${TAGCLASS[p]}">${SHORT[p]}</span></td><td>${pa.campaigns}</td><td>${baht(pa.spend)}</td><td>${f2(pa.ctr)}%</td><td>${intf(pa.conversions)}</td><td class="${cpaClass(pa.cpa)}">${pa.cpa ? baht(pa.cpa) : '—'}</td><td class="${roasClass(pa.roas)}">${pa.roas ? f2(pa.roas) + 'x' : '—'}</td></tr>`;
      }).join('');

      return `<div class="unit-section">
        <div class="unit-section-head">
          <h2><span class="unit-dot" style="background:${color}"></span>${U.label(uid)}</h2>
          <div class="unit-quickstats">
            <span class="muted">งบ <b>${baht(a.spend)}</b></span>
            <span class="muted">Conv. <b>${intf(a.conversions)}</b></span>
            <span class="muted">CPA <b class="${cpaClass(a.cpa)}">${a.cpa ? baht(a.cpa) : '—'}</b></span>
            <span class="muted">ROAS <b class="${roasClass(a.roas)}">${a.roas ? f2(a.roas) + 'x' : '—'}</b></span>
          </div>
        </div>
        <div class="unit-section-body">
          <div class="unit-mini-kpi">
            <div class="mk"><div class="l">Impressions</div><div class="v">${intf(a.impressions)}</div></div>
            <div class="mk"><div class="l">Clicks</div><div class="v">${intf(a.clicks)}</div></div>
            <div class="mk"><div class="l">CTR</div><div class="v">${f2(a.ctr)}%</div></div>
            <div class="mk"><div class="l">CPC</div><div class="v">${baht(a.cpc)}</div></div>
            <div class="mk"><div class="l">รายได้</div><div class="v">${baht(a.revenue)}</div></div>
            <div class="mk"><div class="l">แคมเปญ</div><div class="v">${a.campaigns}</div></div>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>แพลตฟอร์ม</th><th>แคมเปญ</th><th>งบ</th><th>CTR</th><th>Conv.</th><th>CPA</th><th>ROAS</th></tr></thead>
            <tbody>${platRows}</tbody></table></div>
        </div>
      </div>`;
    }).join('');
  }

  // ---------- MONTH COMPARISON ----------
  function renderCompare() {
    const host = $('#view-compare');
    const months = monthsAvailable();
    if (!months.length) { host.innerHTML = emptyState('📈', 'ยังไม่มีข้อมูล — อัปโหลดอย่างน้อย 1 เดือนเพื่อเริ่มเปรียบเทียบ'); destroyChart('compare'); return; }

    const data = months.map((m) => ({ m, a: P.aggregate(allRecordsForMonth(m)) })).filter((x) => x.a.campaigns > 0);
    if (!data.length) { host.innerHTML = emptyState('📈', 'ไม่มีข้อมูลของหน่วยธุรกิจที่เลือกในเดือนต่าง ๆ'); destroyChart('compare'); return; }

    // หาเดือนดี/แย่ จาก ROAS (ถ้าไม่มีรายได้ ใช้ CPA แทน)
    const withRoas = data.filter((x) => x.a.roas > 0);
    const byRoas = withRoas.slice().sort((a, b) => b.a.roas - a.a.roas);
    const bestM = byRoas[0], worstM = byRoas[byRoas.length - 1];
    const isBest = (m) => byRoas.length > 1 && bestM && m === bestM.m;
    const isWorst = (m) => byRoas.length > 1 && worstM && m === worstM.m;

    const unitNote = state.unit === 'all' ? 'ทุกหน่วยธุรกิจ' : U.label(state.unit);

    // KPI สรุปเดือนดี/แย่
    let summary = '';
    if (byRoas.length > 1) {
      summary = `<div class="kpi-grid">
        ${kpiCard('🏆 เดือนที่ดีที่สุด', formatMonth(bestM.m), 'ROAS ' + f2(bestM.a.roas) + 'x · CPA ' + baht(bestM.a.cpa))}
        ${kpiCard('⚠️ เดือนที่ควรปรับ', formatMonth(worstM.m), 'ROAS ' + f2(worstM.a.roas) + 'x · CPA ' + baht(worstM.a.cpa))}
        ${kpiCard('จำนวนเดือนที่เก็บไว้', data.length + ' เดือน', unitNote)}
      </div>`;
    }

    // ตารางเทียบ
    const rows = data.map((x) => {
      const a = x.a, cls = isBest(x.m) ? 'best-row' : isWorst(x.m) ? 'worst-row' : '';
      const badge = isBest(x.m) ? ' <span class="pill good">ดีสุด</span>' : isWorst(x.m) ? ' <span class="pill bad">ควรปรับ</span>' : '';
      return `<tr class="${cls}"><td>${formatMonth(x.m)}${badge}</td><td>${baht(a.spend)}</td><td>${intf(a.impressions)}</td><td>${intf(a.clicks)}</td><td>${f2(a.ctr)}%</td><td>${intf(a.conversions)}</td><td class="${cpaClass(a.cpa)}">${a.cpa ? baht(a.cpa) : '—'}</td><td>${baht(a.revenue)}</td><td class="${roasClass(a.roas)}">${a.roas ? f2(a.roas) + 'x' : '—'}</td></tr>`;
    }).join('');

    host.innerHTML = `
      ${summary}
      <div class="card chart-card">
        <div class="card-head"><h3>แนวโน้มรายเดือน — งบ (แท่ง) และ ROAS (เส้น) · ${unitNote}</h3></div>
        <canvas id="compareChart"></canvas>
      </div>
      <div class="card">
        <div class="card-head"><h3>ตารางเปรียบเทียบรายเดือน</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>เดือน</th><th>งบ</th><th>Impr.</th><th>Clicks</th><th>CTR</th><th>Conv.</th><th>CPA</th><th>รายได้</th><th>ROAS</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
      </div>`;

    destroyChart('compare');
    state.charts.compare = new Chart($('#compareChart'), {
      data: {
        labels: data.map((x) => formatMonth(x.m)),
        datasets: [
          { type: 'bar', label: 'งบ (฿)', data: data.map((x) => x.a.spend), backgroundColor: '#3b6ef0', yAxisID: 'y', order: 2 },
          { type: 'line', label: 'ROAS (x)', data: data.map((x) => x.a.roas), borderColor: '#34c77b', backgroundColor: '#34c77b', tension: 0.3, yAxisID: 'y1', order: 1 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: {
          x: { grid: { display: false } },
          y: { position: 'left', grid: { color: '#2a2f3a' }, title: { display: true, text: 'งบ (฿)' } },
          y1: { position: 'right', grid: { display: false }, title: { display: true, text: 'ROAS (x)' } },
        },
      },
    });
  }

  // ---------- RECOMMENDATIONS ----------
  // scope: 'current' = เฉพาะเดือนที่เลือก, 'all' = ทุกเดือนที่มีข้อมูล
  function renderRecommend(withAI, scope) {
    scope = scope || 'current';
    const host = $('#recommendList');
    const months = scope === 'all' ? monthsAvailable() : [state.month];
    const haveData = months.some((m) => allRecordsForMonth(m).length);
    if (!haveData) {
      host.innerHTML = emptyState('💡', scope === 'all' ? 'ยังไม่มีข้อมูลเดือนใดเลย — อัปโหลด CSV ก่อน' : 'อัปโหลดข้อมูลก่อนเพื่อรับคำแนะนำ');
      return;
    }
    let html = '';
    for (const m of months) {
      const recsM = allRecordsForMonth(m);
      if (!recsM.length) continue;
      const recs = R.analyze(recsM, state.targets);
      if (scope === 'all') {
        const hi = recs.filter((r) => r.priority === 'high').length;
        html += `<div class="month-group-head">📅 ${formatMonth(m)} <span class="muted small">· ${recsM.length} แคมเปญ · ${recs.length} คำแนะนำ${hi ? ` · ${hi} สำคัญมาก` : ''}</span></div>`;
      }
      html += recs.length
        ? recs.map(renderRecCard).join('')
        : `<div class="card"><div class="empty"><div class="empty-emoji">🎉</div>ทุกแคมเปญอยู่ในเกณฑ์ดี ไม่มีจุดที่ต้องแก้ไขเร่งด่วน</div></div>`;
    }
    host.innerHTML = html;
    if (withAI) appendAI();
  }

  const PRI_LABEL = { high: 'สำคัญมาก', medium: 'ปานกลาง', low: 'โอกาส' };
  function renderRecCard(r) {
    const tag = TAGCLASS[r.platform] || '';
    const unitTag = r.unit && r.unit !== 'unassigned' ? `<span class="tag" style="background:${(UNIT_COLOR[r.unit] || '#888')}33;color:${UNIT_COLOR[r.unit] || '#888'}">${U.label(r.unit).replace('Yushi ', '')}</span>` : '';
    return `<div class="rec ${r.priority}">
      <div class="rec-head"><div class="rec-title">${r.title}</div>
        <div class="rec-meta">${unitTag}<span class="tag ${tag}">${SHORT[r.platform] || r.platform}</span>
          <span class="badge badge-${r.priority === 'high' ? 'bad' : r.priority === 'medium' ? 'warn' : 'ok'}">${PRI_LABEL[r.priority]}</span></div>
      </div>
      <div class="muted small" style="margin-bottom:6px">${r.campaign}</div>
      <div class="rec-body">${r.body}</div>
      <div class="rec-impact">📈 ${r.impact}</div>
    </div>`;
  }

  async function appendAI() {
    const host = $('#recommendList');
    if (!AI.hasKey()) { toast('ยังไม่ได้ตั้งค่า API key — ไปที่หน้า "จัดการข้อมูล"'); return; }
    const loading = document.createElement('div');
    loading.className = 'rec ai';
    loading.innerHTML = '<div class="rec-title">✨ AI กำลังวิเคราะห์...</div><div class="muted small">กำลังส่งข้อมูลไปยังผู้ให้บริการ AI</div>';
    host.prepend(loading);
    try {
      const totals = P.aggregate(allRecords());
      const summary = R.summarizeForAI(allRecords(), totals, state.targets);
      const text = await AI.generate(summary);
      loading.innerHTML = `<div class="rec-head"><div class="rec-title">✨ บทวิเคราะห์เชิงลึกจาก AI</div><span class="tag" style="background:rgba(163,116,255,.2);color:#c4a6ff">AI</span></div><div class="rec-body" style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
    } catch (e) {
      loading.innerHTML = `<div class="rec-title">⚠️ เรียก AI ไม่สำเร็จ</div><div class="rec-body">${escapeHtml(e.message)}</div>`;
    }
  }
  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  // ---------- upload ----------
  function ingest(platform, data, monthKey, ext, fileName) {
    const isXlsx = ext === 'xlsx' || ext === 'xls';
    // data ของ csv อาจเป็น ArrayBuffer (จากการอัปโหลด) หรือ string (จากตัวอย่าง)
    const csvText = typeof data === 'string' ? data : P.decodeBuffer(data);
    const raw = isXlsx ? P.parseWorkbook(data, platform) : P.parseCsvText(csvText, platform);
    // ถ้าชื่อไฟล์มีชื่อหน่วยธุรกิจ → จัดทุกแคมเปญในไฟล์เข้าหน่วยนั้นทั้งหมด
    // (เหมาะกับ Google Ads ที่ชื่อแคมเปญในไฟล์มักไม่มีชื่อบริษัท)
    const fileUnit = fileName ? U.detect(fileName) : 'unassigned';
    const recs = raw.map((r) => {
      const d = P.computeDerived(r);
      d.unit = (fileUnit !== 'unassigned') ? fileUnit : U.detect(d.campaign);
      return d;
    });
    if (!recs.length) throw new Error('ไม่พบข้อมูลแคมเปญที่อ่านได้ในไฟล์นี้ ลองตรวจหัวคอลัมน์');

    const month = ensureMonth(monthKey);
    // Google Ads: ทบรวมเข้ากับข้อมูลเดิม (อัปโหลดหลายไฟล์รายหน่วยธุรกิจได้ ไม่ลบของเก่า)
    // แพลตฟอร์มอื่น: แทนที่ทั้งหมด (เพราะ 1 ไฟล์ export = ทั้งบัญชี)
    const append = platform === 'google' && (month[platform] || []).length > 0;
    if (append) {
      // merge แบบ dedupe ด้วยคีย์ unit + ชื่อแคมเปญ (ของใหม่ทับของเดิมที่ซ้ำ)
      const map = new Map();
      for (const r of month[platform]) map.set(r.unit + '||' + r.campaign, r);
      for (const r of recs) map.set(r.unit + '||' + r.campaign, r);
      month[platform] = Array.from(map.values());
    } else {
      month[platform] = recs;
    }
    return { count: recs.length, fileUnit, total: month[platform].length, appended: append };
  }

  function handleFile(platform, file) {
    // ใช้ "เดือนของข้อมูลที่จะอัปโหลด" จากหน้าจัดการข้อมูล (ไม่ใช่เดือนที่กำลังดูอยู่)
    const m = ($('#uploadMonth') && $('#uploadMonth').value) || state.month;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isXlsx = ext === 'xlsx' || ext === 'xls';
    const baseName = file.name.replace(/\.[^.]+$/, ''); // ตัดนามสกุลออก เหลือชื่อไฟล์
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const res = ingest(platform, e.target.result, m, ext, baseName);
        const n = res.count;
        // ย้ายมุมมองไปยังเดือนที่เพิ่งอัปโหลด เพื่อให้เห็นผลทันที
        state.month = m;
        $('#reportMonth').value = m;
        const unitTxt = res.fileUnit !== 'unassigned' ? ' · ' + U.label(res.fileUnit) : '';
        $('#state-' + platform).textContent = res.appended
          ? `✅ ${formatMonth(m)}: +${n} (รวม ${res.total})${unitTxt}`
          : `✅ ${formatMonth(m)}: ${n} แคมเปญ${unitTxt}`;
        $('#state-' + platform).classList.add('ok');
        saveStore();
        refreshAll();
        const unitMsg = res.fileUnit !== 'unassigned' ? ` (${U.label(res.fileUnit)})` : '';
        toast(res.appended
          ? `${LABEL[platform]} เดือน ${formatMonth(m)}: เพิ่ม ${n} แคมเปญ${unitMsg} · รวมทั้งหมด ${res.total}`
          : `${LABEL[platform]} เดือน ${formatMonth(m)}: ${n} แคมเปญ${unitMsg}`);
      } catch (err) { toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message); }
    };
    // อ่านเป็น ArrayBuffer เสมอ เพื่อรองรับทั้ง .xlsx และ csv ที่เป็น UTF-16 (Google Ads)
    reader.readAsArrayBuffer(file);
  }

  async function loadSample() {
    // ตัวอย่างมี 2 เดือน เพื่อสาธิตการเลือกเดือน
    const months = ['2026-05', '2026-06'];
    try {
      for (const m of months) {
        for (const p of PLATFORMS) {
          const res = await fetch(`sample-data/${p}_${m}.csv`);
          if (!res.ok) throw new Error('โหลดไฟล์ตัวอย่างไม่ได้ — ต้องเปิดผ่าน web server (ดู README) ไม่ใช่ดับเบิลคลิกไฟล์');
          ingest(p, await res.text(), m);
        }
      }
      state.month = months[months.length - 1]; // เดือนล่าสุด
      $('#reportMonth').value = state.month;
      PLATFORMS.forEach((p) => { const el = $('#state-' + p); if (el) { el.textContent = '✅ ตัวอย่าง 2 เดือน'; el.classList.add('ok'); } });
      saveStore();
      refreshAll();
      switchView('overview');
      toast('โหลดตัวอย่าง 2 เดือน (พ.ค.–มิ.ย.) เรียบร้อย ลองสลับเดือนและหน่วยธุรกิจดูได้');
    } catch (e) { toast(e.message); }
  }

  // ---------- stored months management ----------
  function renderStoredMonths() {
    const host = $('#storedMonths');
    if (!host) return;
    const ms = monthsAvailable();
    if (!ms.length) { host.innerHTML = '<span class="muted small">ยังไม่มีข้อมูลที่บันทึกไว้</span>'; return; }
    host.innerHTML = ms.map((m) => {
      const total = PLATFORMS.reduce((s, p) => s + (state.store[m][p] || []).length, 0);
      const platRows = PLATFORMS.map((p) => {
        const arr = state.store[m][p] || [];
        if (!arr.length) {
          return `<div class="sm-plat sm-plat-empty"><span class="tag ${TAGCLASS[p]}">${LABEL[p]}</span><span class="muted small">— ไม่มีข้อมูล —</span></div>`;
        }
        return `<div class="sm-plat" data-m="${m}" data-p="${p}">
            <span class="tag ${TAGCLASS[p]}">${LABEL[p]}</span>
            <span class="muted small">${arr.length} แคมเปญ</span>
            <button class="sm-del-plat" title="ลบเฉพาะ ${LABEL[p]} ของเดือนนี้">✕</button>
          </div>`;
      }).join('');
      return `<div class="sm-month" data-m="${m}">
          <div class="sm-month-head">
            <button class="sm-open" data-m="${m}">📅 ${formatMonth(m)} <span class="cnt">รวม ${total} แคมเปญ</span></button>
            <button class="sm-del-month" data-m="${m}" title="ลบทั้งเดือน">🗑 ลบทั้งเดือน</button>
          </div>
          <div class="sm-plats">${platRows}</div>
        </div>`;
    }).join('');

    $$('#storedMonths .sm-open').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.m; state.month = m; $('#reportMonth').value = m;
      if ($('#uploadMonth')) $('#uploadMonth').value = m; refreshAll(); switchView('overview');
    }));
    $$('#storedMonths .sm-del-month').forEach((b) => b.addEventListener('click', () => deleteMonth(b.dataset.m)));
    $$('#storedMonths .sm-del-plat').forEach((b) => {
      const el = b.closest('.sm-plat');
      b.addEventListener('click', () => deletePlatform(el.dataset.m, el.dataset.p));
    });
  }

  function deletePlatform(m, p) {
    if (!confirm(`ลบข้อมูล ${SHORT[p]} ของเดือน ${formatMonth(m)}?`)) return;
    if (state.store[m]) state.store[m][p] = [];
    // ถ้าเดือนนี้ไม่เหลือแพลตฟอร์มใดเลย ให้ลบทั้งเดือน
    let removedMonth = false;
    if (state.store[m] && !PLATFORMS.some((x) => (state.store[m][x] || []).length)) {
      delete state.store[m];
      removedMonth = true;
      const left = monthsAvailable();
      if (state.month === m) state.month = left[left.length - 1] || new Date().toISOString().slice(0, 7);
      $('#reportMonth').value = state.month;
    }
    if (removedMonth) persistDeleteMonth(m); else saveStore();
    refreshAll();
    toast(`ลบข้อมูล ${SHORT[p]} ของ ${formatMonth(m)} แล้ว`);
  }

  function deleteMonth(m) {
    if (!confirm(`ลบข้อมูลเดือน ${formatMonth(m)} ทั้งหมด?`)) return;
    delete state.store[m];
    persistDeleteMonth(m);
    const left = monthsAvailable();
    if (state.month === m) state.month = left[left.length - 1] || new Date().toISOString().slice(0, 7);
    $('#reportMonth').value = state.month;
    refreshAll();
    toast(`ลบข้อมูลเดือน ${formatMonth(m)} แล้ว`);
  }

  function clearAll() {
    if (!confirm('ล้างข้อมูลทุกเดือนทั้งหมด? การลบนี้ย้อนกลับไม่ได้')) return;
    state.store = {};
    if (useServer) enqueue({ action: 'clearAll' }); else saveStore();
    PLATFORMS.forEach((p) => { const el = $('#state-' + p); if (el) { el.textContent = 'ยังไม่อัปโหลด'; el.classList.remove('ok'); } });
    refreshAll();
    toast('ล้างข้อมูลทั้งหมดแล้ว');
  }

  // ---------- controls refresh ----------
  function refreshAll() {
    updateDataStatus(); updateMonthsHint(); renderStoredMonths(); render();
  }

  function updateDataStatus() {
    const n = allRecordsUnfiltered().length;
    const badge = $('#dataStatus');
    if (n) { badge.textContent = `${n} แคมเปญ · ${PLATFORMS.filter((p) => monthData()[p].length).length} แพลตฟอร์ม`; badge.className = 'badge badge-ok'; }
    else { badge.textContent = 'ยังไม่มีข้อมูลเดือนนี้'; badge.className = 'badge badge-muted'; }
  }

  function updateMonthsHint() {
    const ms = monthsAvailable();
    $('#monthsHint').textContent = ms.length ? 'มีข้อมูล: ' + ms.map(formatMonth).join(', ') : 'ยังไม่มีข้อมูล';
  }

  function buildUnitFilter() {
    const sel = $('#unitFilter');
    const opts = ['<option value="all">🏢 ทุกหน่วยธุรกิจ</option>']
      .concat(U.UNITS.map((u) => `<option value="${u.id}">${u.name}</option>`));
    sel.innerHTML = opts.join('');
    sel.value = state.unit;
  }

  // ---------- targets ----------
  function renderTargets() {
    const fields = [['cpaTarget', 'CPA เป้าหมาย (฿)'], ['roasTarget', 'ROAS เป้าหมาย (x)'], ['ctrMin', 'CTR ขั้นต่ำ (%)'], ['minSpendToJudge', 'งบขั้นต่ำก่อนตัดสิน (฿)']];
    $('#targetsGrid').innerHTML = fields.map(([k, label]) => `<div class="target-item"><label>${label}</label><input type="number" step="0.1" data-target="${k}" value="${state.targets[k]}" /></div>`).join('');
    $$('#targetsGrid input').forEach((inp) => inp.addEventListener('change', () => {
      state.targets[inp.dataset.target] = parseFloat(inp.value) || 0; saveTargets(); render(); toast('บันทึกเป้าหมายแล้ว');
    }));
  }

  // ---------- charts util ----------
  function chartOpts(opt = {}) {
    Chart.defaults.color = '#9aa3b2';
    Chart.defaults.font.family = "'Sarabun','Inter',sans-serif";
    return {
      responsive: true, maintainAspectRatio: false, indexAxis: opt.indexAxis || 'x',
      plugins: { legend: { display: !!opt.legend, position: 'bottom' } },
      scales: opt.indexAxis === 'y'
        ? { x: { grid: { color: '#2a2f3a' } }, y: { grid: { display: false } } }
        : { x: { grid: { display: false } }, y: { grid: { color: '#2a2f3a' } } },
    };
  }

  // ---------- init ----------
  async function init() {
    await bootStore();   // โหลดข้อมูลจากเซิร์ฟเวอร์ (MySQL) หรือ localStorage ให้เสร็จก่อนเริ่มแสดงผล
    // ถ้ามีข้อมูลที่บันทึกไว้ ให้เปิดมาที่เดือนล่าสุดที่มีข้อมูล
    const saved = monthsAvailable();
    state.month = saved.length ? saved[saved.length - 1] : new Date().toISOString().slice(0, 7);
    $('#reportMonth').value = state.month;
    if ($('#uploadMonth')) $('#uploadMonth').value = state.month;

    $$('.nav-item').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.view)));
    PLATFORMS.forEach((p) => { const inp = $('#file-' + p); if (inp) inp.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(p, e.target.files[0]); e.target.value = ''; }); });

    $('#reportMonth').addEventListener('change', (e) => {
      state.month = e.target.value || state.month;
      if ($('#uploadMonth')) $('#uploadMonth').value = state.month; // ให้เดือนอัปโหลดเดินตามเดือนที่ดูอยู่
      $('#viewSubtitle').textContent = TITLES[currentView][1] ? TITLES[currentView][1] + ' · ' + subtitle() : subtitle();
      refreshAll();
    });
    buildUnitFilter();
    $('#unitFilter').addEventListener('change', (e) => {
      state.unit = e.target.value;
      $('#viewSubtitle').textContent = TITLES[currentView][1] ? TITLES[currentView][1] + ' · ' + subtitle() : subtitle();
      render();
    });

    if ($('#uploadMonth')) $('#uploadMonth').addEventListener('change', (e) => { if (!e.target.value) e.target.value = state.month; });

    $('#loadSampleBtn').addEventListener('click', loadSample);
    if ($('#clearAllBtn')) $('#clearAllBtn').addEventListener('click', clearAll);
    $('#genRulesBtn').addEventListener('click', () => renderRecommend(false, 'current'));
    $('#genAllBtn').addEventListener('click', () => renderRecommend(false, 'all'));
    $('#genAiBtn').addEventListener('click', () => { renderRecommend(false, 'current'); appendAI(); });
    $('#printBtn').addEventListener('click', () => window.print());

    const { provider, key } = AI.getKey();
    $('#aiProvider').value = provider;
    if (key) $('#aiKeyState').textContent = '🔑 บันทึกคีย์ไว้แล้ว (' + provider + ')';
    $('#saveKeyBtn').addEventListener('click', () => {
      const k = $('#aiKey').value.trim();
      if (!k) { toast('กรุณาใส่ API key'); return; }
      AI.saveKey($('#aiProvider').value, k); $('#aiKey').value = '';
      $('#aiKeyState').textContent = '🔑 บันทึกคีย์เรียบร้อย'; toast('บันทึก API key แล้ว');
    });

    renderTargets();
    refreshAll();
    switchView('overview');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
