/* parsers.js — แปลงไฟล์ CSV จาก 3 แพลตฟอร์มให้เป็นโครงสร้างมาตรฐานเดียวกัน
 * รองรับชื่อคอลัมน์ทั้งภาษาอังกฤษและภาษาไทย และ auto-detect คอลัมน์ที่ตรงกัน
 *
 * โครงสร้างมาตรฐานต่อ 1 แคมเปญ (campaign row):
 * { platform, campaign, status, spend, impressions, clicks,
 *   conversions, revenue, reach }
 * ค่าที่เหลือ (ctr, cpc, cpa, cvr, roas, cpm) คำนวณภายหลังใน computeDerived()
 */
(function (global) {
  'use strict';

  // ---- ตัวช่วยทำให้ header เทียบกันได้ (ตัดช่องว่าง/อักขระพิเศษ/ตัวพิมพ์) ----
  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')      // ตัดวงเล็บ เช่น clicks (all)
      .replace(/[^a-z0-9ก-๙]+/g, ' ') // เหลือแต่ตัวอักษร/ตัวเลข
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---- แปลงสตริงตัวเลข (รองรับ comma, ฿, %, ค่าว่าง, "—") ----
  function num(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    let s = String(v).trim();
    if (!s || s === '-' || s === '—' || s === 'N/A' || s.toLowerCase() === 'null') return 0;
    s = s.replace(/[฿$,%\s]/g, '').replace(/[^\d.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  // ---- พจนานุกรมคำพ้องของแต่ละ metric (ยิ่งอยู่ต้น = ความสำคัญสูง) ----
  // ใช้ "มี substring" ในการ match กับ header ที่ normalize แล้ว
  const SYNONYMS = {
    campaign: ['campaign name', 'campaign', 'ad group', 'keyword', 'ชื่อแคมเปญ', 'แคมเปญ', 'คีย์เวิร์ด', 'ad set name'],
    status: ['delivery', 'status', 'campaign status', 'สถานะ', 'การแสดงผล'],
    spend: ['amount spent', 'cost', 'spend', 'total cost', 'ค่าใช้จ่าย', 'งบที่ใช้', 'ยอดใช้จ่าย'],
    impressions: ['impressions', 'impr', 'การแสดงผล', 'จำนวนการแสดงผล'],
    reach: ['reach', 'การเข้าถึง'],
    clicks: ['link clicks', 'clicks destination', 'clicks all', 'clicks', 'การคลิก', 'คลิก', 'จำนวนคลิก'],
    conversions: ['website purchases', 'omni purchase', 'purchases', 'conversions', 'conversion', 'results', 'complete payment', 'conv', 'การกระทำ', 'คอนเวอร์ชัน', 'ผลลัพธ์', 'การซื้อ', 'ยอดสั่งซื้อ'],
    revenue: ['purchase value', 'conversion value', 'conv value', 'total purchase value', 'revenue', 'value', 'มูลค่า', 'รายได้', 'มูลค่าการซื้อ'],
  };

  // metric ที่ "ยิ่งมาก่อน = ต้องเจาะจงกว่า" — เพื่อกัน clicks ไปแย่ง conversions ฯลฯ
  // เราจะ match แบบ longest-synonym-first
  function buildHeaderMap(headers) {
    const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));
    const map = {};
    const used = new Set();

    // เรียง metric ตามความเจาะจง: revenue/conversions ก่อน clicks/impressions
    const order = ['campaign', 'status', 'revenue', 'conversions', 'reach', 'impressions', 'clicks', 'spend'];

    for (const metric of order) {
      const syns = SYNONYMS[metric];
      let best = null, bestLen = -1;
      for (const h of normalized) {
        if (used.has(h.raw)) continue;
        for (const syn of syns) {
          // ต้องการให้ตรงทั้งคำหรือมี substring ของคำพ้อง
          if (h.n === syn || h.n.includes(syn) || syn.includes(h.n)) {
            // ให้คะแนนตามความยาวคำพ้องที่จับได้ (เจาะจงกว่า = ดีกว่า)
            const score = syn.length + (h.n === syn ? 100 : 0);
            if (score > bestLen) { bestLen = score; best = h.raw; }
          }
        }
      }
      if (best) { map[metric] = best; used.add(best); }
    }
    return map;
  }

  // ---- ค่า fallback: ถ้าไม่เจอ conversions แต่เจอ "results" / "cost per result" ----
  function deriveConversionsIfMissing(row, headerMap, rawRow) {
    if (headerMap.conversions) return num(rawRow[headerMap.conversions]);
    // หา cost per result เพื่อย้อนคำนวณ ถ้ามี spend
    const cprHeader = Object.keys(rawRow).find((k) => /cost per result|cost \/ conv|cpa|ต้นทุนต่อ/i.test(k));
    if (cprHeader && row.spend) {
      const cpr = num(rawRow[cprHeader]);
      if (cpr > 0) return Math.round((row.spend / cpr) * 100) / 100;
    }
    return 0;
  }

  // ---- parser หลัก ----
  function parseRows(rows, platform) {
    if (!rows || !rows.length) return [];
    const headers = Object.keys(rows[0]);
    const hm = buildHeaderMap(headers);

    const out = [];
    for (const raw of rows) {
      const campaign = hm.campaign ? String(raw[hm.campaign] || '').trim() : '';
      const spend = hm.spend ? num(raw[hm.spend]) : 0;
      // ข้ามแถวสรุป / แถวว่าง / แถว total (ยอดรวมของทุกแคมเปญ ไม่ใช่แคมเปญจริง)
      if (!campaign) continue;
      // ชื่อเป็นขีด/จุด/ช่องว่างล้วน (เช่น "—", "--", "-") = แถวยอดรวม
      if (/^[-–—.\s]+$/.test(campaign)) continue;
      // แถวยอดรวม (อังกฤษ): ขึ้นต้นด้วย total / totals / grand total / sub total / overall
      // ครอบคลุมแบบของ TikTok เช่น "Total", "Total (6 campaigns)", "Total cost"
      if (/^(total|totals|grand\s+total|sub[\s-]?total|overall)\b/i.test(campaign)) continue;
      // แถวยอดรวม (ไทย)
      const lc = campaign.toLowerCase();
      if (['รวม', 'ผลรวม', 'ยอดรวม', 'รวมทั้งหมด', 'ทั้งหมด', 'สรุป', 'สรุปรวม'].includes(lc)) continue;
      if (/^(ผลรวม|ยอดรวม|รวมทั้งหมด|สรุปรวม)/.test(campaign)) continue;

      const rec = {
        platform,
        campaign,
        status: hm.status ? String(raw[hm.status] || '').trim() : '',
        spend,
        impressions: hm.impressions ? num(raw[hm.impressions]) : 0,
        reach: hm.reach ? num(raw[hm.reach]) : 0,
        clicks: hm.clicks ? num(raw[hm.clicks]) : 0,
        revenue: hm.revenue ? num(raw[hm.revenue]) : 0,
        conversions: 0,
      };
      rec.conversions = deriveConversionsIfMissing(rec, hm, raw);

      // ข้ามแถวที่ไม่มีข้อมูลอะไรเลย
      if (rec.spend === 0 && rec.impressions === 0 && rec.clicks === 0) continue;
      out.push(rec);
    }
    return out;
  }

  // ---- คำนวณ metric ต่อยอด ----
  function computeDerived(rec) {
    const r = Object.assign({}, rec);
    r.ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0;       // %
    r.cpc = r.clicks ? r.spend / r.clicks : 0;                          // ต้นทุน/คลิก
    r.cpm = r.impressions ? (r.spend / r.impressions) * 1000 : 0;       // ต้นทุน/พันครั้ง
    r.cvr = r.clicks ? (r.conversions / r.clicks) * 100 : 0;            // % conversion
    r.cpa = r.conversions ? r.spend / r.conversions : 0;                // ต้นทุน/conversion
    r.roas = r.spend ? r.revenue / r.spend : 0;                         // x
    return r;
  }

  // ---- รวมยอดทุกแคมเปญของแพลตฟอร์ม ----
  function aggregate(records) {
    const t = { spend: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0, revenue: 0, campaigns: records.length };
    for (const r of records) {
      t.spend += r.spend; t.impressions += r.impressions; t.reach += r.reach;
      t.clicks += r.clicks; t.conversions += r.conversions; t.revenue += r.revenue;
    }
    return computeDerived(t);
  }

  // ---- หา "แถวหัวคอลัมน์จริง" จากตาราง 2 มิติ ----
  // ไฟล์ของ Google Ads/TikTok มักมีบรรทัดหัวเรื่อง/ช่วงวันที่อยู่ข้างบนก่อนถึงหัวคอลัมน์จริง
  const HEADER_TOKENS = [
    'campaign', 'ad group', 'adgroup', 'keyword', 'คีย์เวิร์ด', 'ชื่อแคมเปญ', 'แคมเปญ',
    'cost', 'spend', 'amount spent', 'ค่าใช้จ่าย', 'งบ',
    'impr', 'impression', 'การแสดงผล', 'click', 'คลิก',
    'conversion', 'conv', 'result', 'ผลลัพธ์', 'การกระทำ',
    'ctr', 'cpc', 'cpa', 'reach', 'การเข้าถึง', 'roas',
  ];

  function detectHeaderIndex(matrix) {
    let bestIdx = 0, bestScore = 0;
    const limit = Math.min(matrix.length, 25);
    for (let i = 0; i < limit; i++) {
      const cells = (matrix[i] || []).map((c) => norm(c));
      let score = 0;
      for (const cell of cells) {
        if (!cell) continue;
        for (const t of HEADER_TOKENS) { if (cell.includes(t)) { score++; break; } }
      }
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    // ต้องเจอ token อย่างน้อย 2 ตัวถึงจะถือว่าเป็นแถวหัวคอลัมน์ ไม่งั้นใช้แถวแรก
    return bestScore >= 2 ? bestIdx : 0;
  }

  // แปลงตาราง 2 มิติ → array ของ object โดยใช้แถวหัวคอลัมน์ที่ตรวจเจอ
  function matrixToObjects(matrix) {
    if (!matrix || !matrix.length) return [];
    const hi = detectHeaderIndex(matrix);
    const headers = (matrix[hi] || []).map((h) => String(h == null ? '' : h).trim());
    const out = [];
    for (let i = hi + 1; i < matrix.length; i++) {
      const row = matrix[i];
      if (!row || row.every((c) => c == null || String(c).trim() === '')) continue;
      const o = {};
      for (let j = 0; j < headers.length; j++) { if (headers[j]) o[headers[j]] = row[j]; }
      out.push(o);
    }
    return out;
  }

  // ---- ถอดรหัสไฟล์เป็นข้อความ รองรับ UTF-8 (BOM) และ UTF-16 (Google Ads บางไฟล์) ----
  function decodeBuffer(buf) {
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    return new TextDecoder('utf-8').decode(bytes);
  }

  // ---- parse จากข้อความ CSV (ใช้ PapaParse, auto-detect ตัวคั่น comma/tab) ----
  function parseCsvText(text, platform) {
    const result = Papa.parse(text, { header: false, skipEmptyLines: true, dynamicTyping: false });
    return parseRows(matrixToObjects(result.data), platform);
  }

  // ---- parse จากไฟล์ Excel (.xlsx/.xls) ด้วย SheetJS ----
  // data = ArrayBuffer ที่อ่านมาจากไฟล์
  function parseWorkbook(data, platform) {
    if (typeof XLSX === 'undefined') throw new Error('ยังโหลดไลบรารีอ่าน Excel ไม่สำเร็จ (ต้องมีอินเทอร์เน็ตครั้งแรก)');
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    // header:1 = ได้ตาราง 2 มิติ (array of arrays) เพื่อหาแถวหัวคอลัมน์จริงเอง
    // raw:false = ค่าเป็นข้อความที่ฟอร์แมตแล้ว, defval:'' = เติมช่องว่าง
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    return parseRows(matrixToObjects(matrix), platform);
  }

  global.AdsParser = { parseCsvText, parseWorkbook, decodeBuffer, matrixToObjects, detectHeaderIndex, parseRows, computeDerived, aggregate, num, norm, buildHeaderMap };
})(typeof window !== 'undefined' ? window : globalThis);
