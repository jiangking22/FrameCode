const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {requireFixture}=require('./helpers/private-fixtures.cjs');

async function waitForSaved(settingsPath,predicate){
  for(let attempt=0;attempt<100;attempt++){
    try{
      const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
      if(predicate(settings))return settings;
    }catch{}
    await delay(30);
  }
  throw new Error('Timed out waiting for saved preset settings');
}

(async()=>{
  const gameFixture=requireFixture('valorant-room.png');
  const root=path.resolve(__dirname,'..');
  const dataPath=fs.mkdtempSync(path.join(os.tmpdir(),'fc-presets-'));
  const settingsPath=path.join(dataPath,'settings.json');
  const video=path.join(root,'artifacts/valorant-presets.mp4');
  execFileSync(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-y','-loop','1',
    '-i',gameFixture,'-t','10','-r','30',
    '-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-pix_fmt','yuv420p',
    '-preset','ultrafast',video],{windowsHide:true});
  const env={...process.env,FRAMECODE_TEST_DATA:dataPath};delete env.ELECTRON_RUN_AS_NODE;
  const application=await electron.launch({args:[root],env});
  try{
    const page=await application.firstWindow();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('#demo');
    await page.click('#demo');
    await page.waitForFunction(()=>!document.getElementById('presets-open').disabled);
    await page.click('#presets-open');
    assert.equal(await page.locator('.preset-item').count(),1);
    assert.match(await page.locator('.preset-item').innerText(),/hanghang/);
    assert.equal(await page.locator('.preset-item input').nth(0).isChecked(),true);
    assert.equal(await page.locator('.preset-item input').nth(1).isChecked(),true);

    await page.fill('#preset-name','自定义区域');
    await page.click('#preset-form button[type=submit]');
    assert.equal(await page.locator('.preset-item').count(),2);
    const custom=page.locator('.preset-item').filter({hasText:'自定义区域'});
    assert.equal(await custom.locator('input').nth(0).isChecked(),false);
    assert.equal(await custom.locator('input').nth(1).isChecked(),true);
    await page.locator('.preset-item').filter({hasText:'hanghang'}).locator('input').nth(0).uncheck();
    await custom.locator('input').nth(0).check();
    await waitForSaved(settingsPath,settings=>{
      const own=settings.presets.find(preset=>preset.name==='自定义区域');
      const base=settings.presets.find(preset=>preset.name==='hanghang');
      return own?.autoApply===true&&base?.autoApply===false;
    });
    await page.click('#presets-close');

    await application.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},video);
    await page.click('#open-file');
    await page.waitForFunction(()=>!document.getElementById('select-region').disabled);
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('已自动应用区域预设「自定义区域」'));
    await page.waitForFunction(()=>document.querySelectorAll('.reference-box').length===2);

    await page.click('#presets-open');
    await page.screenshot({path:path.join(root,'artifacts/presets.png')});
    const defaultRow=page.locator('.preset-item').filter({hasText:'hanghang'});
    await defaultRow.getByRole('button',{name:'应用'}).click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('已应用区域预设「hanghang」'));
    await defaultRow.locator('input').nth(1).uncheck();
    await page.waitForFunction(()=>document.querySelectorAll('.reference-box').length===1);
    await page.click('#presets-close');

    const saved=await waitForSaved(settingsPath,settings=>
      settings.presets?.find(preset=>preset.name==='hanghang')?.showReference===false);
    assert.equal(saved.presets.find(preset=>preset.name==='hanghang').showReference,false);
    assert.equal(saved.presets.find(preset=>preset.name==='自定义区域').autoApply,true);
    assert.deepEqual(errors,[]);
    console.log('PASS: preset save, auto-apply, manual apply, reference overlay and persistence');
  }finally{await application.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
