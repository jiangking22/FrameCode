const { test } = require('node:test');
const assert = require('node:assert/strict');
const { candidate, Confirmation, regionPixels, validateUrl } = require('../src/core/recognition.cjs');

test('four rules match exact tokens, never substrings of longer codes', () => {
  assert.equal(candidate('房间码 ABC123', 'valorant'), 'ABC123');
  assert.equal(candidate('ABC1234', 'valorant'), null);
  assert.equal(candidate('ABC1234', 'delta'), 'ABC1234');
  assert.equal(candidate('ABCD1234', 'delta-1v1'), 'ABCD1234');
  assert.equal(candidate('1A2B3C', 'generic'), '1A2B3C');
  assert.equal(candidate('ABC123 DEF456', 'valorant'), null);
});
test('confirmation needs distinct frames, adequate confidence and elapsed stability', () => {
  const c = new Confirmation(); c.start('valorant', 7);
  assert.equal(c.observe({session:7, frame:1, at:100, text:'ABC123', confidence:95}).confirmed, false);
  assert.equal(c.observe({session:7, frame:1, at:400, text:'ABC123', confidence:95}).confirmed, false);
  assert.equal(c.observe({session:7, frame:2, at:200, text:'ABC123', confidence:95}).confirmed, false);
  assert.equal(c.observe({session:7, frame:3, at:260, text:'ABC123', confidence:95}).confirmed, true);
  assert.equal(c.observe({session:7, frame:4, at:600, text:'ABC123', confidence:95}).confirmed, false);
});
test('stale sessions, rejection and candidate changes cannot carry confirmation forward', () => {
  const c=new Confirmation(); c.start('valorant',2);
  const observe=(frame,at,text,confidence=95,session=2)=>c.observe({frame,at,text,confidence,session});
  observe(1,0,'ABC123'); observe(2,200,'ABC123',95,1);
  assert.equal(observe(3,210,'ABC123',30).confirmed,false);
  assert.equal(observe(4,400,'ABC123').confirmed,false);
  assert.equal(observe(5,600,'XYZ789').confirmed,false);
  c.stop(); assert.equal(observe(6,900,'XYZ789').confirmed,false);
});
test('official desktop and player stability windows remain 100 ms and 150 ms', () => {
  for(const stableMs of [100,150]){
    const confirmation=new Confirmation();confirmation.start('valorant',1,stableMs);
    assert.equal(confirmation.observe({session:1,frame:1,at:0,text:'ABC123',confidence:80}).confirmed,false);
    assert.equal(confirmation.observe({session:1,frame:2,at:stableMs-1,text:'ABC123',confidence:80}).confirmed,false);
    assert.equal(confirmation.observe({session:1,frame:3,at:stableMs,text:'ABC123',confidence:80}).confirmed,true);
  }
});

test('crop maps normalized selection, rejects invalid geometry', () => {
  assert.deepEqual(regionPixels({x:.25,y:.25,w:.5,h:.5},1920,1080),{x:480,y:270,w:960,h:540});
  assert.throws(()=>regionPixels({x:0,y:0,w:NaN,h:1},100,100));
  assert.throws(()=>regionPixels({x:.9,y:0,w:.5,h:1},100,100));
});
test('URLs must be explicit HTTP(S), credentials and shell strings rejected', () => {
  assert.equal(validateUrl('https://live.bilibili.com/123').hostname,'live.bilibili.com');
  for(const value of ['file:///C:/secret','javascript:alert(1)','https://u:p@site.com','--exec=calc']) assert.throws(()=>validateUrl(value));
});
