@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 >nul 2>&1
cd /d E:\dev\SableD\platforms\tauri
set PATH=%USERPROFILE%\.cargo\bin;%PATH%

echo [1/3] Building Tauri app (frontend + Rust, no bundling)...
call pnpm tauri build --no-bundle
if %errorlevel% neq 0 (
    echo Build failed.
    exit /b %errorlevel%
)

echo.
echo [2/3] Saving portable exe...
if not exist "src-tauri\target\release\bundle" mkdir "src-tauri\target\release\bundle"
copy /Y "src-tauri\target\release\sable-desktop.exe" "src-tauri\target\release\bundle\Sable_portable.exe" >nul

echo.
echo [3/3] Building installers (MSI + NSIS)...
call pnpm tauri build --bundles msi,nsis
if %errorlevel% neq 0 (
    echo Installer build failed.
    exit /b %errorlevel%
)

echo.
echo === Build complete ===
echo   MSI:      src-tauri\target\release\bundle\msi\Sable_1.9.3_x64_en-US.msi
echo   NSIS:     src-tauri\target\release\bundle\nsis\Sable_1.9.3_x64-setup.exe
echo   Portable: src-tauri\target\release\bundle\Sable_portable.exe
