# CLAUDE.md — คู่มือสำหรับ Claude (และผู้ช่วยทุกคน) ในรีโปนี้

ไฟล์นี้ถูกอ่านอัตโนมัติทุกครั้งที่เปิด Claude Code ในรีโปนี้ และถูก **commit เข้า git**
ดังนั้น "ความจำ" ในไฟล์นี้จะเดินทางไปพร้อมกับโค้ดทุกที่ที่ clone/pull (นี่คือวิธีทำให้ความจำตามไปกับ git)

---

## โปรเจกต์นี้คืออะไร

**Ads Optimizer (billing_ymt)** — แดชบอร์ดโฆษณา Facebook/Google/TikTok ของ Yushi
อัปโหลด CSV/XLSX รายเดือน → รวมยอด คำนวณ metric และให้คำแนะนำ optimize

- เป็น **static web app ฝั่ง browser ล้วนๆ** — ไม่มี backend, ไม่มี server-side code
- ไฟล์หลัก: `index.html`, `css/styles.css`, `js/*.js` (app.js, parsers.js, recommendations.js, ai.js, units.js)
- ไม่มี `package.json` (ตั้งใจ — ดู `.gitignore`), ไม่มี build step

## ⚠️ เรื่อง Database — โปรเจกต์นี้ "ไม่มี และไม่ต้องมี" database

- ข้อมูลทั้งหมดเก็บใน **`localStorage` ของ browser** ผู้ใช้แต่ละคน
  - key หลัก: store รายเดือน (`{ 'YYYY-MM': { facebook:[], google:[], tiktok:[] } }`) + `ads_targets`
  - ดู `loadStore()` / `saveStore()` ใน `js/app.js`
- การเรียก `fetch` มีที่เดียวคือโหลดไฟล์ตัวอย่างจาก `sample-data/` — ไม่ได้ต่อ API/DB ใดๆ
- **อย่าพยายาม setup MySQL/PostgreSQL/MongoDB ให้โปรเจกต์นี้** เว้นแต่จะมีการเปลี่ยนสถาปัตยกรรม (เพิ่ม backend) อย่างชัดเจน
- ข้อจำกัดที่ต้องรู้: ข้อมูล **ไม่ share ข้ามเครื่อง/เบราว์เซอร์** และจะหายถ้า clear browser storage
  - ถ้าวันหนึ่งต้องการข้อมูลรวมศูนย์/แชร์กันหลายคน → ค่อยเพิ่ม backend + database (เป็นเฟสถัดไป ดู README หัวข้อ "ข้อจำกัดและขั้นถัดไป")

## Deploy (รวมถึง Plesk)

เพราะเป็น static site จึงต้องการแค่ "เสิร์ฟไฟล์" ไม่ต้องมี runtime/DB:

- **Plesk** (production ปัจจุบัน): ไม่ต้องสร้าง database ใดๆ
  1. Websites & Domains → เพิ่ม domain/subdomain
  2. เอาไฟล์ทั้งหมด (index.html, css/, js/, sample-data/) ไปวางใน document root (ปกติคือ `httpdocs/`)
  3. แนะนำใช้ **Plesk Git** ผูกกับ `https://github.com/neonuafah/billing_ymt.git` branch `main`, deploy path = `httpdocs`, แล้วใช้ Pull/auto-deploy เวลามี push ใหม่
  4. ไม่ต้องตั้ง PHP/Node/MySQL — เป็นไฟล์ static ที่ Apache/Nginx เสิร์ฟตรงๆ
- ทางเลือกอื่น (ฟรี): Netlify (มี `netlify.toml`), Vercel (มี `vercel.json`), GitHub Pages, Cloudflare Pages

## โครงสร้าง git ที่ต้องระวัง (สำคัญ)

มี git repo **ซ้อนกัน 2 ชั้น**:
- โฟลเดอร์แม่ `billing/` มี `.git` แยก (branch `master`, ยังไม่มี commit, ไม่มี remote) — เป็น repo ที่ไม่ได้ใช้
- **รีโปจริงคือโฟลเดอร์นี้** `billing/billing_ymt/` (branch `main`, remote = GitHub `neonuafah/billing_ymt`)

➡️ ทำงาน/commit/push **ในโฟลเดอร์ `billing_ymt/` นี้เท่านั้น** (อย่าไป commit ที่โฟลเดอร์แม่)

## 🔁 วิธีทำงานกับทีม (อ่านให้ครบ)

คนที่แก้โปรเจกต์นี้ **ไม่ถนัด git และ database** — ดังนั้นเมื่อช่วยแก้โค้ดในรีโปนี้:

1. **จัดการ git ให้ทั้งหมดแทนผู้ใช้** — ผู้ใช้ไม่ต้องพิมพ์คำสั่ง git เอง
2. **พอแก้เสร็จในแต่ละงาน ให้ commit + push ให้เลย** โดยอัตโนมัติ (ผู้ใช้อนุญาตไว้แล้ว):
   ```bash
   git add -A
   git commit -m "<สรุปสิ่งที่เปลี่ยน เป็นภาษาไทยอ่านง่าย>"
   git push
   ```
   - commit เมื่อ "งานเสร็จจริง" เป็นก้อนที่มีความหมาย (อย่า commit งานที่ยังค้าง)
   - ข้อความ commit เขียนให้คนทั่วไปอ่านรู้เรื่อง
3. **อย่าตั้ง/แก้ database** ให้โปรเจกต์ — มันไม่ต้องใช้ (ดูหัวข้อ Database ด้านบน)
4. อธิบายสิ่งที่ทำเป็นภาษาไทยสั้นๆ ให้ผู้ใช้เข้าใจ โดยไม่ต้องลงรายละเอียด git

## รันในเครื่อง (local)

ต้องเปิดผ่าน web server (เพราะโหลด sample-data ด้วย `fetch`):
```bash
python3 -m http.server 8000   # แล้วเปิด http://localhost:8000
```
