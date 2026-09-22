@echo off
setlocal
chcp 65001 >nul
echo PlateGo 安装引导：将校验并复制插件文件，然后由你在 Chrome 内确认。
echo 仅本次 PowerShell 进程使用 RemoteSigned；组织策略仍然优先，不修改全局执行策略。
powershell.exe -NoLogo -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Install-Windows.ps1"
if errorlevel 1 (
  echo.
  echo 安装未完成。若脚本被系统或组织策略拦截，请查看安装说明，不要关闭安全策略。
  echo 将为你选中本包的 Install-Windows.ps1；可右键查看属性中的文件授权提示。
  explorer.exe /select,"%~dp0Install-Windows.ps1"
  start "" "%~dp0INSTALL.html"
  pause
  exit /b 1
)
pause
