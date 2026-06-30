/* ai.js — เรียก LLM ด้วย API key ของผู้ใช้เอง (ทำงานฝั่งเบราว์เซอร์)
 * รองรับ Anthropic (Claude) และ OpenAI (GPT)
 * คีย์ถูกเก็บใน localStorage ของผู้ใช้ ไม่ถูกส่งไปเซิร์ฟเวอร์อื่นใดนอกจากผู้ให้บริการ AI โดยตรง
 */
(function (global) {
  'use strict';

  const KEY_STORE = 'ads_ai_key';
  const PROVIDER_STORE = 'ads_ai_provider';

  function saveKey(provider, key) {
    localStorage.setItem(PROVIDER_STORE, provider);
    localStorage.setItem(KEY_STORE, key);
  }
  function getKey() {
    return { provider: localStorage.getItem(PROVIDER_STORE) || 'anthropic', key: localStorage.getItem(KEY_STORE) || '' };
  }
  function hasKey() { return !!localStorage.getItem(KEY_STORE); }

  function buildPrompt(summary) {
    const { lines, totals, targets } = summary;
    return `คุณเป็นผู้เชี่ยวชาญ performance marketing ช่วยวิเคราะห์ข้อมูลโฆษณาด้านล่างนี้ (รวม 3 แพลตฟอร์ม: Facebook, Google, TikTok)

เป้าหมายของลูกค้า:
- CPA เป้าหมาย: ${targets.cpaTarget} บาท
- ROAS เป้าหมาย: ${targets.roasTarget}x
- CTR ขั้นต่ำ: ${targets.ctrMin}%

ยอดรวมทั้งหมด: ใช้จ่าย ${Math.round(totals.spend)} บาท, ${totals.conversions} conversions, ROAS ${totals.roas.toFixed(2)}x, CTR ${totals.ctr.toFixed(2)}%

ข้อมูลรายแคมเปญ:
${lines.join('\n')}

กรุณาตอบเป็นภาษาไทย ให้คำแนะนำเชิงกลยุทธ์ 4-6 ข้อที่ลงมือทำได้จริงในเดือนหน้า เรียงตามความสำคัญ แต่ละข้อระบุ: (1) สิ่งที่ควรทำ (2) เหตุผลจากตัวเลข (3) ผลที่คาดว่าจะได้ ตอบกระชับ ตรงประเด็น ใช้ bullet ได้`;
  }

  async function callAnthropic(key, prompt) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('Anthropic API: ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    return (data.content || []).map((c) => c.text).join('\n');
  }

  async function callOpenAI(key, prompt) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error('OpenAI API: ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const data = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async function generate(summary) {
    const { provider, key } = getKey();
    if (!key) throw new Error('ยังไม่ได้ตั้งค่า API key — ไปที่หน้า "จัดการข้อมูล" เพื่อใส่คีย์');
    const prompt = buildPrompt(summary);
    return provider === 'openai' ? callOpenAI(key, prompt) : callAnthropic(key, prompt);
  }

  global.AdsAI = { saveKey, getKey, hasKey, generate, buildPrompt };
})(typeof window !== 'undefined' ? window : globalThis);
