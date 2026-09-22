# 安装、更新与发布包

下载 `PlateGo-Chrome-v{版本}.zip`，完整解压后，macOS 双击 `Install.command`，Windows 双击 `Install-Windows.cmd`。用户不需要 Node.js、Python 或 npm。包内 `INSTALL.html` 是可离线阅读的中文引导，包含系统授权、浏览器权限、配置、迁移与回退步骤。ZIP 内部文件名采用 ASCII，避免系统解压器的中文文件名兼容性差异；用户的解压目录和安装目录支持空格与中文。

脚本校验所有包内文件，将插件暂存并复核后放入固定目录，保留更新前的文件，并尝试打开目录和 Chrome 扩展管理页。路径成功复制到剪贴板时会明确提示（会替换原剪贴板文本）。安装仍需要以下确认：

1. 在日常使用的 Chrome 个人资料中打开 `chrome://extensions`。
2. 首次使用打开“开发者模式”，点“加载已解压的扩展程序”，选择脚本提示的固定目录。
3. 看到 PlateGo 卡片并启用后，按需确认网站权限和固定图标；以后更新则点原卡片的重新加载，再刷新使用中的页面。

macOS 固定目录为 `~/Library/Application Support/PlateGo/extension`；Windows 为 `%LOCALAPPDATA%\PlateGo\extension`。每次沿用同一个目录与 Chrome 个人资料，不会另开测试浏览器配置。旧版若从其他目录加载，扩展 ID 可能不同；切换前导出可导出的数据并记录偏好、车辆档案、OCR 等配置，保留旧扩展和原目录。当前产品没有全部配置的一键迁移功能。文件备份也不包含 Chrome 存储的数据。

macOS 可能需要按系统提示右键“打开”或到“隐私与安全性”授权。Windows 启动器仅为本次 PowerShell 进程指定 `RemoteSigned`；不改变全局策略，组织策略优先。失败时会在资源管理器中选中 `Install-Windows.ps1`；若只是下载标记拦截，用户确认来源后，可右键该文件，通过“属性 → 解除锁定”对这一个文件授权再重试，或授权原 ZIP 后重新解压。受组织策略限制时停止并联系管理员。脚本不会关闭系统防护、移除隔离标记、写注册表或 Chrome Preferences、请求管理员权限、退出浏览器，或下载其他浏览器。

内置模拟工作台无需 API；OCR 密钥和语言在插件弹窗中自行配置，OCR 图片仅在主动识别时发送给 OCR.space。可选本机 API `http://127.0.0.1:8789` 不随安装启动。插件停止于填入，验证、选号确认与提交仍由用户操作。

普通 Chrome 的站外 ZIP 不能因此变成静默安装包。Chrome 137 起正式品牌构建不支持 `--load-extension`；此处使用官方“开发者模式 → 加载已解压”入口。[Chrome 分发说明](https://developer.chrome.com/docs/extensions/how-to/distribute)、[官方命令行变更公告](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY)。

## 更新与恢复

运行新版安装脚本后，旧文件完整保存在应用数据 `PlateGo/previous.*/extension`，脚本显示精确路径。校验或暂存失败不会替换旧目录；替换错误会尝试恢复旧文件。安装锁避免两个安装窗口同时写入。

若断电或强制终止，先确认安装脚本已停止，再检查固定目录。若 `extension` 缺失，将最近一份备份的 `extension` 移回固定位置，保留其他备份，删除空的 `.install-lock` 文件夹后重试。主动回退时先移走当前 `extension` 另作备份，再将所需版本放回固定位置。随后在 Chrome 重新加载；不要从 `previous.*` 路径另装一份。确认成功后可自行清理旧备份。

## 开发者的输出契约

先执行 `npm run build:extension`，然后 `node scripts/package-extension.mjs`。打包需要开发机上的 Node.js 和 `zip` 命令，无新增依赖；脚本读取已经构建好的 `apps/extension/dist/manifest.json` 版本号，不会隐式重新构建。

输出目录为 `dist/releases/`：

```text
PlateGo-Chrome-v{version}.zip
PlateGo-Chrome-v{version}.zip.sha256
```

ZIP 仅有一个顶层目录：

```text
PlateGo-Chrome-v{version}/
  Install.command          # ZIP 保留 0755 可执行权限
  Install-Windows.cmd
  Install-Windows.ps1       # UTF-8 BOM、CRLF，兼容系统 PowerShell 5.1
  INSTALL.html             # 中文离线说明
  SHA256SUMS.txt
  extension/
    manifest.json
    index.html
    popup.html
    background.js
    certificate-fields.js
    content.js
    content.css
    official-rule-bridge.js
    assets/                # 两个 HTML 实际引用的 JS/CSS
```

`SHA256SUMS.txt` 每行是 `64位小写SHA256 + 两个空格 + 包内相对路径`，覆盖除它本身外的全部文件。ZIP 旁的 `.zip.sha256` 使用同一行格式，文件名是 ZIP 的 basename；可与 ZIP 一起发布。哈希检查损坏，不代替发布者签名或可信下载来源验证。

打包只允许上列静态插件入口及 HTML 实际引用的单层 `assets/*.js` / `assets/*.css`；拒绝链接、不安全路径、白名单外 manifest 引用及未纳入清单的模块导入。源码、source maps、环境配置、浏览器资料、测试夹具及私有数据目录不会因递归复制整个项目而混入。若未来添加懒加载资源，应显式扩展打包契约并补充检查。

运行 `node --test apps/extension/scripts/installer*.test.mjs` 验证发布包与安装流程。macOS 检查通过 `PLATEGO_DATA_HOME` 指向真实临时目录，`PLATEGO_NO_OPEN=1` 禁止打开应用或写剪贴板，不改用户 HOME 或真实 Chrome 配置。Windows 脚本若在非 Windows 主机检查，结果只能证明静态约束与打包编码，不能代替 Windows PowerShell 5.1 的真实安装验收。
