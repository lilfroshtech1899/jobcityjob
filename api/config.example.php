<?php
/**
 * Jobcityjob API — configuration TEMPLATE
 * --------------------------------------
 * Copy this file to api/config.php (it is git-ignored) and fill in
 * the values. The browser NEVER sees this file.
 *
 * Hard rules for this file:
 *   - MySQL host/user/password live ONLY here (server side).
 *   - PAYSTACK_SECRET_KEY lives ONLY here (server side).
 *   - The Paystack PUBLIC key may be embedded in js/config/runtime-config.js
 *     because it is public by design.
 */
return [
    'db' => [
        'host'    => '127.0.0.1',   // DomainKing MySQL host (often "localhost")
        'name'    => 'jobcityjob',
        'user'    => 'root',        // DomainKing: the database user
        'pass'    => '',            // DomainKing: the database password
        'charset' => 'utf8mb4',
    ],

    'app' => [
        // Optional canonical URL, e.g. "https://jobcityjob.app" (informational).
        'base_url' => '',
        // Extra origins allowed to call the API with credentials (CORS).
        // Same-origin requests always work. Add dev origins here, e.g.
        // ['http://localhost:5500', 'http://127.0.0.1:5500'].
        'allowed_origins' => ['http://127.0.0.1:8080', 'http://localhost:8080'],
        'session_name'    => 'jcj_sess',
        'debug'           => false,
    ],

    'paystack' => [
        'public_key' => 'pk_live_REPLACE',   // public — used inline in the browser
        'secret_key' => '',                  // SERVER ONLY — never exposed to the browser
    ],

    'admin' => [
        // /desk password. Provide a password_hash() value (preferred). If empty,
        // the plaintext 'password' below is compared instead. Change it!
        'password_hash' => '',
        'password'      => 'CHANGE_ME',
    ],
];