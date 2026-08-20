# Runs the isolated functional test for @dsh-user/narrative-voice.
# The plugin is deliberately dependency-free (no bare imports), so the test
# runs directly with node — no junction, no install, nothing to clean up.
$ErrorActionPreference = "Stop"
node (Join-Path $PSScriptRoot "functional.mjs")
exit $LASTEXITCODE
