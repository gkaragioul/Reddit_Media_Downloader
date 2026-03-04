@echo off
setlocal
cd /d "%~dp0"

py -m pip install --upgrade pyinstaller requests customtkinter pillow
py -m PyInstaller --noconfirm --onefile --windowed --name RedditDownloaderWin windows_reddit_downloader.py

set DESKTOP=%USERPROFILE%\Desktop
if not exist "%DESKTOP%" mkdir "%DESKTOP%"
copy /Y "dist\RedditDownloaderWin.exe" "%DESKTOP%\RedditDownloaderWin_Portable.exe"

echo.
echo Portable app created:
echo %DESKTOP%\RedditDownloaderWin_Portable.exe
endlocal
