const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const cases=['cursor-api-refused','top-left','bottom-right','single-pixel','movement-refused','foreground-changed','process-changed','window-moved','emergency-stop','wrong-foreground','outside-desktop','outside-window','target-higher-integrity','own-integrity-unknown','target-integrity-unknown','equal-integrity'];
let results;
before(()=>{
 const script=fs.readFileSync(path.join(__dirname,'../native/input.ps1'),'utf8');
 const embedded=script.match(/Add-Type -TypeDefinition @'\r?\n([\s\S]*?)\r?\n'@/);
 assert.ok(embedded,'native bridge must contain the actual FrameInput C# source');
 let native=embedded[1].replace('public static class FrameInput','public static partial class FrameInput');
 // Remove every native import so the test can never move the real cursor or click.
 native=native.replace(/\[DllImport\([^\r\n]*?\)\]\s*(?:public\s+)?static extern [^;]+;/g,'');
 assert.doesNotMatch(native,/DllImport|extern/,'all desktop API imports must be replaced');
 const fake=fs.readFileSync(path.join(__dirname,'helpers/input-win32-fake.cs'),'utf8');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'framecode-input-test-'));
 try {
  fs.writeFileSync(path.join(directory,'input.cs'),native+'\n'+fake);
  const harness="$ErrorActionPreference = 'Stop'\nAdd-Type -Path (Join-Path $PSScriptRoot 'input.cs')\n"+
   cases.map(name=>`[FrameInput]::RunCase('${name}') | ConvertTo-Json -Compress`).join('\n');
  const harnessPath=path.join(directory,'run.ps1');fs.writeFileSync(harnessPath,harness);
  const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
  const output=execFileSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',harnessPath],{encoding:'utf8',windowsHide:true,timeout:20000});
  results=Object.fromEntries(output.trim().split(/\r?\n/).map(line=>{const value=JSON.parse(line);return [value.Name,value];}));
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

function assertClick(name,x,y) {
 const result=results[name];
 assert.equal(result.Error,null,'click must succeed even when SetCursorPos is refused');
 assert.equal(result.Moves,1);assert.equal(result.MovementFlags,0xC001,'movement must use absolute virtual desktop coordinates');
 assert.equal(result.Down,1);assert.equal(result.Up,1);
 assert.equal(result.ClickX,x);assert.equal(result.ClickY,y);
 return result;
}
test('native click works when SetCursorPos fails but SendInput permits movement',()=>{assertClick('cursor-api-refused',-720,-180);});
test('absolute mouse coordinates include both edges of a desktop with negative monitor origins',()=>{
 const first=assertClick('top-left',-1920,-1080),last=assertClick('bottom-right',1919,1079);
 assert.equal(first.AbsoluteX,0);assert.equal(first.AbsoluteY,0);
 assert.equal(last.AbsoluteX,65535);assert.equal(last.AbsoluteY,65535);
});
test('invalid virtual desktop dimensions are refused before movement or buttons',()=>{
 const result=results['single-pixel'];assert.match(result.Error,/virtual desktop/i);
 assert.equal(result.Moves,0);assert.equal(result.Down,0);assert.equal(result.Up,0);
});
for(const [name,error] of [
 ['movement-refused',/Windows refused input/],
 ['foreground-changed',/foreground changed/],
 ['process-changed',/process changed/],
 ['window-moved',/window rect changed/],
 ['emergency-stop',/emergency stop/]
])test(`native click delivers no mouse buttons after ${name}`,()=>{
 const result=results[name];assert.match(result.Error,error);
 assert.equal(result.Down,0);assert.equal(result.Up,0);
});
for(const [name,error] of [
 ['wrong-foreground',/foreground changed/],
 ['outside-desktop',/outside target window/],
 ['outside-window',/outside target window/]
])test(`native click rejects ${name} before delivering any movement or buttons`,()=>{
 const result=results[name];assert.match(result.Error,error);
 assert.equal(result.Moves,0);assert.equal(result.Down,0);assert.equal(result.Up,0);
});
for(const name of ['target-higher-integrity','own-integrity-unknown','target-integrity-unknown'])test(`native click rejects ${name} before delivering any input`,()=>{
 const result=results[name];assert.match(result.Error,/integrity|access|权限/i);
 assert.equal(result.Moves,0);assert.equal(result.Down,0);assert.equal(result.Up,0);
 assert.equal(result.OpenHandles,0,'integrity checks must release process and token handles on failure');
});
test('native click proceeds when current and target processes have equal integrity levels',()=>{
 const result=assertClick('equal-integrity',-720,-180);
 assert.equal(result.OpenHandles,0,'integrity checks must release process and token handles after success');
});
