# UI 布局与提示文字调整

2026-10-19。沿用现有蓝白配色，通过布局、分组、图标及文案区分界面。

## 界面变化

- 画面来源移入播放器工具栏，与画质、播放模式及缓存并列。
- 识别控制台按配置、区域与结果、自动操作三段组织，结果使用独立输出区。
- 重新绘制取景框标识与空状态图标，补充接入画面及桌面采集入口说明。
- 提示明确下一步操作，包括拖动框选、Esc 取消、识别自动复制、暂停后重新启动、记录位置的三秒等待。
- 弹窗增加可访问名称，预设名称输入框增加标签，保留键盘焦点提示。

## 功能边界

`index.html` 调整结构与文字；`style.css` 调整视觉与尺寸适配；`app.js` 只修改展示文案。播放器、选区坐标、OCR、IPC、快捷键、规则、自动输入和设置存储逻辑保持原样。未新增依赖。

原有 39 个带 ID 的功能控件，其类型、初始禁用状态、选项值、数值范围和画布尺寸已与回退点核对一致。主要颜色经运行时核对：主色 `#1762db`、背景 `#f7f8fa`、白色顶栏、播放器空状态 `#eef1f5`、结果区 `#f6f9ff`。

## 验证

- `npm test`：46 项通过。
- `npm run test:e2e`：真实 OCR、剪贴板、错误规则拒绝、停止及本地视频框选通过。
- `npm run test:media`：FLV 标准/低延迟、MP4、HLS、拖动框选和 OCR 通过。
- `npm run test:recognition`：后台识别、停止/重启与选区变更取消通过。
- `npm run test:settings`、`npm run test:presets`：设置与预设流程通过。
- 真实 Electron 检查默认、最小窗口及 320 / 768 / 1024 / 1440 宽度；无控件横向溢出，无渲染异常，键盘焦点可见。默认窗口完整显示主界面，小窗口可纵向滚动。
- 来源弹窗使用隔离的模拟来源核对打开与取消；本次未重新执行真实桌面采集或游戏自动输入。

本地截图位于 `artifacts/ui-default.png`、`artifacts/ui-demo.png`、`artifacts/ui-minimum.png`；尺寸报告为 `artifacts/ui-layout-report.json`。这些文件按仓库规则不提交。

## Git 与回退

工作分支：`feature/ui-refresh`。修改前标签：`ui-before-20261019`，指向 `12f7b9d`。

查看原界面可切回原分支：

```powershell
git switch fix/game-window-input
```

在当前分支只恢复三个界面文件，并保留历史：

```powershell
git restore --source ui-before-20261019 -- src/ui/index.html src/ui/style.css src/ui/app.js
git commit -m "revert: restore UI before layout refresh"
```

执行恢复前应先保存后续未提交的界面改动。两份原有 OCR 审计文档未纳入本次提交。
