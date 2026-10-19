const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {loadGameFixture}=require('./helpers/private-fixtures.cjs');
(async()=>{
 const gameFixture=loadGameFixture();
 const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 const gameVideo=path.join(root,'artifacts/valorant-room.mp4');
 execFileSync(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-y','-loop','1','-i',gameFixture.source,'-t','10','-r','30','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p','-preset','ultrafast',gameVideo],{windowsHide:true});
 const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'framecode-e2e-'))};delete env.ELECTRON_RUN_AS_NODE;
 const application=await electron.launch({args:[root],env});application.process().stderr.on('data',b=>process.stderr.write(b));
 let clipboardBefore;
 try{
  clipboardBefore=await application.evaluate(({clipboard})=>clipboard.readText());
  const page=await application.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('#demo');await page.click('#demo');
  await page.waitForFunction(()=>!document.getElementById('recognize').disabled,{},{timeout:15000});
  await page.screenshot({path:path.join(root,'artifacts/ready.png')});
  await page.click('#recognize');
  try{await page.waitForFunction(()=>document.getElementById('code').textContent==='ABC123',{},{timeout:30000});}catch(error){await page.screenshot({path:path.join(root,'artifacts/failure.png')});console.log(await page.locator('body').innerText());throw error;}
  assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'ABC123');
  await page.screenshot({path:path.join(root,'artifacts/recognized.png')});
  await page.click('#rule');await page.selectOption('#rule','delta');
  await page.click('#recognize');await page.waitForTimeout(1800);
  assert.notEqual(await page.textContent('#code'),'ABC123','wrong rule must not confirm');
  await page.click('#recognize');await page.waitForTimeout(600);
  assert.match(await page.textContent('#recognize'),/开始识别/);
  await page.selectOption('#rule','valorant');
  await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},gameVideo);
  await page.click('#open-file');
  await page.waitForFunction(()=>!document.getElementById('select-region').disabled);
  await page.click('#select-region');
  const box=await page.evaluate(()=>{
    const canvas=document.getElementById('surface'),rect=canvas.getBoundingClientRect();
    const scale=Math.min(rect.width/canvas.width,rect.height/canvas.height);
    return {x:rect.x+(rect.width-canvas.width*scale)/2,y:rect.y+(rect.height-canvas.height*scale)/2,scale};
  });
  // Exercise the official worker with the complete room-code input field.
  await page.mouse.move(box.x+44*box.scale,box.y+196*box.scale);await page.mouse.down();
  await page.mouse.move(box.x+482*box.scale,box.y+260*box.scale);await page.mouse.up();
  await page.click('#recognize');
  await page.waitForFunction(expected=>document.getElementById('code').textContent===expected,gameFixture.expectedRoomCode,{timeout:15000});
  assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),gameFixture.expectedRoomCode);
  await page.screenshot({path:path.join(root,'artifacts/valorant-recognized.png')});
  await page.click('#settings-open');await page.fill('#gap','120');await page.click('#settings-form button[type=submit]');
  await page.click('#media-stop');assert.equal(await page.isDisabled('#recognize'),true);
  assert.equal(await page.textContent('#code'),'— — —');assert.equal(await page.isDisabled('#copy'),true);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,tests:['real OCR on video','clipboard readback','wrong rule rejected','stop','Valorant full field video','settings','media shutdown'],errors}));
 }finally{
  if(clipboardBefore!==undefined)await application.evaluate(({clipboard},text)=>clipboard.writeText(text),clipboardBefore).catch(()=>{});
  await application.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
