/* recommendations.js — เครื่องมือวิเคราะห์เชิงกฎ (rule-based)
 * รับ records (ที่ผ่าน computeDerived แล้ว) + targets → คืน list คำแนะนำ
 * แต่ละคำแนะนำ: { priority:'high'|'medium'|'low', platform, campaign, title, body, impact, score }
 */
(function (global) {
  'use strict';

  const PLAT_LABEL = { facebook: 'Facebook', google: 'Google', tiktok: 'TikTok' };

  function baht(n) {
    return '฿' + Math.round(n).toLocaleString('th-TH');
  }
  function pct(n) { return n.toFixed(2) + '%'; }

  // เกณฑ์เริ่มต้น (ผู้ใช้ปรับได้จากหน้า "จัดการข้อมูล")
  const DEFAULT_TARGETS = {
    cpaTarget: 300,   // ต้นทุนต่อ conversion ที่รับได้ (บาท)
    roasTarget: 2.0,  // ROAS เป้าหมาย (x)
    ctrMin: 1.0,      // CTR ขั้นต่ำ (%)
    minSpendToJudge: 500, // ใช้จ่ายขั้นต่ำก่อนจะตัดสินแคมเปญ (กันข้อมูลน้อยเกินไป)
  };

  function analyze(records, targets) {
    const t = Object.assign({}, DEFAULT_TARGETS, targets || {});
    const recs = [];
    let _unit = 'unassigned';
    const add = (priority, score, platform, campaign, title, body, impact) =>
      recs.push({ priority, score, platform, campaign, title, body, impact, unit: _unit });

    for (const r of records) {
      const plat = PLAT_LABEL[r.platform] || r.platform;
      const enough = r.spend >= t.minSpendToJudge;
      _unit = r.unit || 'unassigned';

      // 1) ใช้เงินแต่ไม่มี conversion เลย — ผลกระทบสูงสุด
      if (enough && r.conversions === 0 && r.spend > 0) {
        add('high', 100 + r.spend, r.platform, r.campaign,
          'หยุดหรือทบทวนแคมเปญที่ไม่มีผลลัพธ์',
          `ใช้ไป <b>${baht(r.spend)}</b> แต่ยังไม่มี conversion เลย ควรหยุดชั่วคราวเพื่อตรวจ targeting / landing page / การตั้ง conversion event แล้วค่อยเปิดใหม่`,
          `ประหยัดได้ ~${baht(r.spend)}/เดือน`);
        continue;
      }

      // 2) CPA สูงกว่าเป้า
      if (enough && r.conversions > 0 && r.cpa > t.cpaTarget * 1.25) {
        const overspend = (r.cpa - t.cpaTarget) * r.conversions;
        add('high', 80 + overspend, r.platform, r.campaign,
          'ลดต้นทุนต่อผลลัพธ์ (CPA สูงเกินเป้า)',
          `CPA = <b>${baht(r.cpa)}</b> สูงกว่าเป้า ${baht(t.cpaTarget)} ราว ${Math.round((r.cpa / t.cpaTarget - 1) * 100)}% ลองลดงบ/บิด, แคบกลุ่มเป้าหมาย หรือตัด audience ที่ไม่เวิร์ก`,
          `อาจประหยัดได้ ~${baht(overspend)}/เดือน`);
      }

      // 3) ROAS ต่ำกว่าเป้า (เฉพาะแคมเปญที่มี revenue)
      if (enough && r.revenue > 0 && r.roas < t.roasTarget) {
        add(r.roas < 1 ? 'high' : 'medium', 70 + r.spend / 100, r.platform, r.campaign,
          'ปรับงบแคมเปญที่ ROAS ต่ำ',
          `ROAS = <b>${r.roas.toFixed(2)}x</b> ต่ำกว่าเป้า ${t.roasTarget.toFixed(1)}x ${r.roas < 1 ? '(ขาดทุน — ใช้เงินมากกว่ารายได้)' : ''} แนะนำลดงบ 20–30% แล้วย้ายไปแคมเปญที่ ROAS สูงกว่า`,
          r.roas < 1 ? `กำลังขาดทุน ~${baht(r.spend - r.revenue)}` : 'ปรับสมดุลงบให้คุ้มขึ้น');
      }

      // 4) CTR ต่ำ — ครีเอทีฟไม่ดึงดูด
      if (r.impressions > 1000 && r.ctr < t.ctrMin) {
        add('medium', 40 + r.impressions / 1000, r.platform, r.campaign,
          'รีเฟรชครีเอทีฟ (CTR ต่ำ)',
          `CTR = <b>${pct(r.ctr)}</b> ต่ำกว่าเกณฑ์ ${pct(t.ctrMin)} จาก ${r.impressions.toLocaleString()} impressions แต่คนคลิกน้อย ลองเปลี่ยนภาพ/วิดีโอ/หัวข้อ หรือทดสอบ A/B ครีเอทีฟใหม่`,
          'เพิ่มคลิกโดยไม่ต้องเพิ่มงบ');
      }

      // 5) โอกาส scale — ผลดี ควรเพิ่มงบ
      const goodRoas = r.revenue > 0 && r.roas >= t.roasTarget * 1.3;
      const goodCpa = r.conversions > 0 && r.cpa > 0 && r.cpa <= t.cpaTarget * 0.7;
      if (enough && (goodRoas || goodCpa)) {
        add('low', 30 + (r.roas || 0) * 5, r.platform, r.campaign,
          '⬆️ เพิ่มงบแคมเปญที่ทำได้ดี (โอกาสขยายผล)',
          `${goodRoas ? `ROAS = <b>${r.roas.toFixed(2)}x</b> ` : ''}${goodCpa ? `CPA = <b>${baht(r.cpa)}</b> (ต่ำกว่าเป้ามาก) ` : ''}แคมเปญนี้คุ้มค่า ลองเพิ่มงบทีละ 20% แล้วเฝ้าดูว่า CPA/ROAS ยังดีอยู่ไหม`,
          'มีโอกาสเพิ่มยอดผลลัพธ์');
      }

      // 6) CPC สูงผิดปกติ
      if (r.clicks > 50 && r.cpc > 0) {
        // ใช้เกณฑ์เทียบในแพลตฟอร์มภายหลัง (ดูข้อ portfolio) — ที่นี่เตือนเฉพาะที่สูงมาก
      }
    }

    // ---- วิเคราะห์ระดับพอร์ต (ข้ามแคมเปญ) ----
    _unit = 'unassigned';
    portfolioInsights(records, t, add);

    // จัดอันดับ: priority ก่อน แล้วตามด้วย score
    const order = { high: 0, medium: 1, low: 2 };
    recs.sort((a, b) => order[a.priority] - order[b.priority] || b.score - a.score);
    return recs;
  }

  function portfolioInsights(records, t, add) {
    if (!records.length) return;
    const byPlat = {};
    for (const r of records) {
      const p = r.platform;
      byPlat[p] = byPlat[p] || { spend: 0, conv: 0, rev: 0, recs: [] };
      byPlat[p].spend += r.spend; byPlat[p].conv += r.conversions; byPlat[p].rev += r.revenue;
      byPlat[p].recs.push(r);
    }
    const plats = Object.keys(byPlat);
    if (plats.length >= 2) {
      // หาแพลตฟอร์มที่ ROAS/CPA ดีที่สุดและแย่ที่สุด เพื่อแนะนำย้ายงบ
      const stats = plats.map((p) => {
        const d = byPlat[p];
        return { p, spend: d.spend, roas: d.spend ? d.rev / d.spend : 0, cpa: d.conv ? d.spend / d.conv : Infinity };
      });
      const best = stats.slice().sort((a, b) => b.roas - a.roas)[0];
      const worst = stats.slice().sort((a, b) => a.roas - b.roas)[0];
      if (best.p !== worst.p && best.roas > 0 && worst.roas < best.roas * 0.6 && worst.spend > t.minSpendToJudge) {
        add('medium', 60 + worst.spend / 100, worst.p, '— ภาพรวมแพลตฟอร์ม —',
          'ย้ายงบข้ามแพลตฟอร์ม',
          `<b>${PLAT_LABEL[best.p]}</b> ทำ ROAS ได้ ${best.roas.toFixed(2)}x ขณะที่ <b>${PLAT_LABEL[worst.p]}</b> ได้แค่ ${worst.roas.toFixed(2)}x ลองย้ายงบบางส่วนจาก ${PLAT_LABEL[worst.p]} ไป ${PLAT_LABEL[best.p]}`,
          'เพิ่มผลตอบแทนรวมของพอร์ต');
      }
    }
  }

  // ---- สรุปตัวเลขสำหรับส่งให้ AI ----
  function summarizeForAI(records, totals, targets) {
    const lines = records.map((r) =>
      `[${r.platform}] ${r.campaign} | spend ${Math.round(r.spend)} | imp ${r.impressions} | clicks ${r.clicks} | CTR ${r.ctr.toFixed(2)}% | conv ${r.conversions} | CPA ${Math.round(r.cpa)} | ROAS ${r.roas.toFixed(2)}`
    );
    return { lines, totals, targets };
  }

  global.AdsRecommend = { analyze, summarizeForAI, DEFAULT_TARGETS, baht, pct };
})(typeof window !== 'undefined' ? window : globalThis);
