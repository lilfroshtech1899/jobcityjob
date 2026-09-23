<?php
/**
 * Jobcityjob API — configuration loader + PDO connection.
 * Access is server-side only; config.php is never served to the browser.
 */

function jcj_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $file = __DIR__ . '/../config.php';
    if (!is_file($file)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'ok' => false,
            'message' => 'Server not configured: copy api/config.example.php to api/config.php and fill it in.',
        ]);
        exit;
    }
    $cfg = (array)(require $file);
    if (empty($cfg['db']) || !is_array($cfg['db'])) {
        $cfg['db'] = [];
    }
    return $cfg;
}

function jcj_db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $c = jcj_config()['db'];
    $host = $c['host'] ?? '127.0.0.1';
    $name = $c['name'] ?? 'jobcityjob';
    $charset = $c['charset'] ?? 'utf8mb4';
    $dsn = "mysql:host={$host};dbname={$name};charset={$charset}";
    $pdo = new PDO($dsn, $c['user'] ?? 'root', $c['pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}