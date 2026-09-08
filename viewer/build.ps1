# Builds dist\Yeoman.exe. Run from this folder:  powershell -ExecutionPolicy Bypass -File build.ps1
# Needs: pip install pyinstaller UnityPy   and a fresh mod build in ..\stfc-mod\build\windows\x64\release
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$dll = Join-Path $here "..\stfc-mod\build\windows\x64\release\stfc-community-mod.dll"
if (-not (Test-Path $dll)) { throw "mod DLL not found: $dll  (build the mod first: xmake -y in ..\stfc-mod)" }

$stage = Join-Path $here "build\stage"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $stage "web") | Out-Null
New-Item -ItemType Directory -Force (Join-Path $stage "mod") | Out-Null
Copy-Item (Join-Path $here "index.html"), (Join-Path $here "about.html"), (Join-Path $here "yeoman.css"), (Join-Path $here "*.js") (Join-Path $stage "web") -Exclude "test_*.js"
Copy-Item $dll (Join-Path $stage "mod\version.dll")

Push-Location $here
try {
  python -m PyInstaller --noconfirm --onefile --name Yeoman --console `
    --distpath (Join-Path $here "dist") --workpath (Join-Path $here "build\pyi") --specpath (Join-Path $here "build") `
    --add-data "$stage\web;web" --add-data "$stage\mod;mod" `
    --collect-all UnityPy --collect-all fmod_toolkit `
    app.py
} finally { Pop-Location }
Write-Host "built: $(Join-Path $here 'dist\Yeoman.exe')"
