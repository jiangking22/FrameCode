const {test}=require('node:test');const assert=require('node:assert/strict');
const {writeVerified}=require('../src/main/clipboard.cjs');
test('clipboard retries transient contention and aborts obsolete sessions',async()=>{
 let written='',reads=0;const clipboard={writeText:async t=>{written=t;},readText:async()=>++reads<3?'':written};
 await writeVerified(clipboard,'ABC123',()=>true,async()=>{});assert.equal(reads,3);
 await assert.rejects(writeVerified(clipboard,'ABC123',()=>false,async()=>{}),/取消/);
});
test('clipboard failure is bounded',async()=>{
 let writes=0;await assert.rejects(writeVerified({writeText:()=>writes++,readText:()=>''},'ABC123',()=>true,async()=>{}));assert.equal(writes,5);
});
