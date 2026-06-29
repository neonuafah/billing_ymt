<?php
declare(strict_types=1);

// ระบบเข้าสู่ระบบผู้ดูแล
//   GET  api/auth.php                                  → { ok:true, authed:bool }   (เช็คสถานะ)
//   POST api/auth.php { action:'login', username, password } → ตรวจรหัสแล้วเปิด session
//   POST api/auth.php { action:'logout' }              → ออกจากระบบ

require __DIR__ . '/db.php';
require __DIR__ . '/session.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    send_json(['ok' => true, 'authed' => is_admin()]);
}

if ($method === 'POST') {
    $body   = json_decode(file_get_contents('php://input'), true);
    $action = is_array($body) ? ($body['action'] ?? '') : '';

    if ($action === 'logout') {
        start_session();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], (bool)$p['secure'], (bool)$p['httponly']);
        }
        session_destroy();
        send_json(['ok' => true, 'authed' => false]);
    }

    if ($action === 'login') {
        $c    = cfg();
        $user = (string) ($body['username'] ?? '');
        $pass = (string) ($body['password'] ?? '');
        $cfgUser = (string) ($c['admin_user'] ?? '');
        $cfgPass = (string) ($c['admin_pass'] ?? '');

        // เทียบแบบ constant-time กันการเดารหัสด้วยเวลา
        $ok = $cfgPass !== '' && hash_equals($cfgUser, $user) && hash_equals($cfgPass, $pass);
        if ($ok) {
            start_session();
            session_regenerate_id(true);   // กัน session fixation
            $_SESSION['admin'] = true;
            send_json(['ok' => true, 'authed' => true]);
        }

        usleep(300000); // หน่วง 0.3s กัน brute-force
        send_json(['ok' => false, 'error' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'authed' => false], 401);
    }

    send_json(['ok' => false, 'error' => 'ไม่รู้จัก action'], 400);
}

send_json(['ok' => false, 'error' => 'method ไม่รองรับ'], 405);
