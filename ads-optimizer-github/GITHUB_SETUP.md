# วิธีนำขึ้น GitHub และ Deploy

โปรเจกต์นี้เป็นเว็บ static (HTML/CSS/JS ล้วน) ไม่ต้อง build เอาขึ้น GitHub แล้ว deploy ได้ทันที

## 1) สร้าง repository (แบบ Private)

**วิธี A — ผ่านเว็บ GitHub (ง่ายสุด)**
1. ไปที่ https://github.com/new
2. ตั้งชื่อ repo เช่น `ads-optimizer` แล้วเลือก **Private**
3. ยังไม่ต้องติ๊ก Add README/License (เพราะมีอยู่ในโปรเจกต์แล้ว)
4. กด **Create repository** แล้วทำตามขั้น 2

**วิธี B — ผ่าน GitHub CLI (`gh`)**
```bash
gh repo create ads-optimizer --private --source=. --remote=origin --push
```
(ถ้าใช้วิธี B ข้ามไปข้อ 3 ได้เลย)

## 2) push โค้ดขึ้น repo

เปิด terminal ในโฟลเดอร์นี้ แล้วรัน (แทน `<USERNAME>` ด้วยชื่อผู้ใช้ GitHub ของคุณ):

```bash
git init
git add .
git commit -m "Initial commit: Yushi Ads Optimizer dashboard"
git branch -M main
git remote add origin https://github.com/<USERNAME>/ads-optimizer.git
git push -u origin main
```

## 3) Deploy (เลือกอย่างใดอย่างหนึ่ง — ใส่ไฟล์ตั้งค่าให้ครบแล้ว)

### Netlify
- ไปที่ https://app.netlify.com → Add new site → Import an existing project → เลือก repo นี้
- ไม่ต้องตั้งค่าอะไร (มี `netlify.toml` ให้แล้ว) → Deploy

### Vercel
- ไปที่ https://vercel.com/new → Import repo นี้
- Framework Preset: **Other**, ไม่ต้องตั้ง build (มี `vercel.json` ให้แล้ว) → Deploy

### GitHub Pages (ฟรี ใช้ได้แม้ repo เป็น Private ถ้าเป็นบัญชี Pro/Org)
- มี GitHub Actions workflow ให้แล้วที่ `.github/workflows/deploy-pages.yml`
- ไปที่ repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**
- ทุกครั้งที่ push ขึ้น `main` เว็บจะ deploy อัตโนมัติ ลิงก์อยู่ในแท็บ Actions/Pages

## หมายเหตุ
- ข้อมูลที่อัปโหลด (CSV/Excel) และ API key เก็บอยู่ใน **เบราว์เซอร์ของผู้ใช้แต่ละคน** ไม่ได้ส่งขึ้น server หรือ repo
- การอ่านไฟล์ Excel และกราฟใช้ไลบรารีจาก CDN (ต้องต่ออินเทอร์เน็ตตอนเปิดเว็บ)
- หลัง deploy ใหม่ ถ้าเห็นเว็บยังเป็นเวอร์ชันเก่า ให้กด **Ctrl+Shift+R** (ล้างแคช)
