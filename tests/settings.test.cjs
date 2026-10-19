const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DEFAULT_PRESET,cleanSettings}=require('../src/core/settings.cjs');

test('new settings include the official hanghang preset with auto apply and reference enabled',()=>{
  const settings=cleanSettings({});
  assert.deepEqual(settings.presets,[DEFAULT_PRESET]);
});

test('presets keep valid normalized regions and normalize flags',()=>{
  const settings=cleanSettings({presets:[
    {id:'desk',name:' 主界面 ',x:.1,y:.2,width:.3,height:.4,autoApply:true,showReference:false},
    {id:'bad',name:'越界',x:.9,y:.1,width:.3,height:.2},
    {id:'empty',name:'   ',x:.1,y:.1,width:.2,height:.2}
  ]});
  assert.deepEqual(settings.presets,[{
    id:'desk',name:'主界面',x:.1,y:.2,width:.3,height:.4,autoApply:true,showReference:false
  }]);
});

test('an explicitly empty preset list survives settings cleanup',()=>{
  assert.deepEqual(cleanSettings({presets:[]}).presets,[]);
});
