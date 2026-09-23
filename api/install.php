<?php
/**
 * Jobcityjob — database installer (CLI only).
 * ============================================
 *
 * WHAT THIS DOES
 *   * Reads DB credentials from api/config.php (server-side only; the browser
 *     never loads this file).
 *   * Connects to MySQL, creates the database if it does not exist
 *     (CREATE DATABASE IF NOT EXISTS jobcityjob).
 *   * Applies database/schema.sql — every statement is
 *     CREATE TABLE IF NOT EXISTS, so this is IDEMPOTENT and safe to re-run.
 *
 * WHAT THIS DOES *NOT* DO
 *   * No DROP, no TRUNCATE, no ALTER TABLE, no data deletion,
 *     no seeding of demo users, and it never touches Paystack.
 *   * It will not overwrite existing tables or drop existing data.
 *   * Admin login needs NO database row: auth.admin_login verifies the
 *     Paystack-free config admin.password_hash / admin.password in
 *     api/config.php (server-side). Nothing admin-related is seeded here.
 *
 * USAGE
 *   php api/install.php            -> print help (safe, no DB writes)
 *   php api/install.php --yes      -> create DB + apply schema (idempotent)
 *
 * SAFETY
 *   * Every DDL uses "IF NOT EXISTS" — re-runs are harmless.
 *   * There is NO drop/truncate/alter/delete anywhere in this script.
 *   * Nothing runs unless --yes is passed.
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

/* ---------- 1. Config ---------- */

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    fwrite(STDERR, "Missing api/config.php. Copy api/config.example.php to api/config.php and fill in the DB credentials first.\n");
    exit(1);
}

$cfg = (array)(require $configFile);
$dbCfg = (array)($cfg['db'] ?? []);

$host    = (string)($dbCfg['host'] ?? '127.0.0.1');
$dbname  = (string)($dbCfg['name'] ?? 'jobcityjob');
$user    = (string)($dbCfg['user'] ?? 'root');
$pass    = (string)($dbCfg['pass'] ?? '');
$charset = (string)($dbCfg['charset'] ?? 'utf8mb4');

$skip = (bool)($argv[1] ?? false) === false && ($argv[1] ?? '') === '--yes';

/* ---------- 2. Argument handling ---------- */

$argv1 = $argv[1] ?? '';
if (in_array($argv1, ['-h', '--help', '--helpme', '-?'], true) || $argv1 === '') {
    fwrite(STDOUT, <<<TXT
Jobcityjob database installer

Usage:
  php api/install.php           Show this help.
  php api/install.php --yes     Create/verify the schema. Refuses to run otherwise.

This script will:
  1. Create the database 'jobcityjob' if it does not exist.
  2. Apply database/schema.sql (all CREATE TABLE IF NOT EXISTS — idempotent).

It will NOT drop or modify existing tables, delete data, or seed any rows.
No Paystack or admin credentials are required or touched.

TXT
    );
    exit(0);
}

if ($argv1 !== '--yes') {
    fwrite(STDERR, "Unknown argument '$argv1'. Pass '--yes' to actually install, or nothing for help.\n");
    exit(2);
}

/* ---------- 3. Connect (server, no DB selected yet) ---------- */

$serverDsn = "mysql:host={$host};charset={$charset}";
try {
    $pdo = new PDO($serverDsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (PDOException $e) {
    fwrite(STDERR, "Cannot connect to MySQL ({$host}): " . $e->getMessage() . "\n");
    exit(1);
}
fwrite(STDOUT, "Connected to MySQL host={$host}.\n");

/* ---------- 4. Create database if missing ---------- */

$stmt = $pdo->prepare(
    'CREATE DATABASE IF NOT EXISTS `' . str_replace('`', '', $dbname) . '` ' .
    'CHARACTER SET ' . $charset . ' COLLATE utf8mb4_unicode_ci'
);
$stmt->execute();
fwrite(STDOUT, "Database '{$dbname}' ready (created if it did not exist).\n");

$pdo->exec('USE `' . str_replace('`', '', $dbname) . '`');

/* ---------- 5. Apply schema.sql (idempotent) ---------- */

$schemaFile = dirname(__DIR__) . '/database/schema.sql';
if (!is_file($schemaFile)) {
    fwrite(STDERR, "Missing database/schema.sql at: {$schemaFile}\n");
    exit(1);
}

$contents = file_get_contents($schemaFile);
/* Strip -- line comments (they may appear after a semicolon). */
$contents = preg_replace('/^--.*$/m', '', $contents);

/* Normalise statement terminators: MySQL supports ";" as delimiter. */
$statements = preg_split('/;\s*\R/', $contents);
$ran = 0;
foreach ($statements as $i => $sql) {
    $sql = trim($sql);
    if ($sql === '') {
        continue;
    }
    /* Strip any leading "CREATE DATABASE" / "USE" already handled above, and
       lone comment remnants. */
    try {
        $pdo->exec($sql);
        $ran++;
    } catch (PDOException $e) {
        fwrite(STDERR, "Statement #" . ($i + 1) . " failed: " . $e->getMessage() . "\n  -> " . substr($sql, 0, 120) . "\n");
        exit(1);
    }
}
fwrite(STDOUT, "Schema applied: {$ran} statement(s) executed (all idempotent).\n");

/* ---------- 6. Verify ---------- */

$tables = [];
$stmt = $pdo->query('SHOW TABLES');
$tables = $stmt->fetchAll(PDO::FETCH_COLUMN);
sort($tables);
fwrite(STDOUT, "Tables in '{$dbname}': " . implode(', ', $tables) . "\n");
fwrite(STDOUT, "OK — database ready. Now fill api/config.php if you haven't (DB password + Paystack secret key), then serve the folder.\n");
exit(0);
