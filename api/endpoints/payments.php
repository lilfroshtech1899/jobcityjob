<?php
/**
 * Payment (jc_payments) endpoints + the Paystack verification flow
 * that also delivers candidate credentials.
 *
 * Security rules:
 *   - Every action is scoped to the authenticated employer's own rows.
 *   - `payments.verify` is the ONLY thing that flips a payment to
 *     "confirmed" and writes jc_unlocks. It verifies the reference
 *     against Paystack using the server-side secret key first.
 *   - There is deliberately NO browser endpoint for "confirmPayment" or
 *     "writeUnlock" — a client can never mark an order paid by itself.
 */

const JCJ_PAYMENT_INPUT = [
    'employer_email', 'candidate_ids', 'method', 'status', 'ref',
    'currency', 'amount_ngn', 'amount_usd', 'amount_kobo', 'amount_label',
];

function jcj_fetch_payment(string $id): ?array
{
    $stmt = jcj_db()->prepare('SELECT * FROM jc_payments WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $raw = $stmt->fetch();
    return $raw ? jcj_decode_rows([$raw], 'jc_payments')[0] : null;
}

function h_payments_create(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $p = isset($b['payment']) && is_array($b['payment']) ? $b['payment'] : $b;
    if (!is_array($p)) {
        jcj_fail('Missing payment payload.', 422, 'bad_payment');
    }

    $id = substr(trim((string)($p['id'] ?? '')), 0, 64);
    if ($id === '') {
        $id = 'pay' . round(microtime(true) * 1000);
    }
    $db = jcj_db();

    $existing = jcj_fetch_payment($id);
    if ($existing) {
        if ((string)$existing['employer_id'] !== (string)$u['id']) {
            jcj_fail('Payment not found.', 404, 'payment_not_found');
        }
        if (in_array($existing['status'], ['confirmed', 'refunded'], true)) {
            jcj_ok(['payment' => $existing]); // never downgrade a settled order
            return;
        }
    }

    $data = [];
    foreach (JCJ_PAYMENT_INPUT as $col) {
        if (!array_key_exists($col, $p)) {
            continue;
        }
        $v = $p[$col];
        if ($col === 'candidate_ids') {
            $v = is_array($v) ? array_values(array_map('strval', $v)) : [];
        }
        $data[$col] = $v;
    }
    if (empty($data['status'])) {
        $data['status'] = 'pending';
    }

    if ($existing) {
        $fields = [];
        $params = [];
        foreach ($data as $col => $v) {
            // status is re-sent as "pending" by the client on retries; never
            // regress a payment that has progressed past pending.
            if ($col === 'status') {
                continue;
            }
            $fields[] = "`$col` = ?";
            $params[] = is_array($v) ? json_encode($v) : $v;
        }
        if ($fields) {
            $params[] = $existing['id'];
            $db->prepare('UPDATE jc_payments SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        }
        jcj_ok(['payment' => jcj_fetch_payment($existing['id'])]);
        return;
    }

    $cols = ['id', 'employer_id'];
    $placeholders = ['?', '?'];
    $params = [$id, $u['id']];
    foreach ($data as $col => $v) {
        $cols[] = $col;
        $placeholders[] = '?';
        $params[] = is_array($v) ? json_encode($v) : $v;
    }
    $db->prepare('INSERT INTO jc_payments (`' . implode('`, `', $cols) . '`) VALUES (' . implode(', ', $placeholders) . ')')->execute($params);
    jcj_ok(['payment' => jcj_fetch_payment($id)]);
}

function h_payments_list(): void
{
    $u = jcj_require_user();
    $stmt = jcj_db()->prepare('SELECT * FROM jc_payments WHERE employer_id = ? ORDER BY created_at DESC');
    $stmt->execute([$u['id']]);
    jcj_ok(['payments' => jcj_decode_rows($stmt->fetchAll(), 'jc_payments')]);
}

function h_payments_pending(): void
{
    $u = jcj_require_user();
    $stmt = jcj_db()->prepare(
        "SELECT * FROM jc_payments WHERE employer_id = ? AND status = 'pending_confirmation' ORDER BY created_at DESC"
    );
    $stmt->execute([$u['id']]);
    jcj_ok(['payments' => jcj_decode_rows($stmt->fetchAll(), 'jc_payments')]);
}

function h_payments_get(): void
{
    $u = jcj_require_user();
    $id = (string)($_GET['id'] ?? '');
    $row = $id !== '' ? jcj_fetch_payment($id) : null;
    if (!$row || (string)$row['employer_id'] !== (string)$u['id']) {
        jcj_ok(['payment' => null]);
        return;
    }
    jcj_ok(['payment' => $row]);
}

/**
 * payments.verify — the ONLY path that confirms an order.
 * Mirrors the former Supabase Edge Function flow, fully server-side.
 */
function h_payments_verify(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $reference = trim((string)($b['reference'] ?? ''));
    $orderId = trim((string)($b['orderId'] ?? ($b['paymentId'] ?? '')));

    if ($reference === '') {
        jcj_fail('Missing transaction reference.', 400, 'missing_reference');
    }
    if ($orderId === '') {
        jcj_fail('Missing order ID.', 400, 'missing_order_id');
    }

    $order = jcj_fetch_payment($orderId);
    if (!$order) {
        jcj_fail('Order not found.', 404, 'order_not_found');
    }
    if ((string)$order['employer_id'] !== (string)$u['id']) {
        jcj_fail('Order not found for this account.', 404, 'order_not_found');
    }

    // 1) Verify with Paystack (secret stays on the server).
    try {
        $ps = jcj_paystack_verify($reference);
    } catch (RuntimeException $ex) {
        jcj_out(['ok' => false, 'verified' => false, 'code' => 'server_error', 'message' => $ex->getMessage()], 500);
    }

    $psBody = $ps['body'];
    if ($ps['http'] < 200 || $ps['http'] >= 300 || empty($psBody['status'])) {
        jcj_out([
            'ok' => false, 'verified' => false, 'code' => 'invalid_transaction',
            'message' => (string)($psBody['message'] ?? 'Paystack could not find this transaction.'),
        ], 200);
    }

    $tx = is_array($psBody['data'] ?? null) ? $psBody['data'] : [];
    $txStatus = strtolower((string)($tx['status'] ?? ''));
    if ($txStatus !== 'success') {
        jcj_out([
            'ok' => false, 'verified' => false, 'code' => 'payment_failed',
            'message' => 'Payment is not successful (status: ' . ($tx['status'] ?? 'unknown') . ').',
        ], 200);
    }

    $amountPaidMinor = (int)($tx['amount'] ?? 0);
    $currency = (string)($tx['currency'] ?? 'NGN');
    $paymentDate = !empty($tx['paid_at'])
        ? date('Y-m-d H:i:s', strtotime((string)$tx['paid_at']))
        : gmdate('Y-m-d H:i:s');

    // 2) Amount guard.
    $expectedMinor = (int)($order['amount_kobo'] ?? 0);
    if ($expectedMinor <= 0) {
        $expectedMinor = (int)round((float)($order['amount_ngn'] ?? 0) * 100);
    }
    if ($expectedMinor > 0 && $expectedMinor !== $amountPaidMinor) {
        jcj_out([
            'ok' => false, 'verified' => false, 'code' => 'amount_mismatch',
            'message' => 'Amount mismatch: expected ' . $expectedMinor . ' minor units, Paystack charged ' . $amountPaidMinor . '.',
            'expectedAmountMinor' => $expectedMinor,
            'paidAmountMinor' => $amountPaidMinor,
        ], 200);
    }

    // 3) Atomic idempotent claim + credential delivery in one transaction.
    $db = jcj_db();
    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            "UPDATE jc_payments
             SET status = 'confirmed', ref = ?, confirmed_at = ?, amount_kobo = ?, amount_ngn = ?, currency = ?
             WHERE id = ? AND status IN ('pending', 'pending_confirmation', 'pending_payment')"
        );
        $stmt->execute([$reference, $paymentDate, $amountPaidMinor, round($amountPaidMinor / 100), $currency, $orderId]);
        if ($stmt->rowCount() === 0) {
            $db->rollBack();
            jcj_out([
                'ok' => false, 'verified' => false, 'alreadyPaid' => true,
                'message' => 'This transaction has already been processed — contacts are in your Message Centre.',
            ], 200);
        }
        jcj_unlock_contacts($db, $order);
        $db->commit();
    } catch (Throwable $ex) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[jobcityjob] verify failed: ' . $ex->getMessage());
        jcj_out(['ok' => false, 'verified' => false, 'code' => 'server_error', 'message' => 'Verification failed on the server. Please try again or contact support.'], 500);
    }

    $label = ($currency === 'NGN' ? '₦' : $currency . ' ') . number_format($amountPaidMinor / 100, 2);
    jcj_out([
        'ok' => true, 'code' => 'success', 'verified' => true,
        'orderId' => $orderId,
        'reference' => (string)($tx['reference'] ?? $reference),
        'amountPaidMinor' => $amountPaidMinor,
        'amountPaid' => $amountPaidMinor / 100,
        'amountPaidLabel' => $label,
        'currency' => $currency,
        'paymentDate' => $paymentDate,
        'status' => 'confirmed',
    ]);
}

/**
 * Deliver purchased candidate credentials into the employer's
 * jc_users.messages + jc_users.pipeline and record each grant in
 * jc_unlocks. Runs only after verification has confirmed the order.
 */
function jcj_unlock_contacts(PDO $db, array $order): void
{
    $employerId = $order['employer_id'] ?? null;
    $candidateIds = $order['candidate_ids'] ?? [];
    if (!$employerId || !is_array($candidateIds) || !$candidateIds) {
        return;
    }

    $stmtE = $db->prepare('SELECT * FROM jc_users WHERE id = ? LIMIT 1');
    $stmtE->execute([$employerId]);
    $empRaw = $stmtE->fetch();
    if (!$empRaw) {
        return;
    }
    $empRow = jcj_decode_rows([$empRaw], 'jc_users')[0];
    $messages = is_array($empRow['messages'] ?? null) ? $empRow['messages'] : [];
    $pipeline = is_array($empRow['pipeline'] ?? null) ? $empRow['pipeline'] : [];

    $employees = jcj_decode_rows($db->query('SELECT * FROM jc_employees')->fetchAll(), 'jc_employees');
    $changed = false;
    $now = gmdate('Y-m-d H:i:s');
    $nowIso = gmdate('c');

    $insU = $db->prepare(
        'INSERT IGNORE INTO jc_unlocks
         (id, payment_id, employer_id, candidate_id, method, source, amount_ngn, amount_usd,
          candidate_name, phone, whatsapp, email, job_title, city, country, education,
          experience_years, skills, resume_text, unlocked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    foreach ($candidateIds as $cidRaw) {
        $cid = (string)$cidRaw;
        $emp = null;
        foreach ($employees as $e) {
            if ((string)$e['id'] === $cid) {
                $emp = $e;
                break;
            }
        }
        if (!$emp) {
            continue;
        }
        $changed = true;

        $wa = $emp['whatsapp'] ?: ($emp['phone'] ?: '');
        $contact = [
            'candidateId'   => $cid,
            'candidateName' => $emp['full_name'],
            'phone'         => $emp['phone'],
            'whatsapp'      => $wa,
            'email'         => $emp['email'],
            'jobTitle'      => $emp['job_title'],
            'city'          => $emp['city'],
            'country'       => $emp['country_name'] ?: $emp['country'],
            'education'     => $emp['education'],
            'experienceYears' => $emp['experience_years'],
            'skills'        => $emp['skills'],
            'industry'      => $emp['industry'] ?: ($emp['job_category'] ?: $emp['job_title']),
            'resumeText'    => $emp['resume_text'] ?: ($emp['summary'] ?: ''),
            'matchScore'    => null,
            'at'            => $nowIso,
        ];

        $hasMsg = false;
        foreach ($messages as $m) {
            if (isset($m['candidateId']) && (string)$m['candidateId'] === $cid) {
                $hasMsg = true;
                break;
            }
        }
        if (!$hasMsg) {
            array_unshift($messages, $contact);
        }

        $hasPipe = false;
        foreach ($pipeline as $p) {
            if (isset($p['candidateId']) && (string)$p['candidateId'] === $cid) {
                $hasPipe = true;
                break;
            }
        }
        if (!$hasPipe) {
            array_unshift($pipeline, array_merge($contact, [
                'stage' => 'new',
                'notes' => '',
                'history' => [['stage' => 'new', 'at' => $nowIso]],
            ]));
        }

        $unlockId = 'unl_' . ($order['id'] ?? 'pay') . '_' . $cid;
        $insU->execute([
            $unlockId,
            $order['id'] ?? null,
            (string)$employerId,
            $cid,
            $order['method'] ?? 'paystack',
            'edge',
            isset($order['amount_ngn']) ? (float)$order['amount_ngn'] : null,
            isset($order['amount_usd']) ? (float)$order['amount_usd'] : null,
            $emp['full_name'],
            $emp['phone'],
            $wa,
            $emp['email'],
            $emp['job_title'],
            $emp['city'],
            $emp['country_name'] ?: $emp['country'],
            $emp['education'],
            $emp['experience_years'] !== null ? (float)$emp['experience_years'] : null,
            is_array($emp['skills']) ? json_encode($emp['skills']) : null,
            $emp['resume_text'] ?: ($emp['summary'] ?: null),
            $now,
        ]);
    }

    if ($changed) {
        $upd = $db->prepare('UPDATE jc_users SET messages = ?, pipeline = ? WHERE id = ?');
        $upd->execute([json_encode($messages), json_encode($pipeline), $employerId]);
    }
}