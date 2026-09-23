<?php
/**
 * Auth endpoints: signup, signin, signout, session, profile, admin login.
 */

function h_auth_signup(): void
{
    $b = jcj_json_input();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');
    $type = trim((string)($b['type'] ?? 'employee'));
    $name = trim((string)($b['name'] ?? ''));
    $country = trim((string)($b['country'] ?? ''));

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jcj_fail('Please enter a valid email address.', 422, 'invalid_email');
    }
    if (strlen($password) < 6) {
        jcj_fail('Password must be at least 6 characters.', 422, 'weak_password');
    }
    if (!in_array($type, ['employee', 'employer'], true)) {
        $type = 'employee';
    }

    $db = jcj_db();
    $stmt = $db->prepare('SELECT id FROM jc_users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jcj_fail('User already registered', 409, 'email_taken');
    }

    $id = jcj_random_id(16);
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $db->prepare(
        'INSERT INTO jc_users (id, email, password_hash, type, name, country, profile_complete, messages, pipeline)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
    );
    $stmt->execute([$id, $email, $hash, $type, $name !== '' ? $name : null, $country !== '' ? $country : null, '[]', '[]']);

    jcj_start_session();
    session_regenerate_id(true);
    $_SESSION['jcj_user_id'] = $id;

    $user = jcj_user_shape(['id' => $id, 'email' => $email, 'type' => $type, 'name' => $name, 'country' => $country]);
    jcj_ok(['user' => $user, 'session' => ['user' => $user]]);
}

function h_auth_signin(): void
{
    $b = jcj_json_input();
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $password = (string)($b['password'] ?? '');

    $stmt = jcj_db()->prepare('SELECT * FROM jc_users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        jcj_fail('Invalid email or password', 401, 'bad_credentials');
    }

    jcj_start_session();
    session_regenerate_id(true);
    $_SESSION['jcj_user_id'] = $row['id'];

    $user = jcj_user_shape(jcj_decode_rows([$row], 'jc_users')[0]);
    jcj_ok(['user' => $user, 'session' => ['user' => $user]]);
}

function h_auth_signout(): void
{
    jcj_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    jcj_ok();
}

function h_auth_session(): void
{
    jcj_ok([
        'session'    => jcj_session_shape(jcj_session_user()),
        'csrf_token' => jcj_csrf_token(),
    ]);
}

function h_auth_profile(): void
{
    jcj_ok([
        'profile'    => jcj_session_user(),
        'csrf_token' => jcj_csrf_token(),
    ]);
}

function h_auth_admin_login(): void
{
    $b = jcj_json_input();
    $pass = (string)($b['password'] ?? '');
    $admin = jcj_config()['admin'] ?? [];
    $hash = (string)($admin['password_hash'] ?? '');
    $plain = (string)($admin['password'] ?? '');

    $ok = false;
    if ($hash !== '') {
        $ok = password_verify($pass, $hash);
    } elseif ($plain !== '') {
        $ok = hash_equals($plain, $pass);
    }
    if (!$ok) {
        jcj_fail('Wrong password.', 401, 'bad_admin_password');
    }

    jcj_start_session();
    session_regenerate_id(true);
    $_SESSION['jcj_admin'] = true;
    jcj_ok(['admin' => true]);
}

function h_auth_admin_logout(): void
{
    jcj_start_session();
    unset($_SESSION['jcj_admin']);
    jcj_ok();
}