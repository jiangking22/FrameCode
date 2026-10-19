$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class FrameInput {
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] struct MOUSE {public int dx,dy;public uint data,flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] struct KEY {public ushort key,scan;public uint flags,time;public UIntPtr extra;}
 [StructLayout(LayoutKind.Explicit)] struct DATA {[FieldOffset(0)] public MOUSE mouse;[FieldOffset(0)] public KEY key;}
 [StructLayout(LayoutKind.Sequential)] struct INPUT {public uint type;public DATA data;}
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint processId);
 [DllImport("user32.dll")] static extern int GetSystemMetrics(int n);
 [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint n, INPUT[] inputs,int size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,uint size,out uint needed);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
 [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 public static void Initialize() {
  // Recorded coordinates, window bounds and absolute input must use physical pixels.
  try {if(SetThreadDpiAwarenessContext(new IntPtr(-4))!=IntPtr.Zero)return;}
  catch(EntryPointNotFoundException) {}
  SetProcessDPIAware();
 }
 public static string Describe() {POINT p;RECT r;uint pid;var w=GetForegroundWindow();GetCursorPos(out p);GetWindowRect(w,out r);GetWindowThreadProcessId(w,out pid);return String.Join(",",w.ToInt64(),pid,p.X,p.Y,r.L,r.T,r.R,r.B);}
 public static bool Emergency() {return (GetAsyncKeyState(0x11)&0x8000)!=0&&(GetAsyncKeyState(0x10)&0x8000)!=0&&(GetAsyncKeyState(0x51)&0x8000)!=0;}
 static int? ReadIntegrity(uint pid) {
  IntPtr process=OpenProcess(0x1000,false,pid),token=IntPtr.Zero,buffer=IntPtr.Zero;
  if(process==IntPtr.Zero)return null;
  try {
   if(!OpenProcessToken(process,8,out token))return null;
   uint size;GetTokenInformation(token,25,IntPtr.Zero,0,out size);
   if(size==0||size>65536)return null;
   buffer=Marshal.AllocHGlobal((int)size);
   uint needed;if(!GetTokenInformation(token,25,buffer,size,out needed))return null;
   IntPtr sid=Marshal.ReadIntPtr(buffer);if(sid==IntPtr.Zero)return null;
   byte count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));
   return count==0?null:(int?)Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));
  } finally {
   if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);
   if(token!=IntPtr.Zero)CloseHandle(token);
   CloseHandle(process);
  }
 }
 public static void CheckAccess(uint pid) {
  int? own;using(var current=System.Diagnostics.Process.GetCurrentProcess())own=ReadIntegrity((uint)current.Id);
  int? target=ReadIntegrity(pid);
  if(!own.HasValue||!target.HasValue)throw new Exception("Input integrity could not be verified");
  if(target.Value>own.Value)throw new Exception("Target integrity higher: game 0x"+target.Value.ToString("X")+" tool 0x"+own.Value.ToString("X"));
 }
 static void Guard(long hwnd,uint pid,int left,int top,int right,int bottom) {
  uint actual;RECT r;var w=GetForegroundWindow();GetWindowThreadProcessId(w,out actual);GetWindowRect(w,out r);
  if(Emergency())throw new Exception("emergency stop pressed");
  if(w.ToInt64()!=hwnd)throw new Exception("foreground changed: expected "+hwnd+" actual "+w.ToInt64());
  if(actual!=pid)throw new Exception("process changed: expected "+pid+" actual "+actual);
  if(r.L!=left||r.T!=top||r.R!=right||r.B!=bottom)throw new Exception("window rect changed: expected "+left+","+top+","+right+","+bottom+" actual "+r.L+","+r.T+","+r.R+","+r.B);
  CheckAccess(pid);
  if(GetForegroundWindow()!=w)throw new Exception("foreground changed during permission check");
 }
 static void Send(INPUT input) {if(SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))!=1)throw new Exception("Windows refused input: "+Marshal.GetLastWin32Error());}
 static INPUT Mouse(uint flags,int x=0,int y=0) {return new INPUT{type=0,data=new DATA{mouse=new MOUSE{dx=x,dy=y,flags=flags}}};}
 static INPUT Key(ushort key,bool up) {return new INPUT{type=1,data=new DATA{key=new KEY{key=key,flags=up?2u:0u}}};}
 public static int Layout() {return Marshal.SizeOf(typeof(INPUT));}
 public static void Click(long hwnd,uint pid,int x,int y,int l,int t,int r,int b,int settle,int hold) {
  Guard(hwnd,pid,l,t,r,b);
  int vx=GetSystemMetrics(76),vy=GetSystemMetrics(77),width=GetSystemMetrics(78),height=GetSystemMetrics(79);
  if(width<=1||height<=1)throw new Exception("Invalid virtual desktop size");
  if(x<vx||y<vy||x>=vx+width||y>=vy+height||x<l||y<t||x>=r||y>=b)throw new Exception("Point outside target window");
  // Move across the virtual desktop: MOVE | ABSOLUTE | VIRTUALDESK.
  int nx=(int)Math.Round((x-vx)*65535.0/(width-1)),ny=(int)Math.Round((y-vy)*65535.0/(height-1));
  Send(Mouse(0xC001,nx,ny));Thread.Sleep(settle);Guard(hwnd,pid,l,t,r,b);
  try {Send(Mouse(2));Thread.Sleep(hold);} finally {Send(Mouse(4));}
 }
 public static void Paste(long hwnd,uint pid,int l,int t,int r,int b) {
  Guard(hwnd,pid,l,t,r,b);
  try {Send(Key(0x11,false));Send(Key(0x56,false));} finally {Send(Key(0x56,true));Send(Key(0x11,true));}
 }
}
'@
[FrameInput]::Initialize()
while ($line = [Console]::ReadLine()) {
 try {
  $q = $line | ConvertFrom-Json
  $value = $null
  switch ($q.command) {
   'layout' {$value=[FrameInput]::Layout()}
   'record' {$value=[FrameInput]::Describe()}
   'access' {[FrameInput]::CheckAccess([uint32]$q.pid);$value='allowed'}
   'click' {[FrameInput]::Click([long]$q.hwnd,[uint32]$q.pid,[int]$q.x,[int]$q.y,[int]$q.l,[int]$q.t,[int]$q.r,[int]$q.b,[int]$q.settle,[int]$q.hold);$value='sent'}
   'paste' {[FrameInput]::Paste([long]$q.hwnd,[uint32]$q.pid,[int]$q.l,[int]$q.t,[int]$q.r,[int]$q.b);$value='sent'}
   default {throw 'Unknown command'}
  }
  @{id=$q.id;ok=$true;value=$value} | ConvertTo-Json -Compress | ForEach-Object {[Console]::WriteLine($_)}
 } catch { @{id=$q.id;ok=$false;error=$_.Exception.GetBaseException().Message} | ConvertTo-Json -Compress | ForEach-Object {[Console]::WriteLine($_)} }
}

