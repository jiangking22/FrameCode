# 验证记录

## 0.3.2：自动输入权限核验

2026-10-18。用户反馈已记录专用粘贴按钮，界面显示“操作已发送”而游戏无响应。进一步发现官方 `As.exe` 清单为 `requireAdministrator`，组件为 `asInvoker`；FrameCode 普通启动是明确的权限差异，但尚未现场读取游戏令牌，不能仅据此断言用户这次无响应的唯一原因。详见 [官方启动清单证据](INPUT-COMPARISON.md)。

现按官方 `TokenIntegrityLevel` 处理，在录点及移动、按下、粘贴之前只读比较工具与目标进程权限；目标更高或无法核验就停止并提示，保留释放动作，不自动提权。

| 验证 | 结果与范围 |
| --- | --- |
| `npm test` | 46/46；新增更高目标、读取失败、同等权限、句柄释放及真实系统令牌读取测试 |
| `npm run test:native` | 真实自建窗口粘贴与加入通过；新权限检查未破坏同等权限的输入 |
| `node tests/native-e2e.cjs dist/FrameCode-win32-x64/FrameCode.exe` | 0.3.2包内输入桥及helper的相同真实窗口流程通过 |
| `npm run test:packaged` | 0.3.2实际EXE的启动、离线识别、剪贴板和窗口采集通过 |

受控测试的3个权限拒绝场景在改动前均错误发送输入，修复后均在移动之前停止。使用者随后现场确认：退出后以管理员身份运行 FrameCode，重新记录位置，并在游戏前台按 Ctrl+1，已恢复自动粘贴。该反馈验证了此次权限匹配处理的实际效果；没有单独报告自动加入结果。

## 0.3.1：游戏窗口自动输入

2026-10-18。对照当前官方 DLL 的反编译 CIL，将 `SetCursorPos` 移动改为官方实际执行链的 `SendInput` 绝对虚拟桌面移动；统一输入 helper 的 DPI 坐标并保留窗口与停止校验。详见 [官方输入对照](INPUT-COMPARISON.md)。

| 命令 | 结果与范围 |
| --- | --- |
| `npm test` | 41/41；包含11项实际C#的受控Win32边界回归，旧版已复现 `Unable to move cursor`，修复后通过 |
| `npm run test:native` | 当前125%缩放下，真实自建窗口的移动、粘贴、加入、`ABC123`回读与窗口采集通过 |
| `node tests/native-e2e.cjs dist/FrameCode-win32-x64/FrameCode.exe` | 从0.3.1包内加载输入桥及helper，相同真实窗口流程通过 |
| `npm run test:packaged` | 实际EXE启动、包内离线OCR、私有样本识别、剪贴板回读、桌面窗口采集通过 |
| `npm run package` | 0.3.1目录与ZIP生成；打包前后官方OCR组件校验通过；包内输入脚本与源码SHA256一致 |

可运行目录为 `dist/FrameCode-win32-x64/`，压缩包为 `dist/FrameCode-0.3.1-win32-x64.zip`。测试夹具修正了隐藏PowerShell宿主压住窗口首次显示，以及DPI坐标不一致的问题；显式显示后旧版自建窗口基线也通过。未对真实游戏发送自动输入，不能把上述结果视为游戏现场验证。Windows拒绝输入时会显示底层错误码，并提示核对游戏与工具权限；不自动提权。

## 0.3.0：原版组件接入

2026-10-18。当前实现已由独立Tesseract.js方案替换为原版AS原生worker；下文0.2.x测试和成功率均为历史结果。原生组件完整性、协议和原安装输出一致性见 [官方组件接入记录](OCR-COMPARISON.md)。

| 命令 | 结果与范围 |
| --- | --- |
| `npm run resources` | 原样复制59个官方文件，逐文件SHA256校验通过 |
| `npm test` | 30/30，包括取消、异常、资源损坏、官方裁剪和最新帧/ACK调度 |
| `npm run test:official` | 16/16；原安装与复制worker对相同RGBA的14次观察结果一致 |
| `npm run test:recognition` | 真实UI/IPC单次调用、只接受native candidate、停止/重启/换选区隔离及后台识别通过 |
| `npm run test:e2e` | 演示ABC123、私有样本整输入框识别、剪贴板、错误规则与停止通过 |
| `npm run test:regions` | 7/7选区与原安装worker逐帧一致，6个清晰样本双帧确认，低清样本双方拒绝 |
| `npm run test:media` | MSE、WebCodecs、MP4、HLS的播放、真实框选与OCR通过 |
| `npm run test:presets` | 预设保存、自动应用、参考框及持久化通过 |
| `npm run package` | 生成0.3.0目录与ZIP，打包前后组件清单校验通过 |
| `npm run test:packaged` | 实际EXE启动、包内离线OCR、私有样本识别、剪贴板与桌面窗口采集通过 |
| `node tests/ocr-region-e2e.cjs dist/FrameCode-win32-x64/FrameCode.exe` | 打包EXE的相同7项选区对照全部通过 |

选区报告在 `artifacts/ocr-regions-source/report.json` 与 `artifacts/ocr-regions-packaged/report.json`。JPEG对照使用官方同样的GDI+解码流程，PNG使用独立PNG解码；对照严格比较raw、candidate和confidence，没有放宽断言或修改原组件。

本地发布包为 `dist/FrameCode-0.3.0-win32-x64.zip`，解压运行目录为 `dist/FrameCode-win32-x64/`。包内含全部OCR组件，无需运行时读取AS安装目录。使用者已现场确认识别可用。私有截图、清单、日志、发布包和官方二进制组件不随源码Git提交。

## 0.2.1 增补

2026-10-18：`npm test` 22/22，`test:e2e`、`test:recognition`、`test:regions`、`test:ocr-benchmark` 和 `test:packaged` 已通过。真实弹窗 0.75/0.5 倍样本从无法确认变为双帧确认；同组样本已用打包程序复测。本次低清屏幕截图仍拒绝确认，详见 [官方对照与修复](OCR-COMPARISON.md)。发布包版本为 0.2.1。以下为 0.2.0 的历史验证记录。

验证日期：2026-10-18。环境为 Windows x64、Electron 44.9.0、Node.js 24.16.0。

## 自动测试

| 命令 | 结果 | 覆盖内容 |
| --- | --- | --- |
| `npm test` | 20/20 通过 | 原有核心检查、码字级置信度、区域预设校验、连续失败切换、重置、灰度增强和反锐化 |
| `npm run test:e2e` | 通过 | 演示视频 `ABC123`、本地私有截图生成的视频整条房间码输入框、真实拖动框选、剪贴板回读、错误规则、停止、设置和媒体停止 |
| `npm run test:recognition` | 通过 | 真实 UI/IPC 下隐藏窗口继续识别、码字复核取消隔离、停止/重新开始/换选区丢弃延迟结果、选区尺寸和边距 |
| `npm run test:presets` | 通过 | 预设保存、自动应用、手动应用、参考框显示和设置持久化 |
| `npm run test:ocr-benchmark` | 通过 | 固定原版对照，宽选区3/3确认、总正确确认48/50、模糊样本增益、无错误确认、清晰码速度浮动不超过10%；详见 [OCR 测试记录](OCR-VERIFICATION.md) |
| `npm run test:media` | 通过 | HTTP-FLV 的 MSE 播放和 WebCodecs 低延迟播放、直接 HTTP MP4、HLS、真实拖动框选及 OCR |
| `npm run test:native` | 通过 | 隔离 PowerShell 窗口中真实执行受保护的 `SendInput` 粘贴和加入点击，结果为 `ABC123`；同时验证独立窗口采集 |

## 发布包

`npm run package` 生成：

- 解压运行目录：`dist/FrameCode-win32-x64`
- 发布压缩包：`dist/FrameCode-0.2.0-win32-x64.zip`

打包脚本会检查 OCR 模型、`tesseract.js-core`、`mpegts.js`、`hls.js`、演示视频、Streamlink、原生输入脚本和主程序文件都存在。

`npm run test:packaged` 直接启动打包后的 `FrameCode.exe`，使用临时用户目录完成以下验证：

- 应用启动和页面加载。
- 启动后直接进入主工作台，不存在密码框、登录按钮、注册页、会员校验或授权拦截。
- 包内离线 OCR 模型读取演示视频并得到 `ABC123`。
- 包内OCR框选本地样本视频的整条房间码输入框并得到正确结果。
- 系统剪贴板回读一致。
- 桌面窗口枚举、选择窗口和视频画布采集。
- 包内 Streamlink 版本为 8.6.2。

另通过 `FRAMECODE_LIVE_URL` 指定正在开播的公开房间执行了直播测试。Streamlink成功解析Bilibili HTTP-FLV流，打包后的应用完成连接并显示视频画面。实际直播地址仅本地保存，后续复测需自行指定当前公开直播间。

还把发布 ZIP 解压到独立临时目录，并从解压副本启动应用；离线 OCR、剪贴板回读和窗口采集同样通过，确认运行不依赖源码目录。

## 证据截图

- `artifacts/ready.png`：开发版演示画面就绪。
- `artifacts/recognized.png`：开发版 OCR 确认为 `ABC123`。
- `artifacts/valorant-recognized.png`：本地游戏截图经过视频编码、播放和框选后正确识别。
- `artifacts/presets.png`：区域预设列表、自动应用状态和播放器参考框。
- `artifacts/standard-stream.png`：HTTP-FLV 标准播放确认识别。
- `artifacts/low-stream.png`：WebCodecs 低延迟播放确认识别。
- `artifacts/direct-mp4-stream.png`：直接 MP4 播放确认识别。
- `artifacts/hls-stream.png`：HLS 播放确认识别。
- `artifacts/desktop-capture.png`：独立测试窗口采集。
- `artifacts/packaged-recognized.png`：打包版离线 OCR 完成。
- `artifacts/packaged-valorant.png`：打包版识别整条无畏契约房间码输入框。
- `artifacts/packaged-desktop.png`：打包版窗口采集完成。
- `artifacts/packaged-live.png`：打包版连接公网 Bilibili 直播。

## 尚未覆盖

- 未向真实无畏契约对局发送自动点击。输入链路已在隔离窗口中真实验证，游戏内仍需核对窗口模式、按钮坐标和反作弊环境下的系统输入处理。
- 未验证全部直播平台、登录态、地区限制和平台解析变更。当前能力以 Streamlink 8.6.2 及平台公开页面为准。
- 该0.2.0历史版本未与AS原组件做同画面、同帧率的成功率对比，OCR当时为独立实现；0.3.0已替换此方案。
