const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

(async()=>{
 const root=path.resolve(__dirname,'..'),executable=process.argv[2]?path.resolve(process.argv[2]):null;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'framecode-settings-'));
 const settingsPath=path.join(directory,'settings.json');
 const custom={settle:60,hold:75,gap:160},fast={settle:10,hold:20,gap:50},stable={settle:30,hold:45,gap:80};
 fs.writeFileSync(settingsPath,JSON.stringify({rule:'delta',timing:custom}));
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
 const env={...process.env,FRAMECODE_TEST_DATA:directory};delete env.ELECTRON_RUN_AS_NODE;
 const errors=[];let application,page;
 async function launch(){
  application=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[root],env});
  page=await application.firstWindow();page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.click('#settings-open');
 }
 async function values(){return page.locator('#settings-form input').evaluateAll(inputs=>Object.fromEntries(inputs.map(input=>[input.id,Number(input.value)])));}
 const saved=()=>JSON.parse(fs.readFileSync(settingsPath,'utf8'));
 const save=async()=>{await page.click('#settings-form button[type=submit]');await page.waitForFunction(()=>!document.getElementById('settings-dialog').open);};
 try{
  await launch();assert.deepEqual(await values(),custom,'existing custom timing must survive startup');
  await page.locator('#settings-dialog').screenshot({path:path.join(root,'artifacts/settings-before.png')});
  await page.getByRole('button',{name:'快速参数',exact:true}).click();
  assert.deepEqual(await values(),fast);assert.deepEqual(saved().timing,custom,'preset must not save automatically');
  assert.equal(await page.locator('#settings-dialog').evaluate(dialog=>dialog.open),true,'preset must not submit the form');
  await page.click('#settings-close');await page.click('#settings-open');
  assert.deepEqual(await values(),custom,'closing without saving must discard the draft');
  await page.getByRole('button',{name:'快速参数',exact:true}).click();
  await page.locator('#settings-dialog').screenshot({path:path.join(root,'artifacts/settings-fast.png')});
  await save();assert.deepEqual(saved().timing,fast);assert.equal(saved().rule,'delta');
  await application.close();application=null;await launch();
  assert.deepEqual(await values(),fast,'fast timing must survive restart');
  await page.getByRole('button',{name:'稳妥参数',exact:true}).click();assert.deepEqual(await values(),stable);
  await save();assert.deepEqual(saved().timing,stable);
  await page.click('#settings-open');
  for(const [key,value] of Object.entries(custom))await page.fill('#'+key,String(value));
  await save();assert.deepEqual(saved().timing,custom,'manual timing must remain adjustable');
  await page.click('#settings-open');
  await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(960,720));
  await page.locator('#settings-dialog').screenshot({path:path.join(root,'artifacts/settings-compact.png')});
  const bounds=await page.locator('#settings-dialog').boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'dialog must fit the minimum window size');
  assert.deepEqual(errors,[]);
  console.log('PASS: fast/stable presets, explicit save, cancel, restart, custom values, compact layout, no renderer errors');
 }finally{await application?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
