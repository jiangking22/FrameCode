const {app,BrowserWindow,ipcMain,dialog,clipboard,desktopCapturer,globalShortcut,nativeImage,session}=require('electron');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const {Confirmation,RULES}=require('../core/recognition.cjs');
const {cleanSettings}=require('../core/settings.cjs');
const {OcrEngine}=require('./ocr.cjs');const {InputBridge}=require('./input.cjs');const {MediaRelay}=require('./media.cjs');
const {writeVerified}=require('./clipboard.cjs');
const root=path.resolve(__dirname,'../..');
if(process.env.FRAMECODE_TEST_DATA)app.setPath('userData',process.env.FRAMECODE_TEST_DATA);
let win,settings={},settingsPath,relay,ocr,input,seq=0,active=false,busy=false,confirmed='',automatic=false,actionStop=new AbortController();
const confirmation=new Confirmation(),points={};
const send=event=>{if(win&&!win.isDestroyed())win.webContents.send('fc:event',event);};
function stop(){active=false;confirmation.stop();seq++;actionStop.abort();actionStop=new AbortController();send({type:'stopped'});}
function register(name,handler){ipcMain.handle('fc:'+name,async(event,...args)=>{
  if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('不允许的请求来源');
  return handler(...args);
});}
async function record(key){if(!['paste','join'].includes(key))throw new Error('未知位置');stop();points[key]=await input.record(process.pid);send({type:'point',key,point:points[key]});return points[key];}
function imageRgba(image){
  // Electron's Windows bitmap is BGRA; the worker protocol takes RGBA.
  const rgba=image.toBitmap();
  for(let i=0;i<rgba.length;i+=4){const blue=rgba[i];rgba[i]=rgba[i+2];rgba[i+2]=blue;}
  return rgba;
}
app.whenReady().then(async()=>{
  settingsPath=path.join(app.getPath('userData'),'settings.json');
  try{settings=cleanSettings(JSON.parse(fs.readFileSync(settingsPath,'utf8')));}catch{settings=cleanSettings({});}
  relay=new MediaRelay(root);await relay.start();ocr=new OcrEngine(root);input=new InputBridge(root);
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===win?.webContents&&permission==='media'));
  win=new BrowserWindow({width:1360,height:920,minWidth:960,minHeight:720,title:'帧码 · FrameCode',backgroundColor:'#f7f8fa',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
  register('init',()=>({settings,version:app.getVersion(),platform:process.platform}));
  register('save',async value=>{settings=cleanSettings(value);await fs.promises.mkdir(path.dirname(settingsPath),{recursive:true});await fs.promises.writeFile(settingsPath+'.tmp',JSON.stringify(settings,null,2));await fs.promises.rename(settingsPath+'.tmp',settingsPath);return settings;});
  register('demo',()=>{stop();relay.stop();return {url:pathToFileURL(path.join(root,'resources/demo.mp4')).href,format:'file',label:'本地演示 · ABC123',demo:true};});
  register('file',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'视频',extensions:['mp4','webm','flv','m3u8']}]});if(r.canceled)return null;stop();relay.stop();const file=r.filePaths[0];return {url:pathToFileURL(file).href,format:/\.flv$/i.test(file)?'flv':/\.m3u8$/i.test(file)?'hls':'file',label:path.basename(file)};});
  register('play',async(url,quality)=>{stop();return relay.resolve(url,['best','720p','540p','360p'].includes(quality)?quality:'best');});
  register('stop-media',()=>{stop();relay.stop();});
  register('sources',async()=>{stop();return (await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:300,height:170}})).filter(s=>!s.name.includes('FrameCode')).map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()}));});
  register('begin',async(rule,source='player')=>{
    stop();if(!Object.hasOwn(RULES,rule)||!['player','desktop'].includes(source))throw new Error('未知规则或识别来源');const id=seq;send({type:'status',message:'正在准备 OCR 组件…'});
    await ocr.ready();if(id!==seq)throw new Error('启动已取消');
    confirmation.start(rule,id,source==='desktop'?100:150);confirmed='';active=true;return {session:id};
  });
  register('stop',stop);
  register('auto',value=>{stop();automatic=value===true;return automatic;});
  register('record',record);
  register('copy',async()=>{if(!confirmed)throw new Error('尚无已确认房间码');const id=seq;await writeVerified(clipboard,confirmed,()=>id===seq);return true;});
  register('frame',async payload=>{
    if(!active||busy||payload?.session!==seq)return {ignored:true};
    if(!Number.isSafeInteger(payload.frame)||payload.frame<0||typeof payload.image!=='string'||payload.image.length>8_000_000||!/^data:image\/(png|jpeg);base64,/.test(payload.image))throw new Error('图像请求无效');
    const image=nativeImage.createFromDataURL(payload.image),size=image.getSize();
    if(image.isEmpty()||size.width>1280||size.width*size.height>8_000_000)throw new Error('选区过大，请缩小到房间码');
    const id=seq,at=performance.now();busy=true;
    try{
      const data=await ocr.recognize({width:size.width,height:size.height,rgba:imageRgba(image)},RULES[confirmation.rule]);
      if(id!==seq||!active)return {ignored:true};
      if(data.error)throw new Error(data.error);
      const result=confirmation.observe({session:id,frame:payload.frame,at,text:data.candidate||'',confidence:data.confidence});
      if(result.confirmed){
        await writeVerified(clipboard,result.code,()=>id===seq&&active);
        confirmed=result.code;active=false;send({type:'confirmed',code:confirmed});
        if(automatic){const signal=actionStop.signal;const mode=['delta','delta-1v1'].includes(confirmation.rule)?'keyboard':'buttons';
          input.execute(mode,points,settings.timing,signal).then(message=>{if(id===seq)send({type:'status',message});}).catch(error=>{if(id===seq)send({type:'status',message:error.message});});
        }
      }
      return {...result,candidate:data.candidate,raw:data.raw,confidence:data.confidence,passes:1,ms:Math.round(performance.now()-at)};
    }finally{busy=false;}
  });
  await win.loadFile(path.join(root,'src/ui/index.html'));
  const shortcuts={'Control+1':()=>send({type:'toggle'}),'Control+2':()=>record('paste').catch(e=>send({type:'status',message:e.message})),'Control+3':()=>record('join').catch(e=>send({type:'status',message:e.message})),'Control+Shift+Q':stop};
  for(const [key,fn] of Object.entries(shortcuts))if(!globalShortcut.register(key,fn))send({type:'status',message:`快捷键 ${key} 被占用，仍可使用界面按钮`});
  win.on('closed',()=>{stop();win=null;});
}).catch(error=>{console.error(error);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>{globalShortcut.unregisterAll();relay?.close();input?.close();void ocr?.close();});
