<?php
declare(strict_types=1);

// API เก็บ/อ่านข้อมูลโฆษณาแบบรวมศูนย์ (ทุกคนเห็นข้อมูลชุดเดียวกัน)
//   GET  api/data.php                      → { ok, store:{ 'YYYY-MM':{facebook,google,tiktok} }, targets:{}, overrides:{} }
//   POST api/data.php  { action:'save', store:{...} }            → upsert ทุกเดือน (ไม่ลบเดือนที่ไม่ได้ส่งมา)
//   POST api/data.php  { action:'deleteMonth', month:'YYYY-MM' } → ลบเดือนนั้น
//   POST api/data.php  { action:'clearAll' }                     → ลบทุกเดือน
//   POST api/data.php  { action:'saveTargets', targets:{...} }   → บันทึกค่าเป้าหมาย
//   POST api/data.php  { action:'saveUnitOverrides', overrides:{ '<ข้อความในชื่อแคมเปญ>':'<หน่วย>' } } → กำหนดหน่วยธุรกิจเองรายแคมเปญ

require __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$pdo = db();

if ($method === 'GET') {
    $store = [];
    foreach ($pdo->query("SELECT month, data FROM ad_months") as $row) {
        $decoded = json_decode($row['data'], true);
        $store[$row['month']] = is_array($decoded) ? $decoded : ['facebook' => [], 'google' => [], 'tiktok' => []];
    }
    $targets = new stdClass();
    $st = $pdo->query("SELECT v FROM ad_settings WHERE k = 'targets'")->fetch();
    if ($st) {
        $t = json_decode($st['v'], true);
        if (is_array($t)) $targets = $t;
    }
    // หน่วยธุรกิจที่กำหนดเอง (รายแคมเปญ) — ใช้กับแคมเปญที่ชื่อไม่มีคำบอกใบ้ ให้ชนะการ detect อัตโนมัติ
    $overrides = new stdClass();
    $ov = $pdo->query("SELECT v FROM ad_settings WHERE k = 'unitOverrides'")->fetch();
    if ($ov) {
        $o = json_decode($ov['v'], true);
        if (is_array($o)) $overrides = (object) $o;
    }
    send_json(['ok' => true, 'store' => (object) $store, 'targets' => $targets, 'overrides' => $overrides]);
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 20 * 1024 * 1024) send_json(['ok' => false, 'error' => 'ข้อมูลใหญ่เกินไป'], 413);

    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['action'])) send_json(['ok' => false, 'error' => 'รูปแบบคำขอไม่ถูกต้อง'], 400);

    $isMonth = static fn($m) => is_string($m) && preg_match('/^\d{4}-\d{2}$/', $m) === 1;

    switch ($body['action']) {
        case 'save':
            $store = $body['store'] ?? null;
            if (!is_array($store)) send_json(['ok' => false, 'error' => 'store ไม่ถูกต้อง'], 400);
            $stmt = $pdo->prepare(
                "INSERT INTO ad_months (month, data) VALUES (:m, :d)
                 ON DUPLICATE KEY UPDATE data = VALUES(data)"
            );
            $pdo->beginTransaction();
            foreach ($store as $month => $data) {
                if (!$isMonth($month)) continue;
                $stmt->execute([':m' => $month, ':d' => json_encode($data, JSON_UNESCAPED_UNICODE)]);
            }
            $pdo->commit();
            send_json(['ok' => true]);

        case 'deleteMonth':
            $m = $body['month'] ?? '';
            if (!$isMonth($m)) send_json(['ok' => false, 'error' => 'month ไม่ถูกต้อง'], 400);
            $pdo->prepare("DELETE FROM ad_months WHERE month = ?")->execute([$m]);
            send_json(['ok' => true]);

        case 'clearAll':
            $pdo->exec("DELETE FROM ad_months");
            send_json(['ok' => true]);

        case 'saveTargets':
            $targets = $body['targets'] ?? [];
            if (!is_array($targets)) send_json(['ok' => false, 'error' => 'targets ไม่ถูกต้อง'], 400);
            $stmt = $pdo->prepare(
                "INSERT INTO ad_settings (k, v) VALUES ('targets', :v)
                 ON DUPLICATE KEY UPDATE v = VALUES(v)"
            );
            $stmt->execute([':v' => json_encode($targets, JSON_UNESCAPED_UNICODE)]);
            send_json(['ok' => true]);

        case 'saveUnitOverrides':
            $ov = $body['overrides'] ?? [];
            if (!is_array($ov)) send_json(['ok' => false, 'error' => 'overrides ไม่ถูกต้อง'], 400);
            $stmt = $pdo->prepare(
                "INSERT INTO ad_settings (k, v) VALUES ('unitOverrides', :v)
                 ON DUPLICATE KEY UPDATE v = VALUES(v)"
            );
            $stmt->execute([':v' => json_encode($ov, JSON_UNESCAPED_UNICODE)]);
            send_json(['ok' => true]);

        default:
            send_json(['ok' => false, 'error' => 'ไม่รู้จัก action'], 400);
    }
}

send_json(['ok' => false, 'error' => 'method ไม่รองรับ'], 405);
