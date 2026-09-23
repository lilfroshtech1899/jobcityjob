<?php
/**
 * Upload endpoints: avatar.save (multipart) + avatar.get (authenticated reader).
 *
 * Security:
 *   * avatar.save — owner-scoped: only the session user's own profile (idme
 *     admin may target another user via `user_id`). Files validated in
 *     api/lib/upload.php (magic-byte MIME, size cap, server-side name).
 *   * avatar.get  — requires an authenticated session; only streams files that
 *     live inside the uploads root (path-traversal-safe) and never executes
 *     them (binary passthrough with image Content-Type + nosniff).
 *   * Paths stored in the DB are relative ("avatars/<user>/<rand>.ext"), so no
 *     absolute server paths or execuable flags ever leak to the browser.
 */

function h_avatar_save(): void
{
    $u = jcj_require_user();
    $b = jcj_json_input();
    $targetUserId = trim((string)($b['user_id'] ?? ''));
    if ($targetUserId !== '' && $targetUserId !== (string)$u['id'] && !jcj_is_admin()) {
        jcj_fail('You can only change your own profile image.', 403, 'not_owner');
    }
    $ownerId = $targetUserId !== '' ? $targetUserId : (string)$u['id'];

    $file = $_FILES['avatar'] ?? null;
    if (!is_array($file)) {
        $file = $_FILES['file'] ?? null;
    }
    if (!is_array($file)) {
        jcj_fail('Missing image upload (field "avatar" or "file").', 422, 'no_file');
    }

    $path = jcj_save_avatar_upload($file, $ownerId);
    $db = jcj_db();
    $stmt = $db->prepare('UPDATE jc_users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    $stmt->execute([$path, $ownerId]);

    $sel = $db->prepare('SELECT * FROM jc_users WHERE id = ? LIMIT 1');
    $sel->execute([$ownerId]);
    $user = jcj_decode_rows($sel->fetchAll(), 'jc_users')[0];
    jcj_ok(['avatar' => $path, 'user' => jcj_user_shape($user)]);
}

function h_avatar_get(): void
{
    $viewer = jcj_require_user();
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id !== '' && $id !== (string)$viewer['id'] && !jcj_is_admin()) {
        // Only the own profile or admin may fetch avatar bytes directly.
        $id = (string)$viewer['id'];
    }
    $stmt = jcj_db()->prepare('SELECT avatar FROM jc_users WHERE id = ? LIMIT 1');
    $stmt->execute([($id !== '' ? $id : $viewer['id'])]);
    $avatar = $stmt->fetchColumn();
    if (!$avatar) {
        jcj_fail('No profile image set.', 404, 'no_avatar');
    }
    $abs = jcj_resolve_upload((string)$avatar);
    if ($abs === null || !is_file($abs)) {
        jcj_fail('Profile image unavailable.', 404, 'avatar_missing');
    }
    $ext = strtolower(pathinfo($abs, PATHINFO_EXTENSION));
    $mime = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
    ][$ext] ?? 'application/octet-stream';

    // Stream as an image, never as PHP; no content that could be executed.
    header('Content-Type: ' . $mime);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, max-age=3600');
    header('Content-Length: ' . filesize($abs));
    readfile($abs);
    exit;
}