const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {InputBridge}=require('../src/main/input.cjs');
test('native INPUT x64 layout and rejection of invalid foreground',async()=>{
 const bridge=new InputBridge(path.resolve(__dirname,'..'));
 try{
  assert.equal(await bridge.request('layout'),40);
  await assert.rejects(bridge.request('paste',{hwnd:0,pid:0,l:0,t:0,r:100,b:100}),error=>{
   assert.match(error.message,/^自动输入未完成：/);
   assert.match(error.message,/foreground changed:/);
   assert.doesNotMatch(error.message,/调用|参数|Exception calling/);
   return true;
  });
 }
 finally{bridge.close();}
});
test('cancellation never dispatches input, mismatched targets rejected',async()=>{
 const bridge=new InputBridge('');let calls=0;bridge.request=async()=>calls++;
 const abort=new AbortController();abort.abort();
 await assert.rejects(bridge.execute('buttons',{}, {},abort.signal));assert.equal(calls,0);
 await assert.rejects(bridge.execute('buttons',{paste:{hwnd:1,pid:1},join:{hwnd:2,pid:2}},{},new AbortController().signal));assert.equal(calls,0);
});
test('native input permissions can be checked without sending events',async()=>{
 const bridge=new InputBridge(path.resolve(__dirname,'..'));
 try{
  assert.equal(await bridge.request('access',{pid:process.pid}),'allowed');
  await assert.rejects(bridge.request('access',{pid:0}),/无法核验.*权限/);
 }finally{bridge.close();}
});
