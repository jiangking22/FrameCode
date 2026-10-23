const {RULES}=require('./recognition.cjs');

const DEFAULT_PRESET=Object.freeze({
  id:'hanghang',
  name:'hanghang',
  x:0.28869778869778867,
  y:0.33911752661752664,
  width:0.4176904176904177,
  height:0.3254163254163254,
  autoApply:true,
  showReference:true
});

function validRegion(r){
  return r&&[r.x,r.y,r.w,r.h].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=1.000001&&r.y+r.h<=1.000001;
}
function presetRegion(preset){
  return preset&&[preset.x,preset.y,preset.width,preset.height].every(Number.isFinite)&&
    preset.x>=0&&preset.y>=0&&preset.width>0&&preset.height>0&&
    preset.x+preset.width<=1.01&&preset.y+preset.height<=1.01;
}
function cleanPresets(value){
  if(!Array.isArray(value))return [{...DEFAULT_PRESET}];
  const seen=new Set();
  const presets=[];
  for(const item of value.slice(0,20)){
    if(!item||typeof item.name!=='string'||!presetRegion(item))continue;
    const name=item.name.trim();
    if(!name||name.length>64)continue;
    let id=typeof item.id==='string'&&/^[a-z0-9-]{1,64}$/i.test(item.id)?item.id:`preset-${presets.length+1}`;
    while(seen.has(id))id=`${id}-${presets.length+1}`;
    seen.add(id);
    presets.push({
      id,name,
      x:item.x,y:item.y,width:item.width,height:item.height,
      autoApply:item.autoApply===true,
      showReference:item.showReference!==false
    });
  }
  return presets;
}
function cleanSettings(value){
  if(!value||typeof value!=='object')throw new Error('设置格式无效');
  const timing=value.timing||{};
  return {
    rule:Object.hasOwn(RULES,value.rule)?value.rule:'valorant',
    mode:value.mode==='low'?'low':'standard',
    region:validRegion(value.region)?value.region:null,
    presets:cleanPresets(value.presets),
    timing:{
      settle:bounded(timing.settle,10,500,10),
      hold:bounded(timing.hold,20,500,20),
      gap:bounded(timing.gap,50,2000,50)
    }
  };
}
function bounded(value,min,max,fallback){
  return Number.isFinite(value)?Math.round(Math.max(min,Math.min(max,value))):fallback;
}

module.exports={DEFAULT_PRESET,cleanSettings,validRegion};
