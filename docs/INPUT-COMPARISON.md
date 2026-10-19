# 游戏窗口自动输入：官方实现对照

记录日期：2026-10-18。范围：识别成功之后的粘贴与加入操作。

## 用户报告与可确认的失败点

报告提示：`输入已取消：目标窗口已变化或 Windows 拒绝了操作。`
详情：`使用“10”个参数调用“Click”时发生异常:“Unable to move cursor”`。

FrameCode 原 `FrameInput.Click` 先验证前台窗口、PID、窗口矩形与坐标，随后调用 `SetCursorPos`。
只有该 API 返回 false 时才抛出 `Unable to move cursor`；因此，本次错误定位在移动鼠标阶段，尚未进入按下与抬起阶段。
PowerShell 的“10 个参数”是方法调用包装信息，本身不说明参数数量错误。
外层通用提示不能证明前台确实切换，也不能证明是权限不足。
原 `SetCursorPos` 声明未设置 `SetLastError=true`，现有错误没有可靠的 Win32 原因码；具体 Windows 拒绝原因仍未知。

## 官方组件身份与证据边界

分析对象：`%LOCALAPPDATA%\com.administrator.fps-vantix\LivePlayerHost\LivePlayerHost.dll`。

- 版本：`LivePlayerHost 0.1.81.0`；x64 CIL；`.NETCoreApp,Version=v10.0`。
- SHA-256：`3e7ff64566ec9b80f1cbd3b8e9d9de72e3a713ff32d0a161cfc0e1239c4b0020`。
- MVID：`78da827e-c124-4d51-8af0-bd499594acd9`。
- REA 身份证据：`ev_229b648dba84c1772357033e7e997c8e102adec529872f824163fef315b2a7d7`。

这里读取的是官方已发布 DLL 的反编译 CIL 指令，不是官方原始 C# 源码。
本次用 dnfile/dncil 从当前 DLL 重新解码了 12 个相关方法，逐方法与既有 `analysis/LivePlayerHost.il.txt` 完整比对，全部一致。
下列 token 和 RVA 仅适用于上述 SHA-256/MVID 对应版本，不能直接用于其他版本。

## 实际使用的调用链

`PlayerForm` 构造函数把 `mouseSender` 设置为 `InputActions.SendScreenMouse`。
`RunActionAsync` 读取该委托并传给 `ActionExecution.Start`；双按钮模式通过 `ClickSequence.RunAsync` 依次执行粘贴和加入。
DLL 中也存在调用 `SetCursorPos` 的旧辅助方法；仅搜索 API 名称会混淆路径。上述实际委托链使用 `SendInput` 移动鼠标。

下表偏移沿用 dncil 转储的“方法体起点”坐标，包含方法头，不是去掉方法头后的标准 `IL_` 指令偏移。

| 方法或状态机 | token | RVA | 转储内方法体偏移/行为 |
| --- | --- | --- | --- |
| `PlayerForm::.ctor` | `0x0600024B` | `0xCA40` | `0x0076` 加载 `SendScreenMouse`，`0x0087` 保存委托 |
| `<RunActionAsync>d__35::MoveNext` | `0x060007C1` | `0x27F04` | `0x00B5` 读取 `mouseSender`，`0x017E` 调用 `ActionExecution.Start` |
| `<<Start>g__ExecuteAsync\|0>d::MoveNext` | `0x06000A03` | `0x49CC0` | `0x02A4` 创建 `ClickSequence`，`0x02C1` 调用 `RunAsync` |
| `<ClickAsync>d__7::MoveNext` | `0x06000807` | `0x34750` | `0x0037/00C9/0163` 分别发送移动、按下、抬起 |
| `InputActions::SendScreenMouse` | `0x06000408` | `0x15A14` | `0x0097` 调用 `SendInput`，检查返回数为 1 |
| `InputActions::ScreenMouseFlags` | `0x06000407` | `0x159D4` | 三个阶段的 flags 分别为 `0xC001`、`0x0002`、`0x0004` |
| `InputActions::TryNormalizeVirtualScreenPoint` | `0x0600040A` | `0x15BB0` | 验证虚拟桌面范围并转换绝对坐标 |
| `InputAccess::CheckForeground / CheckLevels` | `0x060003F0 / 0x060003F1` | `0x152E0 / 0x15338` | 核验前台窗口及进程完整性级别 |
| `ApplicationConfiguration::Initialize` | `0x060001F2` | `0x9F86` | `0x000C/000D` 设置 `HighDpiMode=3`，即 PerMonitorV2 |

## 坐标、时序与权限处理

移动事件的 `0xC001` 为 `MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK`。
虚拟桌面原点和尺寸取 `GetSystemMetrics(76/77/78/79)`，支持原点为负数的副屏。
任一尺寸小于等于 1，或坐标超出虚拟桌面范围时，拒绝移动；合法坐标按以下公式转换：

```text
normalizedX = Math.Round((x - virtualLeft) * 65535.0 / (virtualWidth - 1))
normalizedY = Math.Round((y - virtualTop) * 65535.0 / (virtualHeight - 1))
```

每次点击：移动 → 等待 `SettleMs` → 按下 → 等待 `HoldMs` → 在 `finally` 中抬起。
两次点击之间等待 `GapMs`。各阶段单独发送一个 `INPUT`，并检查 Windows 接受的事件数量。
移动和按下前核验目标；抬起阶段跳过会阻断释放的校验，确保不会因目标校验而取消释放尝试。
官方目标校验同时检查 HWND、PID、可执行文件与客户区位置，执行中变化会停止后续事件。
`InputAccess` 只读比较当前进程与前台进程的完整性级别；读取失败或目标级别更高就拒绝新输入，并再次确认前台未变化。
这些方法不会自动提权。官方另对“三角洲特调”的 Ctrl+V 模式要求管理员权限，否则仅复制房间码。
官方初始化采用 PerMonitorV2；坐标采集和输入换算必须使用一致的 DPI 坐标体系。

## FrameCode 0.3.1 修复与验证范围

鼠标移动已改为上述 `SendInput` 虚拟桌面绝对移动，移除本次报错所依赖的 `SetCursorPos` 路径。
同时统一位置记录与输入进程的每显示器 DPI 处理，保留窗口身份、矩形、坐标、紧急停止与释放保护。
PowerShell 返回底层异常原因，去掉“使用 10 个参数调用”的包装；不把单个 API 失败统一解释为窗口变化。
`SendInput` 被拒绝时显示 Win32 错误码并提示核对运行权限；没有自动提权，也没有复制官方完整性级别预检。

回归测试直接编译当前脚本内的 C#，仅替换 Win32 边界，不操作真实鼠标。旧实现复现 `Unable to move cursor`，修复后 11 项通过，覆盖绝对移动、多屏负原点、边缘、非法尺寸、系统拒绝、窗口/PID/矩形变化与紧急停止。
当前机器 125% 缩放下，自建 WinForms 窗口内的真实移动、粘贴按钮、加入按钮、剪贴板内容 `ABC123` 与窗口采集均已通过。
测试夹具也采用 DPI 一致的坐标，并显式显示窗口，避免隐藏 PowerShell 宿主压住首次显示；修复前后的实际窗口测试均确认了这一夹具条件。
本记录不声明游戏实测通过；实际游戏是否响应仍需现场确认。

## 官方启动权限与 FrameCode 0.3.2

官方 `As.exe` 的 `RT_MANIFEST #1` 明确要求 `requireAdministrator`、`uiAccess=false`：文件偏移 `0x1E851F0`，549 字节。
该文件 SHA-256 为 `031646ea270e322c34c46372e779e9d2c8c1cfd7be3a96e37d3894afbf1129bb`；REA 资源证据为 `ev_ee01eb3489609674ddbd55152da789bb5a3470080809e4cb3c33149f1ba30db8`。
官方 `LivePlayerHost.exe` 的清单为 `asInvoker`、`uiAccess=false`：文件偏移 `0x3A834`，490 字节。
其 SHA-256 为 `2caad6bd5e2a245009910578e4fbd07892bb4384958e12ebe2c7b3e42e2384a9`；REA 资源证据为 `ev_5faedb3722396e944d2430c8d39674b2084647c01211efe2b506ea0b87b94dd2`。
因此，官方主程序正常经 UAC 启动后，其子组件通常继承较高权限；这是清单与 Windows 继承规则支持的推断，并非本次运行观测。
“操作已发送”只表示输入事件提交成功，游戏未响应本身不能证明权限就是原因，也不能证明游戏接受了事件。
FrameCode 0.3.1 未做完整性预检；0.3.2 的修复方案是在记录目标和发送操作之前，通过 `GetTokenInformation(TokenIntegrityLevel=25)` 只读比较工具与目标的完整性级别。
读取失败或目标级别更高时，停止输入并提示核对权限、必要时由用户手动“以管理员身份运行”；不会自动提权。本节不声明游戏实测成功。

后续使用者现场反馈：以管理员身份运行 FrameCode、重新录点后，游戏已经可以自动粘贴。该结果支持此次无响应与启动权限差异相关；现场操作由使用者完成，未单独确认自动加入结果。

注：REA 成员检查证据 `ev_b64122187797c853f3ef6b0291d2dcabae19f1452469a57877881ef5b1104fd2` 因 64 MiB 元数据表示预算不可用；方法行为证据来自上述当前字节的独立 CIL 解码。静态分析没有执行官方组件或操作游戏。

## FrameCode 0.3.3 快速参数

操作设置新增“快速参数”（10 / 20 / 50 ms）及“稳妥参数”（30 / 45 / 80 ms）。点击只填入表单，保存后生效；升级保留已有参数。原生发送、权限核验、目标检查与按键释放保护不变。

双按钮模式的固定等待由 `2×(30+45)+80=230 ms` 降至 `2×(10+20)+50=110 ms`。在当前机器自建 WinForms 窗口中交替执行两档各 5 次，每次剪贴板内容不同，10 次均正确粘贴并加入；包含原生桥与 Windows 调度的实际耗时中位数分别为 278.3 ms 和 154.2 ms。测试由 `npm run test:native` 复现，没有游戏实测结论。

Ctrl+V 模式的固定等待按代码计算由 155 ms 降至 80 ms，本轮未新增真实键盘模式实测。快速档的短按住时间可能受游戏帧率影响，若出现漏点或粘贴未完成，可切回稳妥参数或手动调整。
