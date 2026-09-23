<?php
/**
 * Jobcityjob — convenience wrapper so the installer can be reached from
 * either location:
 *
 *     php scripts/install.php --help     (same as: php api/install.php --help)
 *     php scripts/install.php --yes
 *
 * The real installer lives at api/install.php (next to api/config.php and
 * database/schema.sql). This file ONLY delegates — it contains no logic.
 */

require_once __DIR__ . '/../api/install.php';
