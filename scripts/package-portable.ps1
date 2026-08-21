# Packages a portable, no-installer build of LibRE FTA: the raw release
# .exe plus its resources folder (which includes the bundled SCRAM CLI -
# see src-tauri/resources/scram/), zipped up so it can be extracted and run
# from anywhere (including a USB stick) with no install step and no admin
# rights. Run "npm run tauri build -- --no-bundle" first.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $root "src-tauri\target\release"
$exeSrc = Join-Path $releaseDir "app.exe"

if (-not (Test-Path $exeSrc)) {
  throw "No release build found at $exeSrc - run 'npm run tauri build -- --no-bundle' first."
}

$outDir = Join-Path $root "dist-portable"
$pkgName = "LibRE FTA (portable)"
$pkgDir = Join-Path $outDir $pkgName

Remove-Item -Recurse -Force $pkgDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null

Copy-Item $exeSrc (Join-Path $pkgDir "LibRE FTA.exe")

# WebView2Loader.dll must sit next to the exe - without it the app process
# starts but its WebView2 window silently never initializes (confirmed live:
# the process runs, but no window/child process ever appears).
$loaderSrc = Join-Path $releaseDir "WebView2Loader.dll"
if (Test-Path $loaderSrc) {
  Copy-Item $loaderSrc (Join-Path $pkgDir "WebView2Loader.dll")
} else {
  Write-Warning "WebView2Loader.dll not found next to app.exe - the portable build will not run."
}

$resSrc = Join-Path $releaseDir "resources"
if (Test-Path $resSrc) {
  Copy-Item $resSrc (Join-Path $pkgDir "resources") -Recurse
} else {
  Write-Warning "No resources folder found next to app.exe - the bundled SCRAM CLI won't be included."
}

$zipPath = Join-Path $outDir "LibRE-FTA-portable-win64.zip"
Remove-Item $zipPath -ErrorAction SilentlyContinue
Compress-Archive -Path $pkgDir -DestinationPath $zipPath

$sizeMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "Portable build ready: $zipPath ($sizeMb MB)"
Write-Host "Unzipped folder for testing without re-zipping: $pkgDir"
