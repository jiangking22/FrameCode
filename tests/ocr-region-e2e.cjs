// Production crop/encoding/IPC parity against the installed official worker.
// Official rejection of a difficult image is preserved, never treated as a miss to fix.
const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const {InstalledWorkerOracle,installedRuntime,decodePng,decodeGdi}=require('./helpers/official-oracle.cjs');
const {requireFixture,requireFixtures}=require('./helpers/private-fixtures.cjs');

const root=path.resolve(__dirname,'..'),pattern='[A-Z]{3}[0-9]{3}';
const executableArg=process.argv.slice(2).find(arg=>!arg.startsWith('--'));
const executable=executableArg?path.resolve(executableArg):null;
const runName=(process.env.FRAMECODE_TEST_RUN||(executable?'packaged':'source')).replace(/[^a-z0-9_-]/gi,'-');
const output=path.join(root,'artifacts',`ocr-regions-${runName}`);
const samples=[
  {name:'complete-dialog',fixture:'valorant-room.png'},
  {name:'complete-dialog-075',fixture:'valorant-dialog-075.png'},
  {name:'complete-dialog-050',fixture:'valorant-dialog-050.png'},
  {name:'tight-code',fixture:'valorant-room.png',region:{x:214,y:208,w:96,h:38}},
  {name:'complete-field',fixture:'valorant-room.png',region:{x:44,y:196,w:438,h:64}},
  {name:'field-and-button',fixture:'valorant-room.png',region:{x:44,y:196,w:610,h:64}},
  {name:'user-screenshot-low-res',fixture:'valorant-user-room.png'}
];
const hash=filename=>crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');

(async()=>{
  requireFixtures(samples.map(sample=>sample.fixture));
  fs.mkdirSync(output,{recursive:true});
  const appRoot=executable?path.join(path.dirname(executable),'resources/app'):root;
  const report={createdAt:new Date().toISOString(),executable,installedRuntime,
    sourceHashes:Object.fromEntries(['src/main/app.cjs','src/main/ocr.cjs','src/core/recognition.cjs','src/ui/selection.js']
      .map(file=>[file,hash(path.join(appRoot,file))])),samples:[],pageErrors:[],ok:false};
  const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fc-ocr-regions-'))};
  delete env.ELECTRON_RUN_AS_NODE;
  const application=await electron.launch(executable?{executablePath:executable,args:[],env}:{args:[root],env});
  const oracle=new InstalledWorkerOracle();let previous;
  try{
    previous=await application.evaluate(({clipboard})=>clipboard.readText());
    const page=await application.firstWindow();page.on('pageerror',error=>report.pageErrors.push(error.message));
    await page.waitForSelector('#demo');
    await page.evaluate(async()=>{
      const {RegionSelection}=await import('./selection.js');
      window.regionRegression={crop:RegionSelection.prototype.crop,events:[]};
      window.framecode.onEvent(event=>{if(event.type==='confirmed')regionRegression.events.push(event);});
      await window.framecode.auto(false);
    });
    for(const sample of samples){
      const filename=requireFixture(sample.fixture),sentinel=`framecode-regression-${sample.name}`;
      await application.evaluate(({clipboard},text)=>clipboard.writeText(text),sentinel);
      const row={...sample,fixtureSha256:hash(filename),frames:[],events:[],error:null};report.samples.push(row);
      try{
        const crop=await page.evaluate(async({image,region})=>{
          const state=regionRegression,source=new Image();source.src=image;await source.decode();
          const surface=document.createElement('canvas');surface.width=source.width;surface.height=source.height;
          surface.getContext('2d').drawImage(source,0,0);
          const selection=region?{x:region.x/source.width,y:region.y/source.height,w:region.w/source.width,h:region.h/source.height}:{x:0,y:0,w:1,h:1};
          const canvas=document.createElement('canvas');
          if(!state.crop.call({surface,region:selection},canvas))throw new Error('Selection could not be cropped');
          const format=canvas.width*canvas.height<=400000?'image/png':'image/jpeg',encoded=canvas.toDataURL(format,.9);
          state.events=[];
          return {image:encoded,width:canvas.width,height:canvas.height,format};
        },{image:`data:image/png;base64,${fs.readFileSync(filename).toString('base64')}`,region:sample.region});
        const encodedBytes=Buffer.from(crop.image.split(',')[1],'base64');
        fs.writeFileSync(path.join(output,`${sample.name}.${crop.format==='image/png'?'png':'jpg'}`),encodedBytes);
        // JPEG must follow the official host's GDI+ decoder: Chromium differs by
        // occasional channel values, so its decoded pixels are not a valid oracle.
        const pixels=crop.format==='image/png'?decodePng(encodedBytes):decodeGdi(encodedBytes);
        assert.equal(pixels.width,crop.width);assert.equal(pixels.height,crop.height);
        row.input={width:crop.width,height:crop.height,format:crop.format,decoder:crop.format==='image/png'?'independent PNG':'official GDI+ Bitmap',rgbaSha256:crypto.createHash('sha256').update(pixels.rgba).digest('hex')};
        const session=await page.evaluate(async()=> (await window.framecode.begin('valorant')).session);
        for(let frame=1;frame<=4;frame++){
          const expected=await oracle.recognize(pixels,pattern);
          const result=await page.evaluate(payload=>window.framecode.frame(payload),{session,frame,image:crop.image,wide:crop.width/crop.height>=4});
          row.frames.push({frame,...result,expected:{raw:expected.raw,candidate:expected.candidate,confidence:expected.confidence}});
          assert.equal(result.raw,expected.raw,`${sample.name}: raw output must match official worker`);
          assert.equal(result.candidate,expected.candidate,`${sample.name}: candidate must match official worker`);
          assert.equal(result.confidence,expected.confidence,`${sample.name}: confidence must match official worker`);
          assert.equal(result.passes,1,'a frame must call the official engine once');
          assert.ok(!result.confirmed||frame>=2,'one frame must never confirm');
          const current=await application.evaluate(({clipboard})=>clipboard.readText());
          assert.equal(current,result.confirmed?expected.candidate:sentinel);
          if(result.confirmed){
            assert.equal(result.code,expected.candidate);assert.ok(expected.confidence>=80);
            assert.equal(row.frames.at(-2).code,result.code,'confirming frames must agree');
            const after=await page.evaluate(payload=>window.framecode.frame(payload),{session,frame:frame+1,image:crop.image,wide:crop.width/crop.height>=4});
            assert.equal(after.ignored,true,'confirmation ends the session');break;
          }
          await delay(170);
        }
        row.events=await page.evaluate(()=>regionRegression.events);
        row.clipboard=await application.evaluate(({clipboard})=>clipboard.readText());
        const confirmed=row.frames.at(-1)?.confirmed===true;
        assert.deepEqual(row.events,confirmed?[{type:'confirmed',code:row.frames.at(-1).code}]:[]);
        assert.equal(row.clipboard,confirmed?row.frames.at(-1).code:sentinel);
      }catch(error){row.error=error.message;}
      finally{await page.evaluate(()=>window.framecode.stop());}
      console.log(`${sample.name}: ${row.error?'FAIL':'PASS'} ${JSON.stringify(row.frames.map(({frame,candidate,confidence,confirmed})=>({frame,candidate,confidence,confirmed})))}`);
    }
    report.ok=report.samples.every(row=>!row.error)&&report.pageErrors.length===0;
    await page.screenshot({path:path.join(output,'workspace.png')});
    assert.deepEqual(report.pageErrors,[]);
    assert.equal(report.ok,true,report.samples.filter(row=>row.error).map(row=>row.error).join('\n'));
    console.log(`PASS: production selections match installed official OCR; report ${output}`);
  }finally{
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');oracle.close();
    if(previous!==undefined)await application.evaluate(({clipboard},text)=>clipboard.writeText(text),previous).catch(()=>{});
    await application.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
