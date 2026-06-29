<?php
// ── ตัวอย่างไฟล์ตั้งค่าฐานข้อมูล ──────────────────────────────
// วิธีใช้: คัดลอกไฟล์นี้เป็น  config.php  (ในโฟลเดอร์ api เดียวกัน)
// แล้วใส่ค่าจริงที่ได้จาก Plesk → Databases
//
// ⚠️ ห้าม commit ไฟล์ config.php ขึ้น git (มี .gitignore กันไว้แล้ว)
//    เพราะมีรหัสผ่านฐานข้อมูลอยู่ข้างใน
return [
    'host'    => 'localhost',          // ปกติคือ localhost บน Plesk
    'name'    => 'YOUR_DB_NAME',       // ชื่อฐานข้อมูลที่สร้างใน Plesk
    'user'    => 'YOUR_DB_USER',       // ชื่อผู้ใช้ฐานข้อมูล
    'pass'    => 'YOUR_DB_PASSWORD',   // รหัสผ่านฐานข้อมูล
    'charset' => 'utf8mb4',
];
