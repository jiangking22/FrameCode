const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const expectedVersion='v'+require('../package.json').version;

const [executable,artifactsArgument]=process.argv.slice(2);
if(!executable||!artifactsArgument)throw new Error('Usage: node scripts/smoke-installed.cjs <installed FrameCode.exe> <test artifacts directory>');
const artifacts=path.resolve(artifactsArgument);
fs.mkdirSync(path.join(artifacts,'user-data'),{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const child=spawn(executable,['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1'],{
  windowsHide:true,
  env:{...process.env,FRAMECODE_TEST_DATA:path.join(artifacts,'user-data')},
  stdio:['ignore','ignore','pipe']
});
let stderr='',socket,sequence=0;
const pending=new Map(),errors=[];
child.stderr.on('data',chunk=>{stderr+=chunk;});
async function until(fn,message){
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){const value=await fn();if(value)return value;await delay(200);}
  throw new Error(`${message}\n${stderr.slice(-3000)}`);
}
function send(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout: ${method}`));},30000);
    pending.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
(async()=>{
  const endpoint=await until(()=>stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1],'Installed application did not start');
  const port=new URL(endpoint).port;
  const target=await until(async()=>{
    const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    return targets.find(t=>t.type==='page'&&t.url.startsWith('file:'));
  },'Main window did not load');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{
    const r=JSON.parse(event.data);
    if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);
    const p=pending.get(r.id);if(!p)return;
    clearTimeout(p.timer);pending.delete(r.id);
    if(r.error)p.reject(new Error(JSON.stringify(r.error)));else p.resolve(r.result);
  };
  await send('Runtime.enable');
  await until(()=>evaluate(`document.querySelector(".version")?.textContent === ${JSON.stringify(expectedVersion)}`),'Installed version did not initialize');
  await evaluate('document.getElementById("demo").click()');
  await until(()=>evaluate('!document.getElementById("recognize").disabled'),'Demo video did not become ready');
  await evaluate('document.getElementById("recognize").click()');
  await until(()=>evaluate('document.getElementById("code").textContent === "ABC123"'),'Offline demo OCR did not confirm ABC123');
  const result=await evaluate('({version:document.querySelector(".version").textContent,code:document.getElementById("code").textContent,status:document.getElementById("status").textContent,frames:document.getElementById("frames").textContent,ocr:document.getElementById("ocr-time").textContent})');
  assert.equal(result.code,'ABC123');
  assert.deepEqual(errors,[],'Renderer exceptions detected');
  const screenshot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(artifacts,'installed-demo.png'),Buffer.from(screenshot.data,'base64'));
  fs.writeFileSync(path.join(artifacts,'result.json'),JSON.stringify({passed:true,...result,rendererErrors:errors},null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket?.readyState===WebSocket.OPEN)await send('Page.close').catch(()=>{});
  socket?.close();
  await delay(500);
  child.kill();
  for(const p of pending.values())clearTimeout(p.timer);
});
