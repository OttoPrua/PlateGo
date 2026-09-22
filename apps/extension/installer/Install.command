#!/bin/bash
set -euo pipefail
umask 077

pause_window() { if [[ -t 0 && "${PLATEGO_NO_OPEN:-0}" != 1 ]]; then read -r -p "按回车关闭窗口…" _ || true; fi; }
trap 'status=$?; pause_window; exit "$status"' EXIT
fail() { printf '\n安装未完成：%s\n请查看同目录的中文说明 INSTALL.html。\n' "$*" >&2; exit 1; }
plain_path() {
  local item="$1"
  while [[ "$item" != / && -n "$item" ]]; do
    [[ ! -L "$item" ]] || fail "路径包含符号链接：$item"
    item=$(dirname "$item")
  done
}
plain_tree() {
  [[ -d "$1" ]] || fail "目录不存在：$1"
  [[ -z "$(find "$1" ! -type f ! -type d -print -quit)" ]] || fail "目录含符号链接或特殊文件：$1"
}
allowed() {
  case "$1" in
    Install.command|Install-Windows.cmd|Install-Windows.ps1|INSTALL.html|extension/manifest.json|extension/index.html|extension/popup.html|extension/background.js|extension/certificate-fields.js|extension/content.js|extension/content.css|extension/official-rule-bridge.js) return 0 ;;
  esac
  [[ "$1" =~ ^extension/assets/[A-Za-z0-9_-]+\.(js|css)$ ]]
}
verify() {
  local root="$1" scope="$2" line digest relative actual found=$'\n'
  [[ -f "$package_root/SHA256SUMS.txt" && ! -L "$package_root/SHA256SUMS.txt" ]] || fail "缺少校验清单"
  plain_tree "$root/extension"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^([0-9a-f]{64})\ \ (.+)$ ]] || fail "校验清单格式错误"
    digest="${BASH_REMATCH[1]}"; relative="${BASH_REMATCH[2]}"
    allowed "$relative" || fail "校验清单含不安全或未知路径：$relative"
    case "$found" in *$'\n'"$relative"$'\n'*) fail "校验清单含重复路径：$relative" ;; esac
    found="${found}${relative}"$'\n'
    if [[ "$scope" == extension && "$relative" != extension/* ]]; then continue; fi
    plain_path "$root/$relative"
    [[ -f "$root/$relative" ]] || fail "缺少文件：$relative"
    actual=$(shasum -a 256 < "$root/$relative"); actual="${actual%% *}"
    [[ "$actual" == "$digest" ]] || fail "文件校验失败：${relative}（请重新下载）"
  done < "$package_root/SHA256SUMS.txt"
  for relative in Install.command Install-Windows.cmd Install-Windows.ps1 INSTALL.html extension/manifest.json extension/index.html extension/popup.html extension/background.js extension/certificate-fields.js extension/content.js extension/content.css extension/official-rule-bridge.js; do
    case "$found" in *$'\n'"$relative"$'\n'*) ;; *) fail "校验清单不完整：$relative" ;; esac
  done
  while IFS= read -r -d '' relative; do
    relative="extension/${relative#"$root/extension/"}"
    case "$found" in *$'\n'"$relative"$'\n'*) ;; *) fail "插件含清单外文件：$relative" ;; esac
  done < <(find "$root/extension" -type f ! -name .DS_Store -print0)
}

[[ ! -L "${BASH_SOURCE[0]}" ]] || fail "安装脚本不能是符号链接"
package_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
verify "$package_root" all
[[ "$(plutil -extract manifest_version raw -o - "$package_root/extension/manifest.json")" == 3 ]] || fail "插件清单不是 MV3"
version=$(plutil -extract version raw -o - "$package_root/extension/manifest.json")
[[ "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || fail "插件版本格式错误"

# The two PLATEGO_ overrides let the focused checks use an isolated temporary directory without opening apps.
data_home="${PLATEGO_DATA_HOME:-$HOME/Library/Application Support}"
[[ "$data_home" == /* && "$data_home" != / && "$data_home" != *$'\n'* ]] || fail "应用数据目录必须是有效的绝对路径"
install_root="$data_home/PlateGo"
destination="$install_root/extension"
plain_path "$install_root"
plain_path "$destination"
[[ ! -e "$destination" || -d "$destination" ]] || fail "安装目标不是目录：$destination"
if [[ -e "$destination" ]]; then plain_tree "$destination"; fi
mkdir -p "$install_root"
plain_path "$install_root"
lock="$install_root/.install-lock"
mkdir "$lock" 2>/dev/null || fail "已有安装在进行；若上次被强制中断，请按安装说明恢复"
stage=""; previous=""; installed=0
cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$installed" == 0 && -n "$previous" && -d "$previous/extension" ]]; then
    if [[ -e "$destination" || -L "$destination" ]] && ! mv "$destination" "$stage/failed-extension"; then
      printf '\n无法移动未完成的新文件；上一版完整文件仍位于：%s/extension\n' "$previous" >&2
    elif mv "$previous/extension" "$destination"; then
      printf '\n已恢复上一版插件文件。\n' >&2
    else
      printf '\n自动恢复失败；上一版完整文件仍位于：%s/extension\n' "$previous" >&2
    fi
  fi
  if [[ -n "$stage" && "$stage" == "$install_root"/.stage.* && ! -L "$stage" ]]; then rm -rf -- "$stage"; fi
  if [[ -n "$previous" ]]; then rmdir "$previous" 2>/dev/null || true; fi
  rmdir "$lock" 2>/dev/null || true
  if [[ "$status" != 0 ]]; then printf '\n安装未完成；请查看中文说明 INSTALL.html。\n' >&2; fi
  pause_window
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP
stage=$(mktemp -d "$install_root/.stage.XXXXXX")
mkdir "$stage/extension"
while IFS= read -r line; do
  relative="${line:66}"
  [[ "$relative" == extension/* ]] || continue
  mkdir -p "$(dirname "$stage/$relative")"
  cp "$package_root/$relative" "$stage/$relative"
done < "$package_root/SHA256SUMS.txt"
verify "$stage" extension
if [[ -d "$destination" ]]; then
  previous=$(mktemp -d "$install_root/previous.XXXXXX")
  mv "$destination" "$previous/extension"
fi
mv "$stage/extension" "$destination"
installed=1

printf '\nPlateGo %s 的文件已准备好，浏览器内仍需你确认。\n目录：%s\n' "$version" "$destination"
if [[ -n "$previous" ]]; then printf '上一版保留在：%s/extension\n' "$previous"; fi
printf '\n首次使用：在日常 Chrome 的 chrome://extensions 打开「开发者模式」，点「加载已解压的扩展程序」，选择上方目录。\n以后更新：在同一 Chrome 配置中找到 PlateGo，点重新加载，再刷新使用中的页面。\n如果旧版从其他目录加载，请先导出可导出的数据并记录配置；更换目录可能改变扩展 ID。不要先删除旧扩展。\n'
if [[ "${PLATEGO_NO_OPEN:-0}" != 1 ]]; then
  if command -v pbcopy >/dev/null && printf '%s' "$destination" | pbcopy; then
    printf '\n已把安装目录复制到剪贴板（替换了原剪贴板文本）。选目录时可按 ⌘⇧G，再粘贴路径。\n'
  else
    printf '\n未能复制路径，请手动复制上方目录。\n'
  fi
  open "$destination" || printf '请手动打开上方目录。\n'
  open "$package_root/INSTALL.html" || true
  open -a "Google Chrome" "chrome://extensions/" || printf '请手动在 Chrome 地址栏输入 chrome://extensions。\n'
fi
