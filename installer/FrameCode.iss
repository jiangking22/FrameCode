#define AppVersion GetEnv("FRAMECODE_APP_VERSION")
#define AppSourceDir GetEnv("FRAMECODE_APP_SOURCE_DIR")

[Setup]
AppId={{5CBB483A-AAC0-4887-B138-C3EF219B1615}
AppName=帧码 FrameCode
AppVersion={#AppVersion}
AppVerName=帧码 FrameCode {#AppVersion}
AppPublisher=FrameCode
AppPublisherURL=https://github.com/jiangking22/FrameCode
AppSupportURL=https://github.com/jiangking22/FrameCode/issues
DefaultDirName={autopf}\FrameCode
DisableDirPage=no
DefaultGroupName=帧码 FrameCode
OutputBaseFilename=FrameCode-{#AppVersion}-win32-x64-Setup
OutputDir={#SourcePath}\..\dist
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
CloseApplications=yes
RestartApplications=no
DisableProgramGroupPage=yes
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
LanguageDetectionMethod=uilanguage
UninstallDisplayName=帧码 FrameCode {#AppVersion}
UninstallDisplayIcon={app}\FrameCode.exe
VersionInfoDescription=帧码 FrameCode Windows 安装包
VersionInfoProductName=帧码 FrameCode
VersionInfoProductVersion={#AppVersion}
VersionInfoVersion={#AppVersion}.0
SetupLogging=yes

[Languages]
Name: "chinesesimplified"; MessagesFile: "ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "其他选项:"; Flags: unchecked

[Files]
Source: "{#AppSourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\帧码 FrameCode"; Filename: "{app}\FrameCode.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\帧码 FrameCode"; Filename: "{app}\FrameCode.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\FrameCode.exe"; Description: "启动帧码 FrameCode"; WorkingDir: "{app}"; Flags: postinstall nowait skipifsilent runasoriginaluser
