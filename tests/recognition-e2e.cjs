const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {setTimeout:delay}=require('node:timers/promises');

(async()=>{
  const root=path.resolve(__dirname,'..');
  const env={...process.env,FRAMECODE_TEST_DATA:fs.mkdtempSync(path.join(os.tmpdir(),'fc-recognition-'))};
  delete env.ELECTRON_RUN_AS_NODE;
  const application=await electron.launch({args:[root],env});
  let previous;
  try{
    previous=await application.evaluate(({clipboard})=>clipboard.readText());
    await application.evaluate(({clipboard},root)=>{
      clipboard.writeText('framecode-test-unchanged');
      const {OcrEngine}=process.mainModule.require(root+'/src/main/ocr.cjs');
      globalThis.ocrTest={calls:0,pending:null,inputs:[]};
      // Hold unmodified official observations at the OCR boundary.
      OcrEngine.prototype.recognize=function(image,pattern){
        ocrTest.calls++;ocrTest.inputs.push({width:image.width,height:image.height,bytes:image.rgba.length,pattern});
        return new Promise(resolve=>{ocrTest.pending=resolve;});
      };
    },root);
    const page=await application.firstWindow(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.waitForSelector('#demo');
    const cropChecks=await page.evaluate(async()=>{
      const {RegionSelection}=await import('./selection.js');
      const surface=document.createElement('canvas');surface.width=100;surface.height=50;
      const context=surface.getContext('2d');context.fillStyle='#19242c';context.fillRect(0,0,100,50);
      const target=document.createElement('canvas');
      RegionSelection.prototype.crop.call({surface,region:{x:.8,y:.8,w:.2,h:.2}},target);
      const pixels=target.getContext('2d').getImageData(0,0,target.width,target.height).data;
      const small={width:target.width,height:target.height,pixel:[...pixels.slice(0,4)]};
      surface.width=3840;surface.height=2160;
      RegionSelection.prototype.crop.call({surface,region:{x:0,y:0,w:1,h:1}},target);
      const large={width:target.width,height:target.height};
      surface.width=500;surface.height=1500;
      RegionSelection.prototype.crop.call({surface,region:{x:0,y:0,w:1,h:1}},target);
      const tall={width:target.width,height:target.height};
      window.confirmationEvents=[];
      window.framecode.onEvent(event=>{if(event.type==='confirmed')confirmationEvents.push(event);});
      return {small,large,tall};
    });
    assert.deepEqual(cropChecks,{small:{width:20,height:10,pixel:[25,36,44,255]},large:{width:1280,height:720},tall:{width:500,height:1500}});
    await page.click('#demo');
    await page.waitForFunction(()=>!document.getElementById('recognize').disabled);
    async function pending(expected){
      for(let attempt=0;attempt<500;attempt++){
        const state=await application.evaluate(()=>({calls:ocrTest.calls,pending:!!ocrTest.pending}));
        if(state.pending&&state.calls===expected)return;
        assert.ok(state.calls<=expected,'a frame must not start a second OCR pass');
        await delay(20);
      }
      throw new Error(`Timed out waiting for OCR call ${expected}`);
    }
    const reply=(candidate=null,confidence=0,raw='')=>application.evaluate((_,data)=>{
      const resolve=ocrTest.pending;ocrTest.pending=null;resolve(data);
    },{type:'observation',raw,candidate,confidence,error:null});

    await page.click('#recognize');
    await pending(1);await reply(null,99,'ABC123');
    await pending(2);await reply('ABC123',70,'ABC123');
    await pending(3);
    assert.equal(await page.textContent('#code'),'— — —','raw text and rejected native candidates must never confirm');
    // Stop with work in flight: its high-confidence candidate must be discarded.
    await page.click('#recognize');await reply('ABC123',95,'ABC123');await delay(180);
    assert.equal(await application.evaluate(()=>ocrTest.calls),3);
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'framecode-test-unchanged');

    await page.click('#recognize');
    await pending(4);await reply();await pending(5);
    // A new session cannot observe a completed result from its predecessor.
    await page.click('#recognize');await page.click('#recognize');await reply('ABC123',95,'ABC123');
    await pending(6);
    assert.equal(await page.textContent('#code'),'— — —');
    // Selection changes cancel the pending frame too.
    await page.click('#select-region');
    const rect=await page.locator('#surface').boundingBox();
    await page.mouse.move(rect.x+rect.width*.25,rect.y+rect.height*.4);await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.6);await page.mouse.up();
    await reply('ABC123',95,'ABC123');await page.click('#recognize');await pending(7);
    assert.equal(await page.textContent('#code'),'— — —');
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'framecode-test-unchanged');
    await page.click('#recognize');await reply();

    // Recognition continues behind a fullscreen game or minimized window.
    assert.equal(await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling()),false);
    await page.click('#recognize');await pending(8);
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});
      Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
    });
    await delay(170);await reply('ABC123',95,'XYZ789');await pending(9);
    await reply('ABC123',95,'XYZ789');
    await page.waitForFunction(()=>document.getElementById('code').textContent==='ABC123');
    await delay(200);
    assert.equal(await application.evaluate(()=>ocrTest.calls),9,'confirmed sessions finish exactly once');
    assert.equal(await application.evaluate(({clipboard})=>clipboard.readText()),'ABC123','native candidate is authoritative even if raw text differs');
    assert.deepEqual(await page.evaluate(()=>confirmationEvents),[{type:'confirmed',code:'ABC123'}]);
    const inputs=await application.evaluate(()=>ocrTest.inputs);
    assert.ok(inputs.every(image=>image.bytes===image.width*image.height*4&&image.pattern==='[A-Z]{3}[0-9]{3}'));
    assert.deepEqual(errors,[]);
    console.log('PASS: official crop/raw RGBA, one OCR per frame, native candidates, background recognition, stop/restart/selection cancellation');
  }finally{
    if(previous!==undefined)await application.evaluate(({clipboard},text)=>clipboard.writeText(text),previous).catch(()=>{});
    await application.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
