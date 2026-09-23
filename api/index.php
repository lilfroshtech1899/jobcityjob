<?php
/**
 * Jobcityjob — PHP REST-style API front controller.
 *
 * Every request hits api/index.php with an `r` action, e.g.
 *     POST /api/index.php?r=auth.signin   body: {"email":..., "password":...}
 *     GET  /api/index.php?r=employees.list
 *
 * Secrets (MySQL credentials, Paystack secret key) live only in
 * api/config.php — never in the browser, never in the frontend code.
 */

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/helpers.php';
require __DIR__ . '/lib/paystack.php';
require __DIR__ . '/endpoints/auth.php';
require __DIR__ . '/endpoints/users.php';
require __DIR__ . '/endpoints/employees.php';
require __DIR__ . '/endpoints/payments.php';
require __DIR__ . '/endpoints/content.php';

if (!function_exists('h_blog_list')) {
    // Keep PHP lint happy if any endpoint file failed to parse.
}

jcj_cors();
jcj_start_session();

// Last-resort handler: any uncaught Throwable after this point becomes a
// consistent JSON 500 envelope instead of PHP's HTML error page.
set_exception_handler('jcj_fatal');

// Incoming CSRF token, if the caller attached one (header or form field).
$GLOBALS['jcj_incoming_csrf'] =
    (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '') !== ''
        ? (string)$_SERVER['HTTP_X_CSRF_TOKEN']
        : (string)($_POST['csrf_token'] ?? '');

/**
 * Routes that may be called cross-origin-but-trusted (same-site assets) or are
 * read-only. Everything else — anything that mutates state or deals with money —
 * must carry a valid CSRF token (see jcj_require_csrf).
 */
$READ_ONLY_ROUTES = [
    'auth.session', 'auth.profile',
    'users.get', 'users.by_email',
    'employees.list', 'employees.get', 'employees.by_user',
    'payments.list', 'payments.pending', 'payments.get',
    'unlocks.list',
    'blog.list',
    'ratings.list',
    'email_events.list',
    'settings.get',
    'admin.stats',
];

$routes = [
    // Auth
    'auth.signup'        => 'h_auth_signup',
    'auth.signin'        => 'h_auth_signin',
    'auth.signout'       => 'h_auth_signout',
    'auth.session'       => 'h_auth_session',
    'auth.profile'       => 'h_auth_profile',
    'auth.admin_login'   => 'h_auth_admin_login',
    'auth.admin_logout'  => 'h_auth_admin_logout',
    // Users
    'users.ensure'       => 'h_users_ensure',
    'profile.update'     => 'h_profile_update',
    'users.get'          => 'h_users_get',
    'users.by_email'     => 'h_users_by_email',
    // Employees
    'employees.list'     => 'h_employees_list',
    'employees.get'      => 'h_employees_get',
    'employees.by_user'  => 'h_employees_by_user',
    'employees.save'     => 'h_employees_save',
    // Payments
    'payments.create'    => 'h_payments_create',
    'payments.list'      => 'h_payments_list',
    'payments.pending'   => 'h_payments_pending',
    'payments.get'       => 'h_payments_get',
    'payments.verify'    => 'h_payments_verify',
    'unlocks.list'       => 'h_unlocks_list',
    // Content
    'blog.list'          => 'h_blog_list',
    'blog.save'          => 'h_blog_save',
    'blog.like'          => 'h_blog_like',
    'ratings.list'       => 'h_ratings_list',
    'ratings.save'       => 'h_ratings_save',
    'email_events.record' => 'h_email_events_record',
    'email_events.list'  => 'h_email_events_list',
    'settings.get'       => 'h_settings_get',
    'settings.set'       => 'h_settings_set',
    // Admin
    'admin.stats'        => 'h_admin_stats',
];

$r = jcj_route();
if ($r === '' || !isset($routes[$r])) {
    jcj_fail('Unknown API action.', 404, 'not_found');
}

if (!in_array($r, $READ_ONLY_ROUTES, true)) {
    // Every state-changing endpoint must be CSRF-protected so a third-party
    // site can't forge requests against a logged-in Jobcityjob user.
    jcj_require_csrf();
}
jcj_rate_limit($r, 30, 60); // coarse per-route guard; tight buckets set inside endpoints

$routes[$r]();