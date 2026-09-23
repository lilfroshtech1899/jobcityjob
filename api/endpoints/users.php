<?php
/**
 * User (jc_users) endpoints: profile row create/update, lookups.
 * Every action is scoped to the authenticated session user.
 */

function h_users_ensure(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $type = trim((string)($b['type'] ?? $u['type']));
    $name = trim((string)($b['name'] ?? ''));
    $country = trim((string)($b['country'] ?? ''));
    if (!in_array($type, ['employee', 'employer'], true)) {
        $type = 'employee';
    }
    $db = jcj_db();
    $stmt = $db->prepare(
        'INSERT INTO jc_users (id, email, password_hash, type, name, country, profile_complete, messages, pipeline)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
         ON DUPLICATE KEY UPDATE type = VALUES(type), name = VALUES(name), country = VALUES(country)'
    );
    $stmt->execute([$u['id'], $u['email'], '!', $type, $name !== '' ? $name : null, $country !== '' ? $country : null, '[]', '[]']);

    $sel = $db->prepare('SELECT * FROM jc_users WHERE id = ? LIMIT 1');
    $sel->execute([$u['id']]);
    $row = $sel->fetch();
    $shape = jcj_user_shape(jcj_decode_rows([$row], 'jc_users')[0]);
    $shape['user_metadata'] = ['type' => $type, 'name' => $name, 'country' => $country];
    jcj_ok(['user' => $shape]);
}

function h_profile_update(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $userId = (string)($b['id'] ?? '');
    $patch = $b['patch'] ?? null;
    if (!is_array($patch)) {
        jcj_fail('Missing update patch.', 422, 'bad_patch');
    }
    if ($userId === '' || $userId !== (string)$u['id']) {
        jcj_fail('You can only update your own profile.', 403, 'forbidden');
    }

    $allowed = ['profile_complete' => 'bool', 'name' => 'string', 'messages' => 'json', 'pipeline' => 'json'];
    $fields = [];
    $params = [];
    foreach ($patch as $k => $v) {
        if (!array_key_exists($k, $allowed)) {
            continue;
        }
        $type = $allowed[$k];
        if ($type === 'bool') {
            $v = $v ? 1 : 0;
        } elseif ($type === 'string') {
            $v = (string)$v;
        } elseif ($type === 'json') {
            $v = json_encode(is_array($v) ? $v : []);
        }
        $fields[] = "`$k` = ?";
        $params[] = $v;
    }
    if (!$fields) {
        jcj_ok(['row' => $u]);
        return;
    }
    $params[] = $userId;
    $db = jcj_db();
    $db->prepare('UPDATE jc_users SET ' . implode(', ', $fields) . ', updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute($params);

    $sel = $db->prepare('SELECT * FROM jc_users WHERE id = ? LIMIT 1');
    $sel->execute([$userId]);
    $row = jcj_decode_rows($sel->fetchAll(), 'jc_users')[0];
    jcj_ok(['row' => $row]);
}

function h_users_get(): void
{
    $u = jcj_require_user();
    $id = (string)($_GET['id'] ?? '');
    if ($id === '' || $id !== (string)$u['id']) {
        jcj_ok(['user' => null]);
        return;
    }
    jcj_ok(['user' => $u]);
}

function h_users_by_email(): void
{
    $u = jcj_require_user();
    $email = strtolower(trim((string)($_GET['email'] ?? '')));
    if ($email === '' || $email !== (string)$u['email']) {
        jcj_ok(['user' => null]);
        return;
    }
    jcj_ok(['user' => $u]);
}