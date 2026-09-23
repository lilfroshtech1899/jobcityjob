<?php
/**
 * Jobcityjob API — Paystack server-side verification.
 * The secret key is read from api/config.php and NEVER leaves the server.
 */

/**
 * @throws RuntimeException on transport failure or missing secret.
 */
function jcj_paystack_verify(string $reference): array
{
    $secret = (string)(jcj_config()['paystack']['secret_key'] ?? '');
    if ($secret === '') {
        throw new RuntimeException('PAYSTACK_SECRET_KEY not configured in api/config.php.');
    }
    $url = 'https://api.paystack.co/transaction/verify/' . rawurlencode($reference);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $secret, 'Content-Type: application/json'],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    if ($raw === false || $raw === null) {
        throw new RuntimeException('Paystack request failed: ' . $err);
    }
    $json = json_decode((string)$raw, true);
    return [
        'http' => $code,
        'body' => is_array($json) ? $json : [],
    ];
}