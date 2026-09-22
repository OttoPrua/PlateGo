$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-PlainPath([string]$Path) {
    $cursor = [IO.Path]::GetFullPath($Path)
    while ($cursor) {
        $item = Get-Item -LiteralPath $cursor -Force -ErrorAction SilentlyContinue
        if ($item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "路径含链接或重解析点：$cursor" }
        $parent = Split-Path -Path $cursor -Parent
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
}

function Assert-PlainTree([string]$Path) {
    Assert-PlainPath $Path
    foreach ($item in Get-ChildItem -LiteralPath $Path -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "目录含链接或重解析点：$($item.FullName)" }
        if ($item.PSIsContainer) { Assert-PlainTree $item.FullName }
    }
}

function Assert-Payload([string]$Root, [bool]$ExtensionOnly) {
    Assert-PlainTree (Join-Path $Root 'extension')
    foreach ($entry in $checksums.GetEnumerator()) {
        if ($ExtensionOnly -and -not $entry.Key.StartsWith('extension/')) { continue }
        $file = Join-Path $Root $entry.Key
        Assert-PlainPath $file
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "缺少文件：$($entry.Key)" }
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.Value) { throw "文件校验失败：$($entry.Key)，请重新下载" }
    }
    $prefix = (Join-Path $Root 'extension') + [IO.Path]::DirectorySeparatorChar
    foreach ($file in Get-ChildItem -LiteralPath $prefix -Recurse -File -Force) {
        if ($file.Name -eq '.DS_Store') { continue }
        $relative = 'extension/' + $file.FullName.Substring($prefix.Length).Replace('\', '/')
        if (-not $checksums.ContainsKey($relative)) { throw "插件含清单外文件：$relative" }
    }
}

$stage = $null
$previous = $null
$movedPrevious = $false
$installed = $false
$lockOwned = $false
try {
    Assert-PlainPath $PSScriptRoot
    $checksumFile = Join-Path $PSScriptRoot 'SHA256SUMS.txt'
    Assert-PlainPath $checksumFile
    $checksums = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
    $required = @('Install.command', 'Install-Windows.cmd', 'Install-Windows.ps1', 'INSTALL.html',
        'extension/manifest.json', 'extension/index.html', 'extension/popup.html', 'extension/background.js',
        'extension/certificate-fields.js', 'extension/content.js', 'extension/content.css', 'extension/official-rule-bridge.js')
    foreach ($line in Get-Content -LiteralPath $checksumFile -Encoding UTF8) {
        $match = [regex]::Match($line, '^([0-9a-f]{64})  (.+)$')
        if (-not $match.Success) { throw '校验清单格式错误' }
        $relative = $match.Groups[2].Value
        if (($required -cnotcontains $relative) -and $relative -cnotmatch '^extension/assets/[A-Za-z0-9_-]+\.(js|css)$') { throw "校验清单含不安全或未知路径：$relative" }
        if ($checksums.ContainsKey($relative)) { throw "校验清单含重复路径：$relative" }
        $checksums.Add($relative, $match.Groups[1].Value)
    }
    foreach ($relative in $required) { if (-not $checksums.ContainsKey($relative)) { throw "校验清单不完整：$relative" } }
    Assert-Payload $PSScriptRoot $false
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'extension/manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.manifest_version -ne 3 -or $manifest.version -notmatch '^[0-9]+(\.[0-9]+){0,3}$') { throw '插件清单或版本无效' }

    # These overrides are only needed by isolated installer checks; no browser profile is changed.
    $dataHome = if ($env:PLATEGO_DATA_HOME) { $env:PLATEGO_DATA_HOME } else { [Environment]::GetFolderPath('LocalApplicationData') }
    if ($dataHome -notmatch '^[A-Za-z]:[\\/]' -or $dataHome -match '[\r\n]' -or $dataHome -match '^[A-Za-z]:[\\/]$') { throw '应用数据目录必须是本机的绝对路径' }
    $installRoot = Join-Path $dataHome 'PlateGo'
    $destination = Join-Path $installRoot 'extension'
    Assert-PlainPath $installRoot
    Assert-PlainPath $destination
    if (Test-Path -LiteralPath $destination) {
        if (-not (Test-Path -LiteralPath $destination -PathType Container)) { throw "安装目标不是目录：$destination" }
        Assert-PlainTree $destination
    }
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Assert-PlainPath $installRoot
    $lock = Join-Path $installRoot '.install-lock'
    try { New-Item -ItemType Directory -Path $lock | Out-Null; $lockOwned = $true }
    catch { throw '已有安装在进行；若上次被强制中断，请按安装说明恢复' }
    $stage = Join-Path $installRoot ('.stage.' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path (Join-Path $stage 'extension') | Out-Null
    foreach ($relative in $checksums.Keys) {
        if (-not $relative.StartsWith('extension/')) { continue }
        $target = Join-Path $stage $relative
        New-Item -ItemType Directory -Path (Split-Path -Path $target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $relative) -Destination $target
    }
    Assert-Payload $stage $true
    if (Test-Path -LiteralPath $destination) {
        $previous = Join-Path $installRoot ('previous.' + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $previous | Out-Null
        Move-Item -LiteralPath $destination -Destination (Join-Path $previous 'extension')
        $movedPrevious = $true
    }
    Move-Item -LiteralPath (Join-Path $stage 'extension') -Destination $destination
    $installed = $true
} catch {
    $installError = $_.Exception.Message
    if ($movedPrevious -and -not $installed) {
        try {
            if (Test-Path -LiteralPath $destination) { Move-Item -LiteralPath $destination -Destination (Join-Path $stage 'failed-extension') }
            Move-Item -LiteralPath (Join-Path $previous 'extension') -Destination $destination
            Write-Host '已恢复上一版插件文件。'
        } catch { Write-Host "自动恢复失败；上一版完整文件仍位于：$previous\extension" }
    }
    Write-Host "安装未完成：$installError" -ForegroundColor Red
    exit 1
} finally {
    if ($stage -and (Test-Path -LiteralPath $stage)) { Remove-Item -LiteralPath $stage -Recurse -Force }
    if ($previous -and (Test-Path -LiteralPath $previous) -and -not (Get-ChildItem -LiteralPath $previous -Force)) { Remove-Item -LiteralPath $previous }
    if ($lockOwned) { Remove-Item -LiteralPath $lock }
}

Write-Host "`nPlateGo $($manifest.version) 的文件已准备好，浏览器内仍需你确认。"
Write-Host "目录：$destination"
if ($previous) { Write-Host "上一版保留在：$previous\extension" }
Write-Host '首次使用：在日常 Chrome 的 chrome://extensions 打开「开发者模式」，点「加载已解压的扩展程序」，选择上方目录。'
Write-Host '以后更新：在同一 Chrome 配置中找到 PlateGo，点重新加载，再刷新使用中的页面。'
Write-Host '若旧版从其他目录加载，请先导出可导出的数据并记录配置；更换目录可能改变扩展 ID。不要先删除旧扩展。'
if ($env:PLATEGO_NO_OPEN -ne '1') {
    try { Set-Clipboard -Value $destination; Write-Host '已把目录复制到剪贴板（替换了原剪贴板文本），选目录时粘贴到地址栏。' }
    catch { Write-Host '未能复制路径，请手动复制上方目录。' }
    try { Start-Process explorer.exe -ArgumentList ('"' + $destination + '"') } catch { Write-Host '请手动打开上方目录。' }
    try { Start-Process -FilePath (Join-Path $PSScriptRoot 'INSTALL.html') } catch { }
    $chrome = @(
        (Join-Path $dataHome 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
    )
    if (${env:ProgramFiles(x86)}) { $chrome += Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe' }
    $chrome = $chrome | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if ($chrome) {
        try { Start-Process -FilePath $chrome -ArgumentList 'chrome://extensions/' } catch { Write-Host '请手动在 Chrome 地址栏输入 chrome://extensions。' }
    } else { Write-Host '没有找到标准位置的 Chrome，请在你日常使用的 Chrome 地址栏输入 chrome://extensions。' }
}
