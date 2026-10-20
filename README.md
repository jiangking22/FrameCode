# FrameCode

FrameCode 是 Windows 10/11 x64 的本地房间码识别工具。它支持直播流、本地视频和桌面/窗口画面，在选定区域中识别房间码并复制到剪贴板，也可以按需自动完成粘贴与加入。

## 使用

1. 运行 Setup 安装包，或解压便携 ZIP 后启动 `FrameCode.exe`。
2. 连接直播、打开本地视频，或在“画面来源”中选择桌面/窗口。
3. 选择识别规则，在画面中框选完整房间码。
4. 点击“开始识别”，或按 `Ctrl + 1`。确认后的房间码会自动复制。

### 自动操作

打开“自动粘贴并加入”后：

- 无畏契约规则：按 `Ctrl + 2` 记录粘贴按钮，按 `Ctrl + 3` 记录加入按钮。
- 三角洲规则：按 `Ctrl + 3` 记录加入按钮；开始前先点击游戏房间码输入框，识别后自动使用 `Ctrl + V` 并点击加入。
- 移动游戏窗口、切换分辨率或重新启动应用后，请重新记录位置。
- 自动操作需要管理员权限；按 `Ctrl + Shift + Q` 可随时停止。

### 识别规则

| 规则 | 房间码格式 |
| --- | --- |
| 无畏契约特调 | 3 个大写字母 + 3 位数字 |
| 三角洲特调 | 3 个大写字母 + 4 位数字 |
| 三角洲 1V1 特调 | 4 个大写字母 + 4 位数字 |
| 通用六位码 | 6 位大写字母或数字 |

## 安装包与便携版

从 [GitHub Releases](https://github.com/jiangking22/FrameCode/releases/latest) 下载 `FrameCode-版本-win32-x64-Setup.exe`，按向导安装；也可以下载同版本 ZIP，解压后运行 `FrameCode.exe`。安装包提供开始菜单快捷方式、可选桌面快捷方式和 Windows 卸载入口。OCR 在本地离线运行，观看直播需要网络。

不需要安装 AS、Tesseract、Python 或 Node.js。OCR 引擎、依赖库和英文数字识别数据都随安装包和便携版提供。便携版需要完整解压，不能只复制 `FrameCode.exe`。0.3.5 修复了中文安装路径下 OCR 无法读取语言文件的问题，支持安装在含中文或空格的目录。

自动操作需要以管理员身份运行程序。首次从管理员版安装器启动时以当前 Windows 用户启动；需要操作高权限游戏时，退出 FrameCode，再右键程序选择“以管理员身份运行”。

## 源码运行与打包

```powershell
npm install
npm run resources
npm start
npm run package
```

`npm run resources` 只校验随项目保存的运行资源。Windows x64 打包还需要安装 Inno Setup 6.7 或更新版本；如果 `ISCC.exe` 不在常见安装位置，请把 `INNO_SETUP_ISCC` 设为编译器完整路径。`npm run package` 会在 `dist/` 生成安装程序、便携 ZIP 和本地应用文件夹。发布包含离线 OCR、Streamlink、播放器依赖、演示视频和第三方组件声明，不需要额外安装服务。

`npm test` 包含中文临时目录中的真实 OCR 初始化测试，以及启动错误和响应序号校验测试。需要完整的本地 OCR 资源。

对实际安装目录执行 `node scripts/smoke-installed.cjs "完整路径\FrameCode.exe" "测试输出目录"` 可以验证程序启动、版本号、内置演示播放和离线 OCR 确认流程，并保存截图。测试使用独立用户数据目录和仅含 Windows 系统目录的 PATH，核对 OCR 已加载模块只能来自程序包或 Windows，并保存模块路径清单。演示识别会将 `ABC123` 复制到剪贴板。此为进程环境隔离测试，不等同于全新 Windows 虚拟机测试。打包时自动执行回归测试和生成程序的演示识别测试。
