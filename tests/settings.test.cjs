const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanSettings}=require('../src/core/settings.cjs');

const fast={settle:10,hold:20,gap:50};

test('new settings use fast timing by default',()=>{
  assert.deepEqual(cleanSettings({}).timing,fast);
});

test('missing and invalid timing values fall back to fast timing',()=>{
  assert.deepEqual(cleanSettings({timing:{settle:NaN,hold:'45',gap:Infinity}}).timing,fast);
  assert.deepEqual(cleanSettings({timing:{hold:75}}).timing,{settle:10,hold:75,gap:50});
});

test('saved stable and custom timings survive loading and saving',()=>{
  for(const timing of [{settle:30,hold:45,gap:80},{settle:60,hold:75,gap:160}]){
    const loaded=cleanSettings({timing});
    assert.deepEqual(loaded.timing,timing);
    assert.deepEqual(cleanSettings(JSON.parse(JSON.stringify(loaded))).timing,timing);
  }
});
