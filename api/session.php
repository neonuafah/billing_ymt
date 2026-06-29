<?php
declare(strict_types=1);

// จัดการ session ของผู้ดูแล (ต้อง require db.php ก่อน เพื่อใช้ send_json)

function start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    session_name('ADSAUTH');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'secure'   => $secure,   // ส่ง cookie เฉพาะ HTTPS เมื่อรันบน https
        'samesite' => 'Lax',
    ]);
    session_start();
}

function is_admin(): bool {
    start_session();
    return !empty($_SESSION['admin']);
}

// เรียกหน้า/แอ็กชันที่ต้องล็อกอินก่อน — ถ้ายังไม่ล็อกอินจะตอบ 401 แล้วจบ
function require_admin(): void {
    if (!is_admin()) {
        send_json(['ok' => false, 'error' => 'unauthorized', 'authed' => false], 401);
    }
}
