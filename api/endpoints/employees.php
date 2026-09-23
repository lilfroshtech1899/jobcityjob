<?php
/**
 * Employee (jc_employees) endpoints.
 *
 * Contact data is only served in full to:
 *   - the profile's owner (row.user_id == session user), and
 *   - employers who have a jc_unlocks row for that candidate
 *     (written by the PHP paystack-verify flow — never by a browser).
 * Everyone else gets a redacted row so candidate contact details stay
 * locked until a payment has actually been verified.
 */

const JCJ_REDACTED_FIELDS = [
    'phone', 'whatsapp', 'phone2', 'email', 'address', 'postal', 'dob',
    'id_number', 'ref_name', 'ref_relation', 'ref_phone', 'ref_email',
    'ref_org', 'resume_text', 'summary',
];

const JCJ_EMPLOYEE_COLUMNS = [
    'full_name', 'preferred_name', 'dob', 'gender', 'marital', 'nationality',
    'nationality_code', 'country', 'country_code', 'country_name', 'city',
    'state', 'phone', 'whatsapp', 'phone2', 'email', 'address', 'postal',
    'education', 'field_of_study', 'institution', 'grad_year',
    'certifications', 'experience_years', 'job_title', 'industry',
    'job_category', 'skills', 'availability', 'work_type', 'relocate',
    'preferred_locations', 'salary_min', 'salary_currency', 'salary_period',
    'summary', 'resume_text', 'id_type', 'id_number', 'id_country',
    'id_country_code', 'id_verified', 'ref_name', 'ref_relation', 'ref_phone',
    'ref_email', 'ref_org', 'extra', 'age',
];

function jcj_redact_row(array $r): array
{
    foreach (JCJ_REDACTED_FIELDS as $f) {
        if (array_key_exists($f, $r)) {
            $r[$f] = null;
        }
    }
    $extra = $r['extra'] ?? null;
    if (is_array($extra) && $extra !== []) {
        $r['extra'] = [];
    }
    return $r;
}

/** Return the candidate ids this user has legitimately unlocked. */
function jcj_unlocked_ids(string $userId): array
{
    $stmt = jcj_db()->prepare('SELECT candidate_id FROM jc_unlocks WHERE employer_id = ?');
    $stmt->execute([$userId]);
    $ids = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $cid) {
        $ids[(string)$cid] = true;
    }
    return $ids;
}

/** Processed rows: decoded + redacted according to the caller's entitlements. */
function jcj_present_employees(array $rawRows, ?array $viewer): array
{
    $rows = jcj_decode_rows($rawRows, 'jc_employees');
    if (!$viewer) {
        foreach ($rows as &$r) {
            $r = jcj_redact_row($r);
        }
        return $rows;
    }
    $unlocked = jcj_unlocked_ids((string)$viewer['id']);
    foreach ($rows as &$r) {
        if ((string)($r['user_id'] ?? '') === (string)$viewer['id']) {
            continue; // own profile — always full
        }
        if (isset($unlocked[(string)$r['id']])) {
            continue; // paid for — full contact details
        }
        $r = jcj_redact_row($r);
    }
    return $rows;
}

function h_employees_list(): void
{
    $viewer = jcj_session_user();
    if (!$viewer) {
        jcj_fail('Authentication required to browse candidates.', 401, 'not_authenticated');
    }
    $raw = jcj_db()->query('SELECT * FROM jc_employees ORDER BY created_at DESC')->fetchAll();
    jcj_ok(['employees' => jcj_present_employees($raw, $viewer)]);
}

function h_employees_get(): void
{
    $viewer = jcj_require_user();
    $id = (string)($_GET['id'] ?? '');
    if ($id === '') {
        jcj_ok(['employee' => null]);
        return;
    }
    $stmt = jcj_db()->prepare('SELECT * FROM jc_employees WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) {
        jcj_ok(['employee' => null]);
        return;
    }
    $presented = jcj_present_employees([$row], $viewer);
    jcj_ok(['employee' => $presented[0]]);
}

function h_employees_by_user(): void
{
    $u = jcj_require_user();
    $userId = (string)($_GET['userId'] ?? '');
    if ($userId === '' || $userId !== (string)$u['id']) {
        jcj_ok(['employee' => null]);
        return;
    }
    $stmt = jcj_db()->prepare('SELECT * FROM jc_employees WHERE user_id = ? LIMIT 1');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    jcj_ok(['employee' => $row ? jcj_decode_rows([$row], 'jc_employees')[0] : null]);
}

function h_employees_save(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $profile = isset($b['profile']) && is_array($b['profile']) ? $b['profile'] : $b;
    if (!is_array($profile)) {
        jcj_fail('Missing employee profile.', 422, 'bad_profile');
    }

    $db = jcj_db();
    $stmt = $db->prepare('SELECT * FROM jc_employees WHERE user_id = ? LIMIT 1');
    $stmt->execute([$u['id']]);
    $existing = $stmt->fetch();

    // Normalize values.
    $data = [];
    foreach (JCJ_EMPLOYEE_COLUMNS as $col) {
        if (!array_key_exists($col, $profile)) {
            continue;
        }
        $v = $profile[$col];
        if (in_array($col, ['skills', 'extra'], true)) {
            $v = json_encode(is_array($v) ? $v : []);
        } elseif (in_array($col, ['age', 'salary_min', 'experience_years'], true)) {
            $v = ($v === '' || $v === null) ? null : (float)$v;
        } elseif ($col === 'id_verified') {
            $v = $v ? 1 : 0;
        } elseif (is_string($v)) {
            $v = trim($v);
            if ($v === '') {
                $v = null;
            }
        } elseif ($v === null) {
            $v = null;
        }
        $data[$col] = $v;
    }

    if ($existing) {
        if (!empty($data['id'])) {
            unset($data['id']); // id is immutable
        }
        $fields = [];
        $params = [];
        foreach ($data as $col => $v) {
            $fields[] = "`$col` = ?";
            $params[] = $v;
        }
        if ($fields) {
            $params[] = $existing['id'];
            $db->prepare('UPDATE jc_employees SET ' . implode(', ', $fields) . ', updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute($params);
        }
        $rowId = $existing['id'];
    } else {
        $rowId = !empty($data['id']) ? substr((string)$data['id'], 0, 64) : ('emp' . round(microtime(true) * 1000));
        unset($data['id']);
        $cols = array_keys($data);
        if ($cols) {
            $sql = 'INSERT INTO jc_employees (id, user_id, `' . implode('`, `', $cols) . '`) VALUES (?, ?, ' . implode(', ', array_fill(0, count($cols), '?')) . ')';
            $params = [$rowId, $u['id']];
            foreach ($data as $v) {
                $params[] = $v;
            }
            $db->prepare($sql)->execute($params);
        } else {
            $db->prepare('INSERT INTO jc_employees (id, user_id) VALUES (?, ?)')->execute([$rowId, $u['id']]);
        }
    }

    $sel = $db->prepare('SELECT * FROM jc_employees WHERE id = ? LIMIT 1');
    $sel->execute([$rowId]);
    $row = jcj_decode_rows($sel->fetchAll(), 'jc_employees')[0];
    jcj_ok(['employee' => $row]);
}