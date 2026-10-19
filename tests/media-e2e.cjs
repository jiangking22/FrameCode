const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const http=require('node:http');const {spawn}=require('node:child_process');
function command(file,args){
  return new Promise((resolve,reject)=>{const child=spawn(file,args,{windowsHide:true});let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${file} exited ${code}: ${stderr}`)));});
}
(async()=>{
 const root=path.resolve(__dirname,'..'),children=new Set();
 const hlsDir=fs.mkdtempSync(path.join(os.tmpdir(),'fc-hls-'));
 await command(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-i',path.join(root,'resources/demo.mp4'),'-c','copy','-f','hls','-hls_time','1','-hls_list_size','0',path.join(hlsDir,'index.m3u8')]);
 const server=http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.url==='/demo.mp4'){const file=path.join(root,'resources/demo.mp4');res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':fs.statSync(file).size});fs.createReadStream(file).pipe(res);return;}
  if(req.url.startsWith('/hls/')){const file=path.join(hlsDir,path.basename(req.url));if(!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':/\.m3u8$/.test(file)?'application/vnd.apple.mpegurl':'video/mp2t'});fs.createReadStream(file).pipe(res);return;}
  if(req.url!=='/live.flv'){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':'video/x-flv'});
  const child=spawn(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-re','-stream_loop','-1','-i',path.join(root,'resources/demo.mp4'),'-c','copy','-f','flv','pipe:1'],{windowsHide:true});children.add(child);child.stderr.resume();child.stdout.pipe(res);res.on('close',()=>{child.kill();children.delete(child);});
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fc-media-'))};delete env.ELECTRON_RUN_AS_NODE;
 const application=await electron.launch({args:[root],env});let previous;
 try{
  previous=await application.evaluate(({clipboard})=>clipboard.readText());
  const page=await application.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#demo');
  const scenarios=[
   {label:'http-flv-mse',mode:'standard',path:'/live.flv'},
   {label:'http-flv-webcodecs',mode:'low',path:'/live.flv',metrics:/解码队列/},
   {label:'direct-mp4',mode:'standard',path:'/demo.mp4'},
   {label:'hls',mode:'standard',path:'/hls/index.m3u8'}
  ];
  for(const scenario of scenarios){
   await page.selectOption('#mode',scenario.mode);await page.fill('#url',`http://127.0.0.1:${server.address().port}${scenario.path}`);await page.click('#play');
   await page.waitForFunction(()=>!document.getElementById('select-region').disabled,{},{timeout:20000});
   await page.click('#select-region');const rect=await page.locator('#surface').boundingBox();
   await page.mouse.move(rect.x+rect.width*.20,rect.y+rect.height*.40);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.80,rect.y+rect.height*.60,{steps:8});await page.mouse.up();
   await page.click('#recognize');await page.waitForFunction(()=>document.getElementById('code').textContent==='ABC123',{},{timeout:30000});
   assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'ABC123');
   await page.screenshot({path:path.join(root,`artifacts/${scenario.label}-stream.png`)});
   if(scenario.metrics)assert.match(await page.textContent('#play-metrics'),scenario.metrics);
   await page.click('#media-stop');
  }
  assert.deepEqual(errors,[]);console.log('PASS: HTTP-FLV MSE/WebCodecs + direct MP4 + HLS + real drag selection + OCR');
 }finally{
  if(previous!==undefined)await application.evaluate(({clipboard},t)=>clipboard.writeText(t),previous).catch(()=>{});
  await application.close();for(const child of children)child.kill();server.closeAllConnections();await new Promise(r=>server.close(r));fs.rmSync(hlsDir,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
