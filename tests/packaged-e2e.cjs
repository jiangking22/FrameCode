const {_electron:electron}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {loadGameFixture}=require('./helpers/private-fixtures.cjs');

const root=path.resolve(__dirname,'..');
const executable=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'dist/FrameCode-win32-x64/FrameCode.exe');
const packagedRoot=path.dirname(executable);
const appRoot=path.join(packagedRoot,'resources/app');
const streamlink=path.join(appRoot,'resources/streamlink/streamlink-8.6.2-1-py314-x86_64/bin/streamlink.exe');
const fixtureSource=path.join(root,'tests/capture-fixture.cs');
const captureFixture=path.join(root,'artifacts/capture-fixture.exe');
const valorantVideo=path.join(root,'artifacts/valorant-packaged.mp4');

function run(file,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{windowsHide:true});
    let stdout='',stderr='';
    child.stdout.on('data',chunk=>{stdout+=chunk;});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve({stdout,stderr}):reject(new Error(`${file} exited ${code}: ${stderr}`)));
  });
}
async function ensureCaptureFixture(){
  fs.mkdirSync(path.dirname(captureFixture),{recursive:true});
  if(fs.existsSync(captureFixture)&&fs.statSync(captureFixture).mtimeMs>=fs.statSync(fixtureSource).mtimeMs)return;
  await run(path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),[
    '/nologo','/target:winexe',`/out:${captureFixture}`,fixtureSource,
    '/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll'
  ]);
}

(async()=>{
  const gameFixture=loadGameFixture();
  assert.ok(fs.existsSync(executable),`未找到打包程序：${executable}`);
  await run(require('ffmpeg-static'),[
    '-hide_banner','-loglevel','error','-y','-loop','1',
    '-i',gameFixture.source,'-t','10','-r','30',
    '-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p',
    '-preset','ultrafast',valorantVideo
  ]);
  const version=await run(streamlink,['--version']);
  assert.match(version.stdout,/streamlink\s+8\.6\.2/i);
  await ensureCaptureFixture();

  const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'framecode-packaged-'))};
  delete env.ELECTRON_RUN_AS_NODE;
  const application=await electron.launch({executablePath:executable,args:[],env});
  let previous,captureWindow;
  try{
    previous=await application.evaluate(({clipboard})=>clipboard.readText());
    const page=await application.firstWindow();
    captureWindow=spawn(captureFixture,[],{windowsHide:false});
    await new Promise(resolve=>setTimeout(resolve,1800));
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('#demo');
    assert.equal(await page.locator('input[type="password"]').count(),0,'启动页不得包含密码或登录表单');
    assert.equal(await page.getByRole('button',{name:/^(登录|注册)/}).count(),0,'启动页不得包含登录或注册按钮');
    assert.equal(await page.locator('#demo').isVisible(),true,'主工作台必须立即可见');
    await page.screenshot({path:path.join(root,'artifacts/packaged-startup.png')});
    await page.click('#demo');
    await page.waitForFunction(()=>!document.getElementById('recognize').disabled,{},{timeout:20000});
    await page.click('#recognize');
    await page.waitForFunction(()=>document.getElementById('code').textContent==='ABC123',{},{timeout:30000});
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'ABC123');
    await page.screenshot({path:path.join(root,'artifacts/packaged-recognized.png')});
    await page.click('#media-stop');

    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},valorantVideo);
    await page.click('#open-file');
    await page.waitForFunction(()=>!document.getElementById('select-region').disabled,{},{timeout:15000});
    await page.click('#select-region');
    const box=await page.evaluate(()=>{
      const canvas=document.getElementById('surface'),rect=canvas.getBoundingClientRect();
      const scale=Math.min(rect.width/canvas.width,rect.height/canvas.height);
      return {x:rect.x+(rect.width-canvas.width*scale)/2,y:rect.y+(rect.height-canvas.height*scale)/2,scale};
    });
    await page.mouse.move(box.x+44*box.scale,box.y+196*box.scale);await page.mouse.down();
    await page.mouse.move(box.x+482*box.scale,box.y+260*box.scale);await page.mouse.up();
    await page.click('#recognize');
    await page.waitForFunction(expected=>document.getElementById('code').textContent===expected,gameFixture.expectedRoomCode,{timeout:15000});
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),gameFixture.expectedRoomCode);
    await page.screenshot({path:path.join(root,'artifacts/packaged-valorant.png')});
    await page.click('#media-stop');

    await page.selectOption('#source','desktop');
    await page.getByRole('button',{name:'Room Code Capture Test',exact:true}).click();
    await page.waitForFunction(()=>!document.getElementById('select-region').disabled,{},{timeout:15000});
    await page.screenshot({path:path.join(root,'artifacts/packaged-desktop.png')});
    let live=false;
    if(process.env.FRAMECODE_LIVE_URL){
      await page.selectOption('#source','player');
      await page.fill('#url',process.env.FRAMECODE_LIVE_URL);
      await page.click('#play');
      await page.waitForFunction(()=>!document.getElementById('select-region').disabled,{},{timeout:60000});
      await page.screenshot({path:path.join(root,'artifacts/packaged-live.png')});
      await page.click('#media-stop');
      live=true;
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({
      ok:true,
      executable,
      streamlink:'8.6.2',
      live,
      tests:['direct main workspace without login','packaged startup','offline OCR','Valorant full field OCR','clipboard readback','desktop window capture',...(live?['public live stream']:[])]
    }));
  }finally{
    captureWindow?.kill();
    if(previous!==undefined)await application.evaluate(({clipboard},text)=>clipboard.writeText(text),previous).catch(()=>{});
    await application.close();
  }
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
