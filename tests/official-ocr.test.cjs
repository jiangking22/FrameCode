const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const {OcrEngine}=require('../src/main/ocr.cjs');
const {InstalledWorkerOracle,installedRuntime,readFixture,cropRgba,observation}=require('./helpers/official-oracle.cjs');
const {gameImages,missingFixtures,missingMessage}=require('./helpers/private-fixtures.cjs');

const root=path.resolve(__dirname,'..'),pattern='[A-Z]{3}[0-9]{3}';
const tiny={width:2,height:1,rgba:Buffer.from([10,20,30,255,40,50,60,255])};
function fakeEngine(modes,timeoutMs=1500){
  const starts=[];
  const engine=new OcrEngine(root,{verifyRuntime:async()=>{},timeoutMs,
    spawn:(file,args,options)=>{
      const child=spawn(process.execPath,[path.join(__dirname,'fixtures/fake-ocr-worker.cjs'),modes.shift()||'normal'],{...options,cwd:root});
      starts.push({file,args,options,child});return child;
    }
  });
  return {engine,starts};
}
test('official IPC handles fragmented length, UTF-8 JSON and serial requests without changing observations',{timeout:5000},async t=>{
  const {engine,starts}=fakeEngine(['split']);t.after(()=>engine.close());
  await engine.ready();
  const patterns=[pattern,'[A-Z]{3}[0-9]{4}中文'];
  const values=await Promise.all(patterns.map(expression=>engine.recognize(tiny,expression)));
  assert.equal(starts.length,1);
  for(let index=0;index<values.length;index++){
    assert.equal(values[index].raw,patterns[index]);assert.equal(values[index].candidate,patterns[index]);
    assert.equal(values[index].confidence,91.75);
    assert.deepEqual(values[index].request,{width:2,height:1,required_frames:1,rgba_len:8});
  }
  assert.notEqual(values[0].sequence,values[1].sequence);
});
for(const mode of ['timeout','exit','wrong-sequence','invalid-json'])test(`official IPC ${mode} rejects active and queued frames; restart cannot reuse an old response`,{timeout:6000},async t=>{
  const {engine,starts}=fakeEngine([mode,'normal'],mode==='timeout'?400:1500);t.after(()=>engine.close());
  await engine.ready();
  const results=await Promise.allSettled([engine.recognize(tiny,pattern),engine.recognize(tiny,'[A-Z]{4}[0-9]{4}')]);
  assert.deepEqual(results.map(value=>value.status),['rejected','rejected']);
  const fresh=await engine.recognize(tiny,'[A-Z0-9]{6}');
  assert.equal(fresh.raw,'[A-Z0-9]{6}');assert.equal(starts.length,2);
});
test('closing active OCR rejects its queue and permits a clean new worker',{timeout:6000},async t=>{
  const {engine,starts}=fakeEngine(['delayed','normal']);t.after(()=>engine.close());
  await engine.ready();
  const results=Promise.allSettled([engine.recognize(tiny,pattern),engine.recognize(tiny,'[A-Z]{4}[0-9]{4}')]);
  await delay(30);await engine.close();
  assert.deepEqual((await results).map(value=>value.status),['rejected','rejected']);
  assert.equal((await engine.recognize(tiny,'[A-Z0-9]{6}')).raw,'[A-Z0-9]{6}');
  assert.equal(starts.length,2);
});
test('official worker resources fail clearly when absent',{timeout:2000},async()=>{
  const absent=path.join(os.tmpdir(),`framecode-absent-${process.pid}-${Date.now()}`),engine=new OcrEngine(absent);
  await assert.rejects(engine.ready(),/OCR|识别|资源|组件/);
  await engine.close();
});
test('closing during resource verification rejects old frames before a clean restart',{timeout:6000},async t=>{
  const {engine,starts}=fakeEngine(['normal']);t.after(()=>engine.close());
  let release,started;const verifying=new Promise(resolve=>{started=resolve;});let verifications=0;
  engine.verifyRuntime=async()=>{if(++verifications===1){started();await new Promise(resolve=>{release=resolve;});}};
  const old=Promise.allSettled([engine.recognize(tiny,pattern),engine.recognize(tiny,'[A-Z]{4}[0-9]{4}')]);
  await verifying;await engine.close();
  assert.deepEqual((await old).map(value=>value.status),['rejected','rejected']);
  release();
  assert.equal((await engine.recognize(tiny,'[A-Z0-9]{6}')).raw,'[A-Z0-9]{6}');
  assert.equal(starts.length,1,'cancelled initialization must never spawn a worker');
});
test('late data and exit events from a closed child cannot affect a new worker',{timeout:6000},async t=>{
  const {engine,starts}=fakeEngine(['delayed','delayed']);t.after(()=>engine.close());
  await engine.ready();
  const old=Promise.allSettled([engine.recognize(tiny,pattern)]);await delay(30);await engine.close();
  assert.equal((await old)[0].status,'rejected');
  const fresh=engine.recognize(tiny,'[A-Z0-9]{6}');await delay(40);
  const data=Buffer.from(JSON.stringify({type:'observation',sequence:2,raw:'STALE',candidate:'STALE',confidence:99}));
  const prefix=Buffer.alloc(4);prefix.writeUInt32LE(data.length);
  starts[0].child.stdout.emit('data',Buffer.concat([prefix,data]));starts[0].child.emit('exit',17,null);
  assert.equal((await fresh).raw,'[A-Z0-9]{6}');assert.equal(starts.length,2);
});
test('modified official resource bytes are rejected before spawning',{timeout:3000},async t=>{
  const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'framecode-resource-test-'));
  t.after(()=>{assert.ok(path.resolve(tempRoot).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(tempRoot,{recursive:true,force:true});});
  const directory=path.join(tempRoot,'resources/ocr-runtime');fs.mkdirSync(path.join(directory,'tessdata'),{recursive:true});
  const files=['room-code-assistant-worker.exe','libtesseract-5.dll','tessdata/eng.traineddata'].map(name=>{
    const bytes=Buffer.from(`deliberately damaged ${name}`);fs.writeFileSync(path.join(directory,name),bytes);
    return {path:name,size:bytes.length,sha256:name.endsWith('.exe')?'84b1f83c225331431f2fc19c7e6569f637d92076636bb1e3a16697b9a90598c5':createHash('sha256').update(bytes).digest('hex')};
  });
  fs.writeFileSync(path.join(directory,'manifest.sha256.json'),JSON.stringify({format:1,files}));
  let spawned=false;const engine=new OcrEngine(tempRoot,{spawn:()=>{spawned=true;throw new Error('Must not spawn');}});
  await assert.rejects(engine.ready(),/校验失败/);assert.equal(spawned,false);await engine.close();
});
test('copied native OCR matches the installed official worker on identical game pixels',{timeout:60000},async t=>{
  const missing=missingFixtures(gameImages);if(missing.length){t.skip(missingMessage(missing));return;}
  if(process.platform!=='win32'){t.skip('Official binary is Windows x64');return;}
  if(!fs.existsSync(path.join(installedRuntime,'room-code-assistant-worker.exe'))){t.skip('Set FRAMECODE_OFFICIAL_OCR to the installed official OCR directory');return;}
  const engine=new OcrEngine(root),oracle=new InstalledWorkerOracle();
  t.after(async()=>{oracle.close();await engine.close();});
  await engine.ready();
  const samples=gameImages.map(name=>({name,image:readFixture(name)}));
  for(const [name,region] of [
    ['tight-code',{x:214,y:208,w:96,h:38}],
    ['complete-field',{x:44,y:196,w:438,h:64}],
    ['field-and-button',{x:44,y:196,w:610,h:64}]
  ])samples.push({name,image:cropRgba(samples[0].image,region)});
  const rows=[];
  for(const sample of samples){
    for(let frame=1;frame<=2;frame++){
      const expected=await oracle.recognize(sample.image,pattern),actual=await engine.recognize(sample.image,pattern);
      assert.deepEqual(observation(actual),observation(expected),`${sample.name}, frame ${frame}`);
      rows.push({sample:sample.name,frame,width:sample.image.width,height:sample.image.height,expected:observation(expected),actual:observation(actual)});
    }
  }
  const output=path.join(root,'artifacts/official-ocr-parity.json');fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify({createdAt:new Date().toISOString(),installedRuntime,rows},null,2)+'\n');
  t.diagnostic(`14 matching observations; report ${output}`);
});
