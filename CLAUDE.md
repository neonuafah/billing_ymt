# CLAUDE.md — คู่มือสำหรับ Claude (และผู้ช่วยทุกคน) ในรีโปนี้

ไฟล์นี้ถูกอ่านอัตโนมัติทุกครั้งที่เปิด Claude Code ในรีโปนี้ และถูก **commit เข้า git**
ดังนั้น "ความจำ" ในไฟล์นี้จะเดินทางไปพร้อมกับโค้ดทุกที่ที่ clone/pull (นี่คือวิธีทำให้ความจำตามไปกับ git)

---

## โปรเจกต์นี้คืออะไร

**Ads Optimizer (billing_ymt)** — แดชบอร์ดโฆษณา Facebook/Google/TikTok ของ Yushi
อัปโหลด CSV/XLSX รายเดือน → รวมยอด คำนวณ metric และให้คำแนะนำ optimize

- frontend เป็น **static web app ฝั่ง browser** + backend PHP เล็กๆ ใน `api/` (เพิ่มภายหลังเพื่อเก็บข้อมูลรวมศูนย์)
- ไฟล์หลัก: `index.html`, `css/styles.css`, `js/*.js` (app.js, parsers.js, recommendations.js, ai.js, units.js), `api/*.php`
- ไม่มี `package.json` (ตั้งใจ — ดู `.gitignore`), ไม่มี build step

## เรื่อง Database — ตอนนี้ "มี" แล้ว (MySQL ผ่าน PHP)

> เดิมเก็บใน localStorage ของแต่ละเบราว์เซอร์ → เปลี่ยนเป็นเก็บบนเซิร์ฟเวอร์เพื่อให้ **ทุกคนเห็นข้อมูลชุดเดียวกัน**

- backend อยู่ใน `api/`:
  - `api/data.php` — REST endpoint (GET อ่านทั้งหมด, POST `save`/`deleteMonth`/`clearAll`/`saveTargets`)
  - `api/db.php` — ต่อ MySQL (PDO) + **สร้างตาราง `ad_months`, `ad_settings` ให้อัตโนมัติ** (ไม่ต้องรัน SQL เอง)
  - `api/config.php` — รหัสฐานข้อมูล **ถูก gitignore** (สร้างบนเซิร์ฟเวอร์เองจาก `config.sample.php`)
  - วิธี setup ละเอียด: `api/README.md`
- ฝั่ง frontend (`js/app.js`): ชั้นเก็บข้อมูลคือ `bootStore()` / `saveStore()` / `persist()` / `persistDeleteMonth()`
  - ตอนเปิดแอป `bootStore()` จะลองต่อ `api/data.php` ก่อน; ถ้าต่อไม่ได้ (เช่นรัน local ด้วย python ไม่มี PHP) จะ **fallback ไป localStorage** อัตโนมัติ (`useServer=false`) — dev เดิมยังทำงานได้
  - การ save บนเซิร์ฟเวอร์ใช้ **upsert (ไม่ลบเดือนที่ไม่ได้ส่งมา)** กันข้อมูลทับกันเวลาหลายคนใช้พร้อมกัน; การลบเดือนมี endpoint แยก
- **การเข้าถึง: เปิดให้ทุกคน ไม่มีรหัส** (ตามที่เจ้าของเลือก) — ใครมี URL ก็ดู/แก้/ลบได้ ถ้าจะจำกัดต้องเพิ่ม auth ทีหลัง

## Deploy (Plesk — production ปัจจุบัน)

ตอนนี้ต้องมี PHP + MySQL (ไม่ใช่ static ล้วนแล้ว):

1. Websites & Domains → โดเมนของเว็บ (PHP เปิด default อยู่แล้ว)
2. เอาไฟล์ทั้งหมด (รวมโฟลเดอร์ `api/`) ไปวางใน document root (ปกติ `httpdocs/`)
3. สร้าง MySQL database ใน Plesk แล้วทำตาม **`api/README.md`** (คัดลอก `config.sample.php` → `config.php` ใส่รหัส)
4. แนะนำใช้ **Plesk Git** ผูกกับ `https://github.com/neonuafah/billing_ymt.git` branch `main`, deploy path = `httpdocs` — `config.php` ที่สร้างบนเซิร์ฟเวอร์จะไม่ถูกแตะเวลา pull (เพราะไม่อยู่ใน git)
- หมายเหตุ: Netlify/Vercel/GitHub Pages เป็น static-only จะรันได้แค่ส่วนหน้า (ข้อมูลจะ fallback เป็น localStorage ของเครื่องนั้น ไม่ใช่ข้อมูลรวมศูนย์) — production จริงต้องใช้ที่รัน PHP ได้ เช่น Plesk

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
