<?php
/**
 * Content endpoints: blog, ratings, email events, settings, admin stats.
 */

/* ---------- Blog ---------- */

function h_blog_list(): void
{
    $rows = jcj_db()->query('SELECT * FROM jc_blog ORDER BY created_at DESC')->fetchAll();
    jcj_ok(['posts' => jcj_decode_rows($rows, 'jc_blog')]);
}

function h_blog_save(): void
{
    jcj_require_user();
    $b = jcj_json_input();
    $post = $b['post'] ?? $b;
    if (!is_array($post)) {
        jcj_fail('Missing blog post.', 422, 'bad_post');
    }
    $id = substr(trim((string)($post['id'] ?? '')), 0, 64);
    if ($id === '') {
        $id = 'post_' . round(microtime(true) * 1000);
    }
    $likes = isset($post['likes']) ? (int)$post['likes'] : 0;
    $stmt = jcj_db()->prepare('INSERT INTO jc_blog (id, author, role, title, body, likes) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $id,
        trim((string)($post['author'] ?? '')),
        trim((string)($post['role'] ?? '')),
        trim((string)($post['title'] ?? '')),
        (string)($post['body'] ?? ''),
        $likes,
    ]);
    $sel = jcj_db()->prepare('SELECT * FROM jc_blog WHERE id = ? LIMIT 1');
    $sel->execute([$id]);
    $row = jcj_decode_rows($sel->fetchAll(), 'jc_blog')[0];
    jcj_ok(['post' => $row]);
}

function h_blog_like(): void
{
    jcj_require_user();
    $b = jcj_json_input();
    $id = substr(trim((string)($b['id'] ?? '')), 0, 64);
    $likes = isset($b['likes']) ? max(0, (int)$b['likes']) : 0;
    if ($id === '') {
        jcj_fail('Missing blog post id.', 422, 'bad_id');
    }
    jcj_db()->prepare('UPDATE jc_blog SET likes = ? WHERE id = ?')->execute([$likes, $id]);
    jcj_ok();
}

/* ---------- Ratings ---------- */

function h_ratings_list(): void
{
    $rows = jcj_db()->query('SELECT * FROM jc_ratings ORDER BY created_at DESC')->fetchAll();
    jcj_ok(['ratings' => jcj_decode_rows($rows, 'jc_ratings')]);
}

function h_ratings_save(): void
{
    jcj_require_user();
    $b = jcj_json_input();
    $r = $b['rating'] ?? $b;
    if (!is_array($r)) {
        jcj_fail('Missing rating.', 422, 'bad_rating');
    }
    $id = substr(trim((string)($r['id'] ?? '')), 0, 64);
    if ($id === '') {
        $id = 'rate_' . round(microtime(true) * 1000);
    }
    $stars = isset($r['stars']) ? (int)$r['stars'] : 0;
    if ($stars < 1 || $stars > 5) {
        jcj_fail('Rating must be between 1 and 5 stars.', 422, 'bad_stars');
    }
    $stmt = jcj_db()->prepare('INSERT INTO jc_ratings (id, name, role, stars, feel, recommend, comment) VALUES (?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute([
        $id,
        trim((string)($r['name'] ?? '')),
        trim((string)($r['role'] ?? '')),
        $stars,
        trim((string)($r['feel'] ?? '')),
        trim((string)($r['recommend'] ?? '')),
        (string)($r['comment'] ?? ''),
    ]);
    $sel = jcj_db()->prepare('SELECT * FROM jc_ratings WHERE id = ? LIMIT 1');
    $sel->execute([$id]);
    $row = jcj_decode_rows($sel->fetchAll(), 'jc_ratings')[0];
    jcj_ok(['rating' => $row]);
}

/* ---------- Email events ---------- */

const JCJ_EMAIL_EVENT_INPUT = [
    'email', 'status', 'message_id', 'subject', 'channel', 'invite_date',
    'invite_time', 'venue', 'note', 'candidate_id', 'employer_id',
    'bounce_type', 'reason', 'provider',
];

function h_email_events_record(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $evt = $b['event'] ?? $b;
    if (!is_array($evt)) {
        jcj_fail('Missing email event.', 422, 'bad_event');
    }
    $id = 'evt_' . jcj_random_id(6);
    $cols = ['id'];
    $placeholders = ['?'];
    $params = [$id];
    foreach (JCJ_EMAIL_EVENT_INPUT as $col) {
        if (!array_key_exists($col, $evt)) {
            continue;
        }
        $cols[] = $col;
        $placeholders[] = '?';
        $params[] = $evt[$col];
    }
    // Always bind the caller as employer if not provided.
    if (!in_array('employer_id', $cols, true)) {
        $cols[] = 'employer_id';
        $placeholders[] = '?';
        $params[] = $u['id'];
    }
    jcj_db()->prepare('INSERT INTO jc_email_events (`' . implode('`, `', $cols) . '`) VALUES (' . implode(', ', $placeholders) . ')')->execute($params);
    jcj_ok();
}

function h_email_events_list(): void
{
    jcj_require_user();
    $rows = jcj_db()->query('SELECT * FROM jc_email_events ORDER BY created_at DESC LIMIT 2000')->fetchAll();
    jcj_ok(['events' => $rows]);
}

/* ---------- Settings ---------- */

function h_settings_get(): void
{
    $key = trim((string)($_GET['key'] ?? ''));
    if ($key === '') {
        jcj_ok(['value' => null]);
        return;
    }
    $stmt = jcj_db()->prepare('SELECT `value` FROM jc_settings WHERE `key` = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch();
    $val = null;
    if ($row && is_string($row['value']) && $row['value'] !== '') {
        $val = json_decode($row['value'], true);
    }
    jcj_ok(['value' => $val]);
}

function h_settings_set(): void
{
    jcj_require_admin();
    $b = jcj_json_input();
    $key = substr(trim((string)($b['key'] ?? '')), 0, 120);
    if ($key === '') {
        jcj_fail('Missing setting key.', 422, 'bad_key');
    }
    $value = json_encode($b['value'] ?? null);
    $stmt = jcj_db()->prepare(
        'INSERT INTO jc_settings (`key`, `value`, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute([$key, $value]);
    jcj_ok();
}

/* ---------- Admin stats ---------- */

function h_admin_stats(): void
{
    jcj_require_admin();
    $db = jcj_db();
    $users = (int)$db->query('SELECT COUNT(*) FROM jc_users')->fetchColumn();
    $unlocks = (int)$db->query('SELECT COUNT(*) FROM jc_unlocks')->fetchColumn();
    $stmt = $db->query("SELECT COALESCE(SUM(amount_ngn), 0) AS total_ngn, COUNT(*) AS paid_count FROM jc_payments WHERE status = 'confirmed'");
    $row = $stmt->fetch();
    jcj_ok([
        'users' => $users,
        'unlocks' => $unlocks,
        'total' => (float)$row['total_ngn'],
        'paidCount' => (int)$row['paid_count'],
    ]);
}

/* ---------- Unlocks (read-only overview for the employer dash) ---------- */

function h_unlocks_list(): void
{
    $u = jcj_require_user();
    $stmt = jcj_db()->prepare('SELECT * FROM jc_unlocks WHERE employer_id = ? ORDER BY unlocked_at DESC');
    $stmt->execute([$u['id']]);
    jcj_ok(['unlocks' => jcj_decode_rows($stmt->fetchAll(), 'jc_unlocks')]);
}