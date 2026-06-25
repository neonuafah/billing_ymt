/* units.js — หน่วยธุรกิจในเครือ Yushi
 * ใช้ตัดข้อมูลข้ามทุกแพลตฟอร์ม โดยตรวจจับจากชื่อแคมเปญ
 *
 * ลำดับการตัดสิน (สำคัญ → รอง):
 *   1) ถ้าชื่อ "ลงท้ายด้วย Group" → เข้า Yushi Group ทั้งหมด
 *   2) ถ้าชื่อ "มีคำว่า Yushi <หน่วยธุรกิจ>" อยู่ตรงไหนก็ได้ → เข้าหน่วยนั้น
 *      (คำชื่อบริษัทชนะแท็กต่อท้ายอย่าง YMT เสมอ เช่น
 *       "Messages-Yushi Industrial (Exhaust) YMT" → Yushi Industrial)
 *   3) สำรอง: ถ้าเจอ keyword สั้น ๆ (ymt, shinsen, ฯลฯ) ที่ใดก็ได้ → เข้าหน่วยนั้น
 *   4) ไม่เข้าเงื่อนไขใดเลย → "ไม่ระบุหน่วยธุรกิจ"
 */
(function (global) {
  'use strict';

  // company = ชื่อบริษัทแบบเต็ม (สัญญาณแรง), keywords = คำสั้นสำรอง (สัญญาณอ่อน)
  const UNITS = [
    { id: 'ymt',        name: 'Yushi Marketing Technology (YMT)', company: ['yushi marketing technology', 'yushi ymt'], keywords: ['marketing technology', 'ymt'] },
    { id: 'fnb',        name: 'Yushi F&B (Shinsen)',              company: ['yushi f&b', 'yushi shinsen', 'shinsen'],   keywords: ['shinsen', 'f&b', 'fnb', 'ชินเซน'] },
    { id: 'bigfan',     name: 'Yushi Bigfan',                     company: ['yushi bigfan', 'yushi big fan'],           keywords: ['bigfan', 'big fan', 'บิ๊กแฟน'] },
    { id: 'industrial', name: 'Yushi Industrial',                 company: ['yushi industrial'],                        keywords: ['industrial', 'อินดัสเทรียล'] },
    { id: 'supply',     name: 'Yushi Supply',                     company: ['yushi supply'],                            keywords: ['supply', 'ซัพพลาย'] },
    { id: 'denki',      name: 'Yushi Denki',                      company: ['yushi denki'],                             keywords: ['denki', 'เด็งกิ', 'เดงกิ'] },
    { id: 'system',     name: 'Yushi System',                     company: ['yushi system'],                            keywords: ['system', 'ซิสเต็ม'] },
    { id: 'solution',   name: 'Yushi Solution',                   company: ['yushi solution'],                          keywords: ['solution', 'โซลูชัน', 'โซลูชั่น'] },
    { id: 'rental',     name: 'Yushi Rental',                     company: ['yushi rental'],                            keywords: ['rental', 'เช่า', 'ให้เช่า'] },
    { id: 'group',      name: 'Yushi Group',                      company: ['yushi group'],                             keywords: ['กรุ๊ป'] },
    { id: 'unassigned', name: 'ไม่ระบุหน่วยธุรกิจ',                company: [],                                          keywords: [] },
  ];

  const BY_ID = Object.fromEntries(UNITS.map((u) => [u.id, u]));

  // ตัดอักขระ/ช่องว่างท้ายสุดออกก่อน เพื่อให้เช็ค "ลงท้ายด้วย" จับคำท้ายได้แม้มี ) | - _ เว้นวรรค
  function tailToken(s) { return s.replace(/[^a-z0-9ก-๙]+$/i, ''); }

  function detect(campaignName) {
    const s = String(campaignName || '').toLowerCase().trim();
    const tail = tailToken(s);

    // 1) ลงท้ายด้วย "group" → Yushi Group ทั้งหมด
    if (/(^|[^a-z])group$/.test(tail)) return 'group';

    // 2) มีชื่อบริษัทเต็ม "yushi <หน่วย>" อยู่ที่ใดก็ได้ (ชนะแท็กต่อท้าย เช่น YMT)
    for (const u of UNITS) {
      for (const c of u.company) {
        if (s.includes(c)) return u.id;
      }
    }

    // 3) สำรอง: keyword สั้น ๆ ที่ใดก็ได้
    for (const u of UNITS) {
      for (const kw of u.keywords) {
        if (s.includes(kw)) return u.id;
      }
    }
    return 'unassigned';
  }

  function label(id) { return (BY_ID[id] || {}).name || id; }

  global.AdsUnits = { UNITS, BY_ID, detect, label };
})(typeof window !== 'undefined' ? window : globalThis);
