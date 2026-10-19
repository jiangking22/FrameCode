// Replaces only the Win32 boundary; FrameInput.Click itself comes from native/input.ps1.
public sealed class InputResult {
 public string Name, Error;
 public int Down, Up, ClickX, ClickY, Moves, AbsoluteX, AbsoluteY;
 public int OpenHandles;
 public uint MovementFlags;
}
public static partial class FrameInput {
 static int desktopX,desktopY,desktopWidth,desktopHeight,cursorX,cursorY;
 static long foreground;
 static uint process;
 static RECT window;
 static bool allowMovement,emergency;
 static string scenario;
 static InputResult result;
 static readonly System.Collections.Generic.HashSet<IntPtr> handles=new System.Collections.Generic.HashSet<IntPtr>();

 static IntPtr OpenProcess(uint access,bool inherit,uint pid) {
  if(scenario=="own-integrity-unknown"&&pid==(uint)System.Diagnostics.Process.GetCurrentProcess().Id)return IntPtr.Zero;
  var handle=new IntPtr((long)pid+1000);handles.Add(handle);return handle;
 }
 static bool OpenProcessToken(IntPtr processHandle,uint access,out IntPtr token) {
  token=new IntPtr(processHandle.ToInt64()+100000);handles.Add(token);return true;
 }
 static bool GetTokenInformation(IntPtr token,int informationClass,IntPtr information,uint length,out uint required) {
  if(informationClass!=25)throw new Exception("Unexpected token information class: "+informationClass);
  required=32;
  bool own=token.ToInt64()-101000==System.Diagnostics.Process.GetCurrentProcess().Id;
  if(scenario=="target-integrity-unknown"&&!own)return false;
  if(information==IntPtr.Zero||length<required)return false;
  // TOKEN_MANDATORY_LABEL starts with SID_AND_ATTRIBUTES, followed by its SID.
  IntPtr sid=IntPtr.Add(information,16);
  Marshal.WriteIntPtr(information,sid);Marshal.WriteInt32(information,IntPtr.Size,0x20);
  for(int i=0;i<12;i++)Marshal.WriteByte(sid,i,0);
  Marshal.WriteByte(sid,0,1);Marshal.WriteByte(sid,1,1);Marshal.WriteByte(sid,7,16);
  int integrity=scenario=="target-higher-integrity"&&!own?0x3000:0x2000;
  Marshal.WriteInt32(sid,8,integrity);
  return true;
 }
 static IntPtr GetSidSubAuthorityCount(IntPtr sid) {return IntPtr.Add(sid,1);}
 static IntPtr GetSidSubAuthority(IntPtr sid,uint index) {return IntPtr.Add(sid,8+checked((int)index)*4);}
 static bool CloseHandle(IntPtr handle) {return handles.Remove(handle);}

 public static IntPtr GetForegroundWindow() {return new IntPtr(foreground);}
 public static bool GetCursorPos(out POINT point) {point=new POINT{X=cursorX,Y=cursorY};return true;}
 public static bool GetWindowRect(IntPtr hwnd,out RECT rect) {rect=window;return true;}
 public static uint GetWindowThreadProcessId(IntPtr hwnd,out uint processId) {processId=process;return 1;}
 static int GetSystemMetrics(int n) {
  switch(n) {case 0:return 1920;case 1:return 1080;case 76:return desktopX;case 77:return desktopY;case 78:return desktopWidth;case 79:return desktopHeight;default:throw new Exception("Unexpected system metric: "+n);}
 }
 static short GetAsyncKeyState(int key) {return emergency?(short)-32768:(short)0;}
 static bool SetCursorPos(int x,int y) {return false;}
 static IntPtr SetThreadDpiAwarenessContext(IntPtr context) {return new IntPtr(1);}
 static bool SetProcessDPIAware() {return true;}
 static uint SendInput(uint count,INPUT[] inputs,int size) {
  foreach(var input in inputs) {
   if(input.type!=0)throw new Exception("Unexpected keyboard input in click test");
   var mouse=input.data.mouse;
   if((mouse.flags&1)!=0) {
    if(!allowMovement)return 0;
    result.Moves++;result.AbsoluteX=mouse.dx;result.AbsoluteY=mouse.dy;result.MovementFlags=mouse.flags;
    if((mouse.flags&0x8000)!=0) {
     bool virtualDesktop=(mouse.flags&0x4000)!=0;
     int originX=virtualDesktop?desktopX:0,originY=virtualDesktop?desktopY:0;
     int width=virtualDesktop?desktopWidth:1920,height=virtualDesktop?desktopHeight:1080;
     cursorX=originX+(int)Math.Round(mouse.dx*(width-1)/65535.0);
     cursorY=originY+(int)Math.Round(mouse.dy*(height-1)/65535.0);
    } else {cursorX+=mouse.dx;cursorY+=mouse.dy;}
    if(scenario=="foreground-changed")foreground=88;
    if(scenario=="process-changed")process=100;
    if(scenario=="window-moved")window.L++;
    if(scenario=="emergency-stop")emergency=true;
   }
   if((mouse.flags&2)!=0) {result.Down++;result.ClickX=cursorX;result.ClickY=cursorY;}
   if((mouse.flags&4)!=0)result.Up++;
  }
  return count;
 }
 public static InputResult RunCase(string name) {
  scenario=name;result=new InputResult{Name=name};
  handles.Clear();
  desktopX=-1920;desktopY=-1080;desktopWidth=3840;desktopHeight=2160;
  foreground=77;process=99;allowMovement=true;emergency=false;cursorX=500;cursorY=500;
  int x=-720,y=-180;
  if(name=="top-left") {x=desktopX;y=desktopY;}
  if(name=="bottom-right") {x=desktopX+desktopWidth-1;y=desktopY+desktopHeight-1;}
  if(name=="single-pixel") {desktopWidth=1;desktopHeight=1;x=desktopX;y=desktopY;}
  if(name=="outside-desktop")x=desktopX-1;
  if(name=="movement-refused")allowMovement=false;
  if(name=="wrong-foreground")foreground=88;
  window=new RECT{L=desktopX,T=desktopY,R=desktopX+desktopWidth,B=desktopY+desktopHeight};
  if(name=="outside-window")window.L=x+1;
  try {Click(77,99,x,y,window.L,window.T,window.R,window.B,0,0);}
  catch(Exception error) {result.Error=error.GetBaseException().Message;}
  result.OpenHandles=handles.Count;
  return result;
 }
}
