const {spawn}=require('node:child_process');const {createInterface}=require('node:readline');const path=require('node:path');const assert=require('node:assert/strict');const {_electron:electron}=require('playwright');const fs=require('node:fs');const os=require('node:os');const {performance}=require('node:perf_hooks');
(async()=>{
 const root=path.resolve(__dirname,'..'),executable=process.argv[2]?path.resolve(process.argv[2]):null;
 const appRoot=executable?path.join(path.dirname(executable),'resources/app'):root;
 const {InputBridge}=require(path.join(appRoot,'src/main/input.cjs'));
 const bridge=new InputBridge(appRoot);await bridge.request('layout');
 const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fc-native-'))};delete env.ELECTRON_RUN_AS_NODE;
 const application=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[root],env});let previous,child;
 try{
  previous=await application.evaluate(({clipboard})=>clipboard.readText());
  child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(root,'tests/input-fixture.ps1')],{windowsHide:true});child.stderr.on('data',b=>process.stderr.write(b));
  let readyResolve,readyReject,joinedResolve;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});const lines=createInterface({input:child.stdout});lines.on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}if(data.type==='ready')readyResolve(data);if(data.type==='focus-failed')readyReject(new Error('test window could not become foreground'));if(data.type==='joined')joinedResolve?.(data);});
  const fixture=await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('fixture timeout')),15000).unref())]);
  // Use actual Win32 coordinates under the current DPI, not logical Form.Bounds.
  const bounds=String(await bridge.request('record')).split(',').map(Number);
  assert.equal(bounds[0],fixture.hwnd,'fixture must be foreground');
  const target={hwnd:bounds[0],pid:bounds[1],l:bounds[4],t:bounds[5],r:bounds[6],b:bounds[7]};
  const profiles=[{name:'stable',timing:{settle:30,hold:45,gap:80}},{name:'fast',timing:{settle:10,hold:20,gap:50}}];
  const durations={stable:[],fast:[]};
  for(let round=0;round<5;round++)for(const profile of profiles){
   // Every paste must replace the previous sample, so a missed click cannot pass.
   const expected=`ROOM-${profile.name}-${round+1}`;
   await application.evaluate(({clipboard},text)=>clipboard.writeText(text),expected);
   const joined=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{joinedResolve=undefined;reject(new Error(`${profile.name} sample ${round+1}: join not received`));},3000).unref();
    joinedResolve=data=>{clearTimeout(timer);joinedResolve=undefined;resolve(data);};
   });
   const start=performance.now();
   const [,result]=await Promise.all([bridge.execute('buttons',{paste:{...target,...fixture.paste},join:{...target,...fixture.join}},profile.timing,new AbortController().signal),joined]);
   durations[profile.name].push(performance.now()-start);
   assert.equal(result.text,expected,`${profile.name} sample ${round+1}: pasted room code`);
  }
  for(const profile of profiles){
   const sorted=durations[profile.name].toSorted((a,b)=>a-b);
   console.log(`${profile.name}: median ${sorted[Math.floor(sorted.length/2)].toFixed(1)} ms; ${sorted.length}/${sorted.length} correct joins (${profile.timing.settle}/${profile.timing.hold}/${profile.timing.gap} ms)`);
  }
  const page=await application.firstWindow();await page.selectOption('#source','desktop');
  await page.getByRole('button',{name:'Room Code Test',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('select-region').disabled,{},{timeout:10000});
  await page.screenshot({path:path.join(root,'artifacts/desktop-capture.png')});
  console.log('PASS: repeated stable/fast guarded SendInput paste/join in isolated target + desktop window capture');
 }finally{child?.kill();bridge.close();if(previous!==undefined)await application.evaluate(({clipboard},t)=>clipboard.writeText(t),previous).catch(()=>{});await application.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

