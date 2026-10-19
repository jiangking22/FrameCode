$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class WinFocus {
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
 [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint attach, uint attachTo, bool value);
}
"@
# Match the helper's physical coordinates on scaled Windows displays.
[void][WinFocus]::SetThreadDpiAwarenessContext([IntPtr](-4))
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding
$form=New-Object Windows.Forms.Form
$form.Text='Room Code Test'
$form.Size=New-Object Drawing.Size(680,500)
$form.StartPosition='CenterScreen'
$form.TopMost=$true
$label=New-Object Windows.Forms.Label
$label.Text='ABC123';$label.Font=New-Object Drawing.Font('Consolas',64,[Drawing.FontStyle]::Bold)
$label.Location=New-Object Drawing.Point(35,45);$label.Size=New-Object Drawing.Size(580,130)
$box=New-Object Windows.Forms.TextBox
$box.Location=New-Object Drawing.Point(40,215);$box.Size=New-Object Drawing.Size(570,35)
$paste=New-Object Windows.Forms.Button
$paste.Text='Paste';$paste.Location=New-Object Drawing.Point(40,280);$paste.Size=New-Object Drawing.Size(240,65)
$join=New-Object Windows.Forms.Button
$join.Text='Join';$join.Location=New-Object Drawing.Point(360,280);$join.Size=New-Object Drawing.Size(240,65)
$paste.Add_Click({$box.Text=[Windows.Forms.Clipboard]::GetText()})
$join.Add_Click({[Console]::WriteLine((@{type='joined';text=$box.Text}|ConvertTo-Json -Compress))})
$form.Controls.AddRange(@($label,$box,$paste,$join))
$focusDeadline=[DateTime]::UtcNow.AddSeconds(15)
$focusTimer=New-Object Windows.Forms.Timer
$focusTimer.Interval=80
$focusTimer.Add_Tick({
 if([DateTime]::UtcNow -ge $focusDeadline -or [WinFocus]::GetForegroundWindow() -eq $form.Handle){return}
 $dummy=[uint32]0;$fgThread=[WinFocus]::GetWindowThreadProcessId([WinFocus]::GetForegroundWindow(),[ref]$dummy);$myThread=[WinFocus]::GetCurrentThreadId()
 [void][WinFocus]::AttachThreadInput($myThread,$fgThread,$true)
 try{[void][WinFocus]::SetForegroundWindow($form.Handle);$form.Activate()}finally{[void][WinFocus]::AttachThreadInput($myThread,$fgThread,$false)}
})
$form.Add_Shown({
 # The hidden PowerShell host can suppress the first native ShowWindow call.
 [void][WinFocus]::ShowWindow($form.Handle,5)
 [void][WinFocus]::BringWindowToTop($form.Handle)
 $form.Activate();$box.Focus()
 $deadline=[DateTime]::UtcNow.AddSeconds(5)
 while([DateTime]::UtcNow -lt $deadline -and [WinFocus]::GetForegroundWindow() -ne $form.Handle){
  $dummy=[uint32]0;$fgThread=[WinFocus]::GetWindowThreadProcessId([WinFocus]::GetForegroundWindow(),[ref]$dummy);$myThread=[WinFocus]::GetCurrentThreadId();[void][WinFocus]::AttachThreadInput($myThread,$fgThread,$true);try{[void][WinFocus]::ShowWindow($form.Handle,9);[void][WinFocus]::BringWindowToTop($form.Handle);[void][WinFocus]::SetForegroundWindow($form.Handle);$form.Activate()}finally{[void][WinFocus]::AttachThreadInput($myThread,$fgThread,$false)};Start-Sleep -Milliseconds 30
 }
 if([WinFocus]::GetForegroundWindow() -ne $form.Handle){[Console]::WriteLine((@{type='focus-failed'}|ConvertTo-Json -Compress));return}
 $focusTimer.Start()
 $p=$paste.PointToScreen((New-Object Drawing.Point(120,32)));$j=$join.PointToScreen((New-Object Drawing.Point(120,32)));$r=$form.Bounds
 [Console]::WriteLine((@{type='ready';hwnd=$form.Handle.ToInt64();pid=$PID;paste=@{x=$p.X;y=$p.Y};join=@{x=$j.X;y=$j.Y};l=$r.Left;t=$r.Top;r=$r.Right;b=$r.Bottom}|ConvertTo-Json -Compress))
})
[Windows.Forms.Application]::Run($form)

