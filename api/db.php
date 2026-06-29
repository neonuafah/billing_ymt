<?php
declare(strict_types=1);

// ส่ง JSON กลับแล้วจบการทำงาน
function send_json($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// เชื่อมต่อฐานข้อมูล + สร้างตารางอัตโนมัติถ้ายังไม่มี (ทีมไม่ต้องรัน SQL เอง)
function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $cfgFile = __DIR__ . '/config.php';
    if (!is_file($cfgFile)) {
        send_json(['ok' => false, 'error' => 'ยังไม่ได้ตั้งค่า api/config.php (คัดลอกจาก config.sample.php แล้วใส่ข้อมูลฐานข้อมูลจาก Plesk)'], 500);
    }
    $cfg = require $cfgFile;
    $dsn = "mysql:host={$cfg['host']};dbname={$cfg['name']};charset={$cfg['charset']}";

    try {
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (Throwable $e) {
        // ไม่เปิดเผยรายละเอียด error ให้ผู้ใช้ภายนอก
        send_json(['ok' => false, 'error' => 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ — ตรวจสอบค่าใน api/config.php'], 500);
    }

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS ad_months (
            month      VARCHAR(7)   NOT NULL PRIMARY KEY,
            data       MEDIUMTEXT   NOT NULL,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS ad_settings (
            k VARCHAR(64) NOT NULL PRIMARY KEY,
            v MEDIUMTEXT  NOT NULL
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    return $pdo;
}
