<?php
/**
 * Jobcityjob API — secure image upload helpers.
 *
 * Design rules (all enforced here, never in the browser):
 *   * The browser's filename/extensions are NEVER trusted. The stored name is
 *     generated server-side (random hex) and the extension comes exclusively
 *     from the magic bytes detected by PHP's finfo — not from the client.
 *   * Only a strict image allowlist (jpeg/png/gif/webp) is accepted.
 *   * Executable-bearing types (.php/.phtml/.phar/.htaccess/...) are rejected
 *     by definition (they can never be a detected image MIME) and the upload
 *     directory carries an .htaccess that disables PHP execution + direct
 *     Apache access. Files are also served only through the authenticated
 *     avatar.get endpoint (path-traversal-safe).
 *   * Size is capped, so a malicious caller can't exhaust disk space.
 *   * Uploads are always owner-scoped: an endpoint must pass the owning user
 *     id (admin may target another user's profile — see callers).
 */

const JCJ_UPLOAD_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const JCJ_AVATAR_MIME_MAP = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
];

/** Absolute path of the uploads root (api/uploads/). Created on demand. */
function jcj_upload_dir(): string
{
    $dir = __DIR__ . '/../uploads';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    // Belt & braces: if Apache, disable engine + deny direct HTTP access.
    // The avatar.get endpoint remains the only way these are served.
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        $content = "# Jobcityjob uploads — never served directly; only via the PHP API.\n"
            . "<IfModule mod_php.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php7.c>\n  php_flag engine off\n</IfModule>\n"
            . "<IfModule mod_php8.c>\n  php_flag engine off\n</IfModule>\n"
            . "RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .phps\n"
            . "RemoveType .php .phtml .php3 .php4 .php5 .php7 .phps\n"
            . "Require all denied\n"
            . "Order deny,allow\n"
            . "Deny from all\n";
        @file_put_contents($ht, $content);
    }
    return $dir;
}

/**
 * Validate + store an uploaded avatar.
 *
 * @param array  $file   an entry of $_FILES (must contain error/size/tmp_name)
 * @param string $userId the owning user id (used only for the on-disk folder)
 * @return string        relative path under jc_uploads, e.g. "avatars/ab12.jpg"
 * @throws RuntimeException on any invalid/malicious upload (message is shown to user)
 */
function jcj_save_avatar_upload(array $file, string $userId): string
{
    // 1. Transport error?
    $err = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
    if ($err === UPLOAD_ERR_NO_FILE) {
        jcj_fail('No file received.', 422, 'no_file');
    }
    if ($err !== UPLOAD_ERR_OK) {
        jcj_fail('Upload failed with error code ' . $err . '.', 422, 'upload_error');
    }
    $tmp = (string)($file['tmp_name'] ?? '');
    if ($tmp === '' || !is_uploaded_file($tmp)) {
        jcj_fail('Upload rejected (not a real upload).', 422, 'bad_upload');
    }

    // 2. Size cap.
    $size = (int)($file['size'] ?? 0);
    if ($size < 1 || $size > JCJ_UPLOAD_MAX_BYTES) {
        jcj_fail('Image must be smaller than 5 MB.', 422, 'too_large');
    }

    // 3. Detect the real type from content (magic bytes), never the extension.
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = (string)$finfo->file($tmp);
    if (!isset(JCJ_AVATAR_MIME_MAP[$mime])) {
        jcj_fail('Only JPG, PNG, GIF or WebP images are allowed.', 422, 'bad_type');
    }
    $ext = JCJ_AVATAR_MIME_MAP[$mime];

    // 4. Refuse any file that is actually executable / embedded PHP by also
    //    checking magic of the first bytes is an image signature. finfo above
    //    already classified it, but double-verify via GD so crafted double
    //    extensions and malformed headers can't masquerade.
    if (function_exists('getimagesize')) {
        $info = @getimagesize($tmp);
        $gdTypes = [
            IMAGETYPE_JPEG => 'image/jpeg',
            IMAGETYPE_PNG  => 'image/png',
            IMAGETYPE_GIF  => 'image/gif',
            IMAGETYPE_WEBP => 'image/webp',
        ];
        if (!$info || !isset($gdTypes[$info[2]]) || $gdTypes[$info[2]] !== $mime) {
            jcj_fail('Image content could not be verified.', 422, 'bad_type');
        }
    }

    // 5. Store under a per-user folder with a server-generated name. The
    //    extension is derived from magic bytes above — path traversal is
    //    impossible because the segment we write is entirely generated here.
    $userDir = jcj_upload_dir() . '/avatars/' . substr($userId, 0, 36);
    if (!is_dir($userDir)) {
        @mkdir($userDir, 0755, true);
    }
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    $dest = $userDir . '/' . $name;
    if (!move_uploaded_file($tmp, $dest)) {
        jcj_fail('Could not save the image on the server.', 500, 'save_failed');
    }
    @chmod($dest, 0644);

    return 'avatars/' . substr($userId, 0, 36) . '/' . $name;
}

/**
 * Safely resolve a stored relative upload path for on-disk serving.
 * @return string|null absolute path inside the uploads root, or null if unsafe.
 */
function jcj_resolve_upload(string $relative): ?string
{
    $relative = ltrim($relative, "/\\");
    if ($relative === '' || str_contains($relative, '..')) {
        return null;
    }
    $root = realpath(jcj_upload_dir());
    if ($root === false) {
        return null;
    }
    $abs = realpath($root . '/' . $relative);
    if ($abs === false || !str_starts_with($abs, $root . DIRECTORY_SEPARATOR)) {
        return null;
    }
    return $abs;
}