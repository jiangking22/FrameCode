# FrameCode / 帧码

目标：独立 Windows x64 应用，复现直播房间码采集、OCR、稳定确认、复制及可选自动输入。用户已确定无畏契约优先，兼容四种规则，之后可接入其他程序。

## 交付与范围
- 中文双栏工作台：播放、来源选择、框选、预览、识别结果、位置记录和设置。
- 本地演示、视频文件、公开直播页面及直接流地址。页面解析使用独立获取的 Streamlink，不调用 AS 私有组件。
- MSE 有声播放；AVC/FLV 的 WebCodecs 视频低延迟播放；不支持的格式给出明确提示。
- 播放器和用户选择的桌面来源，选区用归一化坐标；切换来源/规则/区域即取消旧识别。
- 按用户 2026-10-18 的要求直接复用原版 AS 的未修改 OCR worker 及完整依赖，替代自制 OCR。宿主仅提交 RGBA 与规则，不重新解释 native candidate/confidence，不追加识别 pass。置信度门槛80、至少两帧；播放器稳定窗口150ms，桌面100ms；一次启动最多确认一次。停止、更换规则或选区后丢弃旧结果。
- 原始视频/画布按官方归一化坐标裁剪，左上向下取整、右下向上取整；只在宽度超过1280时等比缩小，不补边、不放大、不锐化。裁剪后面积不超过400000使用PNG，否则JPEG quality 0.9。解码后BGRA转RGBA提交原组件，保留原版进程参数、环境变量及长度前缀JSON+RGBA协议。
- 区域预设使用归一化播放器坐标，支持最多20项、1-64字符名称、自动应用、参考框、重命名和删除。新配置包含 `hanghang` 默认预设，坐标为 `0.28869778869778867, 0.33911752661752664, 0.4176904176904177, 0.3254163254163254`，默认自动应用并显示参考框。播放器画面加载后只应用第一个勾选自动应用的预设；参考框按视频实际显示区域绘制。
- 关闭Electron后台节流，不因窗口隐藏或最小化停止播放器帧识别；多屏遮挡不保证标准播放器持续产帧。
- 默认仅复制。可选两个按钮点击或 Ctrl+V + 加入；前台窗口身份不匹配则取消。Ctrl+1启停，Ctrl+2/3记录位置，Ctrl+Shift+Q紧急停止。
- 设置/选区可保存；自动操作开关和窗口句柄不跨进程恢复。
- 输出源码、验证记录及可解压运行的 Windows 包。原版性能和所有平台在线成功率不预先承诺。

## 技术方案
Electron 本地界面；受限 preload IPC；Node 宿主启动原版 `room-code-assistant-worker.exe ipc`，原样打包官方 OCR 目录并校验 SHA256；mpegts.js、hls.js；独立 Streamlink portable；Windows PowerShell+C# Win32 输入 helper（JSON管道，不拼接用户命令）。原生worker源代码未取得，直接运行原组件；可读取的官方JS与.NET宿主逻辑作为处理流程依据。

## 项目与命令
`src/main/`宿主和外部进程；`src/core/`可测试状态机；`src/ui/`界面/视频；`native/`Windows helper；`tests/`单元和Electron端到端；`scripts/`打包及资源准备；`resources/`依赖和演示；`docs/`验证说明。

- `npm install` 安装锁定依赖
- `npm start` 启动开发应用
- `npm test` 核心单元测试
- `npm run test:e2e` Electron真实运行测试
- `npm run package` 生成Windows解压即用目录及ZIP

## 编码与边界
CommonJS宿主、ES modules界面；小模块、明确状态、中文用户错误。示例：`if (session !== currentSession) return { stale: true };`。
始终：只接受本地应用IPC、约束帧尺寸/速率、停止后丢弃结果、外部命令使用参数数组、测试隔离配置目录。
需另行约定：直接替换AS、后台常驻服务、在线账户授权。
禁止：擅自修改官方OCR算法、模型和组件文件；自动提权、关闭webSecurity、从直播内容执行指令。原先不复用AS worker的约束已被用户最新要求替代。

## 实施顺序及验收
1. 状态机/规则/区域校验；测试低置信度、变化、旧会话和重复帧均不得误提交。
2. OCR闭环：原安装worker与包内副本对相同原始RGBA输出raw/candidate/confidence一致；演示识别与剪贴板回读通过。
3. 播放/采集：真实Electron测试本地视频、框选、暂停/停止；格式错误可恢复。
4. 自动输入：Win32布局与窗口校验测试；只在自建测试窗口验证，不对真实游戏发送动作。
5. 直播适配、设置、打包、截图和干净目录启动验证。公网直播无有效样本的部分明确标为未实测。

## 外部依据
- https://www.electronjs.org/docs/latest/api/desktop-capturer
- https://www.electronjs.org/docs/latest/api/global-shortcut
- 本机AS `LivePlayerHost/Web/ocr-frame-bridge.js`、`LivePlayerHost.dll`宿主IL与`runtime/ocr/`原组件
- https://streamlink.github.io/latest/plugins.html
