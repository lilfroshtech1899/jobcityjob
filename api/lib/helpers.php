<?php
/**
 * Jobcityjob API — shared helpers: CORS, sessions, JSON I/O,
 * auth guards, row decoding, error envelope, CSRF, rate limiting.
 */

/** Client IP for rate limiting (respects X-Forwarded-For proxies, first entry wins). */
function jcj_client_ip(): string
{
    $xf = (string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? '');
    if ($xf !== '') {
        $first = trim(explode(',', $xf)[0]);
        if ($first !== '') {
            return substr($first, 0, 64);
        }
    }
    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    return substr($ip, 0, 64);
}

/**
 * CSRF — issue a per-session token and verify it on every state-changing call.
 *
 * Token lifecycle:
 *  - Generated lazily on first need, stored ONLY in the PHP session
 *    (never in the browser, never returned in a URL).
 *  - Exposed to the app via `auth.session` -> csrf_token and also
 *    `auth.profile` (the token the app fetches on page load).
 *  - The client echoes it back in the `X-CSRF-Token` header (or `csrf_token`
 *    form field) on every non-read-only request; index.php compares it with
 *    hash_equals() before dispatching.
 */
function jcj_csrf_token(): string
{
    jcj_start_session();
    if (empty($_SESSION['jcj_csrf']) || !is_string($_SESSION['jcj_csrf'])) {
        $_SESSION['jcj_csrf'] = jcj_random_id(32);
        session_commit();
    }
    return $_SESSION['jcj_csrf'];
}

/**
 * Enforce CSRF for mutating routes. index.php calls this automatically for any
 * route not in $READ_ONLY_ROUTES; individual handlers do not need to re-check.
 */
function jcj_require_csrf(): void
{
    jcj_start_session();
    $expected = (string)($_SESSION['jcj_csrf'] ?? '');
    if ($expected === '') {
        jcj_fail('Missing security token. Please reload the page and try again.', 403, 'csrf_required');
    }
    $incoming = (string)($GLOBALS['jcj_incoming_csrf'] ?? '');
    if ($incoming === '' || !hash_equals($expected, $incoming)) {
        jcj_fail('Your security token has expired. Please reload the page and try again.', 403, 'csrf_mismatch');
    }
}

/**
 * Simple fixed-window rate limiter backed by jc_rate_limits.
 * Calls jcj_fail() (HTTP 429) when the caller has exceeded the cap,
 * otherwise bumps the counter and returns.
 *
 * @param string $bucket stable logical bucket, e.g. 'auth.signin'
 * @param int    $max    max requests allowed per window
 * @param int    $window window length in seconds
 */
function jcj_rate_limit(string $bucket, int $max = 5, int $window = 300): void
{
    $key = jcj_client_ip() . '|' . $bucket;
    $rlKey = 'rl-' . substr(hash('sha256', $key), 0, 44);
    $db = jcj_db();
    $now = time();
    $stmt = $db->prepare(
        'INSERT INTO jc_rate_limits (rl_key, bucket, window_start, count)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           count        = IF(? - window_start >= ?, 1, count + 1),
           window_start = IF(? - window_start >= ?, ?, window_start)'
    );
    $stmt->execute([$rlKey, $bucket, $now, $now, $window, $now, $window, $now]);

    $sel = $db->prepare('SELECT count FROM jc_rate_limits WHERE rl_key = ? LIMIT 1');
    $sel->execute([$rlKey]);
    $count = (int)($sel->fetchColumn() ?: 0);
    if ($count > $max) {
        jcj_fail('Too many attempts. Please wait a moment and try again.', 429, 'rate_limited', ['retry_after' => $window]);
    }
}

/**
 * Global JSON error envelope.
 * Registered as PHP's last-resort exception handler and also called from the
 * router's try/catch so a DB failure or unexpected error produces a consistent
 * `{ok:false,...}` JSON 500 instead of an HTML stack trace.
 */
function jcj_fatal(Throwable $ex): void
{
    error_log('[jobcityjob] ' . $ex->getMessage());
    http_response_code(500);
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
    }
    echo json_encode([
        'ok'      => false,
        'code'    => 'server_error',
        'message' => 'Internal server error. Please try again or contact support.',
    ]);
    exit;
}

function jcj_json_input(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode((string)$raw, true);
    return is_array($body) ? $body : [];
}

function jcj_out($data, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function jcj_ok(array $data = []): void
{
    jcj_out(array_merge(['ok' => true], $data));
}

function jcj_fail(string $message, int $status = 400, ?string $code = null): void
{
    $d = ['ok' => false, 'message' => $message];
    if ($code !== null) {
        $d['code'] = $code;
    }
    jcj_out($d, $status);
}

function jcj_route(): string
{
    $r = $_GET['r'] ?? '';
    return is_string($r) ? trim($r) : '';
}

function jcj_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $name = (jcj_config()['app']['session_name'] ?? 'jcj_sess') ?: 'jcj_sess';
    session_name($name);
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function jcj_session_user(): ?array
{
    jcj_start_session();
    if (empty($_SESSION['jcj_user_id'])) {
        return null;
    }
    $stmt = jcj_db()->prepare('SELECT * FROM jc_users WHERE id = ? LIMIT 1');
    $stmt->execute([$_SESSION['jcj_user_id']]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return jcj_decode_rows([$row], 'jc_users')[0];
}

function jcj_user_shape(array $u): array
{
    return [
        'id'       => $u['id'],
        'email'    => $u['email'],
        'avatar'   => $u['avatar'] ?? null,
        'user_metadata' => [
            'type'    => $u['type'],
            'name'    => $u['name'],
            'country' => $u['country'],
        ],
    ];
}

function jcj_session_shape(?array $u): ?array
{
    if (!$u) {
        return null;
    }
    return ['user' => jcj_user_shape($u)];
}

function jcj_require_user(): array
{
    $u = jcj_session_user();
    if (!$u) {
        jcj_fail('Authentication required. Please log in.', 401, 'not_authenticated');
    }
    return $u;
}

function jcj_is_admin(): bool
{
    jcj_start_session();
    return !empty($_SESSION['jcj_admin']);
}

function jcj_require_admin(): void
{
    jcj_start_session();
    if (empty($_SESSION['jcj_admin'])) {
        jcj_fail('Admin access required.', 403, 'admin_required');
    }
}

/** CORS: same-origin always allowed; extra origins opt in via config. */
function jcj_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $allowed = jcj_config()['app']['allowed_origins'] ?? [];
        $selfHost = $_SERVER['HTTP_HOST'] ?? '';
        $originHost = preg_replace('#^https?://#i', '', rtrim($origin, '/'));
        $selfHost = preg_replace('#^https?://#i', '', $selfHost);
        $ok = in_array($origin, $allowed, true)
            || ($selfHost !== '' && $originHost === $selfHost && !str_contains($selfHost, ':'));
        if (!in_array($origin, $allowed, true) && $originHost === $selfHost && str_contains($selfHost, ':') === false) {
            $ok = true;
        }
        if ($ok) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: X-Requested-With, Content-Type, X-CSRF-Token');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        }
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function jcj_random_id(int $bytes = 16): string
{
    return bin2hex(random_bytes($bytes));
}

/* JSON + numeric columns decoded per table. */
$GLOBALS['jcj_json_columns'] = [
    'jc_users'     => ['messages', 'pipeline'],
    'jc_employees' => ['skills', 'extra'],
    'jc_payments'  => ['candidate_ids'],
    'jc_unlocks'   => ['skills'],
    'jc_settings'  => ['value'],
];

function jcj_decode_rows(array $rows, string $table): array
{
    if (!$rows) {
        return $rows;
    }
    $jsonCols = $GLOBALS['jcj_json_columns'][$table] ?? [];
    $floatCols = ['age', 'experience_years', 'salary_min', 'amount_ngn', 'amount_usd'];
    $intCols = ['amount_kobo', 'likes', 'stars'];
    $boolCols = ['profile_complete', 'id_verified'];
    foreach ($rows as &$row) {
        foreach ($jsonCols as $col) {
            $row[$col] = isset($row[$col]) && is_string($row[$col]) && $row[$col] !== ''
                ? (json_decode($row[$col], true) ?? [])
                : [];
        }
        foreach ($floatCols as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null && $row[$col] !== '') {
                $row[$col] = (float)$row[$col];
            }
        }
        foreach ($intCols as $col) {
            if (array_key_exists($col, $row) && $row[$col] !== null && $row[$col] !== '') {
                $row[$col] = (int)$row[$col];
            }
        }
        foreach ($boolCols as $col) {
            if (array_key_exists($col, $row)) {
                $row[$col] = (bool)$row[$col];
            }
        }
    }
    return $rows;
}