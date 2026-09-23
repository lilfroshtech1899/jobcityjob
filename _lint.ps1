$ErrorActionPreference = "Continue"
$root = "C:\Users\lilfrosh tech\Documents\Jobcity"
$php = "C:\xampp\php\php.exe"
$files = @(
  "$root\api\lib\helpers.php",
  "$root\api\index.php"
)
$fail = 0
foreach ($f in $files) {
  & $php -l $f 2>&1 | ForEach-Object { Write-Host $_ }
  if ($LASTEXITCODE -ne 0) { $fail = 1 }
}
if ($fail -eq 0) { Write-Host "LINT_OK" } else { Write-Host "LINT_FAIL" }
exit $fail
