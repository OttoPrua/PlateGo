# PlateGo Chrome MV3 插件

插件工作台可在没有网页和后端时独立打开；全国 31 个地区的固定模拟号池随构建产物打包。上海 `official-mock` 是 v1 页面适配验收入口，真实 `sh.122.gov.cn` DOM 在现场验收前始终 fail closed。

## 构建与加载

在项目根目录执行：

```sh
npm run check -w @platego/extension
```

然后打开 `chrome://extensions`，启用“开发者模式”，选择“加载已解压的扩展程序”，目录为：

```text
apps/extension/dist
```

Chrome 151 正式版会忽略命令行 `--load-extension`；验收时应使用上述界面加载方式。工作台无需后端即可使用固定模拟数据。可选本地后端默认地址为 `http://127.0.0.1:8789`。

## 页面安全边界

- 本地样机：仅 `http://127.0.0.1:4173/official-mock` 或同端口 `localhost`，且必须满足 `shanghai-v1` 脱敏 DOM 契约。
- 真实上海域名：只识别精确的 `https://sh.122.gov.cn`；不读取候选 DOM、不填入、不采集、不上传。
- 随机选号：页面初始为空；只有用户亲自点击“随机一次”后，插件才只读当前 10 个号码并本地评分，不点击号码、“随机一次”或“换一批”。
- 自编选号：用户点击一次启动后，脚本只向样机输入框写入前缀并退格遍历；结束时恢复探针输入框原值。
- 候选更新、公共模拟观察上传、分组填入都是互相独立的用户点击动作。
- 内容脚本没有页面 `.click()`、表单 `submit()`、`requestSubmit()`、鼠标事件或键盘事件合成路径。
- 公共观察后台仅接受 `simulation + official-mock + 310000`，并拒绝真实域名发送者、`live`、私有字段和旧端口 `8787`。

公共 Coverage 契约保留 `complete | partial | position-only | unknown`。本地上海 v1 完整遍历当前只产生 `complete | partial | unknown`；`position-only` 为未来只能安全观察位置可用性的适配器保留。

## 手动验收

1. 启动网页样机并进入 `/official-mock`，由用户逐步完成 LOGIN、基本信息、确认、服务说明和手机验证等当前可见入口；确认信息页必须由用户先勾选确认框，再点击继续。插件在 `SELECTION_READY` 前不得推进页面。
2. 确认随机选号页初始没有号码和评分；由用户亲自点击“随机一次”后，确认助手显示 10 个只读评分，样机号码按钮状态没有变化。
3. 由用户进入自编选号并点击“开始完整采集”；确认 Coverage 为 `complete`、完整组合为 240，且首个输入框的原值（包括非空值）已恢复。
4. 检查保留、移除、未知、新增四类差异；分别点击本机更新与公共模拟观察上传。
5. 按组填入候选；确认样机的验证结果仍为空，并由用户自行决定是否点击“验证本组”。插件不得点击验证、随机号码、换批或“确认选号”。
6. 打开插件工作台，确认 Chrome storage 中的候选更新已同步显示。

`npm run smoke:fixture -w @platego/extension -- http://127.0.0.1:9229` 可在已手动加载插件且开启远程调试的临时 Chrome 配置中复跑上述闭环。配套内存验收后端为 `npm run fixture:api -w @platego/extension`，默认只监听 IPv6 loopback 的 `8789`。
