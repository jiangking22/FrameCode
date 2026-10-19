import {Player} from './player.js';
import {RegionSelection} from './selection.js';
const $=id=>document.getElementById(id),api=window.framecode;
let settings={},active=false,preparing=false,session=null,processed=0,lastPreview=-Infinity,epoch=0,loadEpoch=0,readyShown=false,recordTimer=null;
const status=message=>{$('status').textContent=message;};
const failure=error=>{status(error?.message?.replace(/^Error invoking remote method '[^']+': Error: /,'')||String(error));};
const safe=fn=>(...args)=>{try{return Promise.resolve(fn(...args)).catch(failure);}catch(error){failure(error);}};
const region=new RegionSelection($('media-shell'),$('surface'),$('selection'),()=>{void stop();updateReady();preview();renderReferenceBoxes();});
const player=new Player($('video'),$('surface'),onFrame,error=>{void stop();failure(error);},text=>{$('play-metrics').textContent=text;});
const presets=()=>Array.isArray(settings.presets)?settings.presets:[];
function presetRegion(preset){return preset?{x:preset.x,y:preset.y,w:preset.width,h:preset.height}:null;}
async function savePresetChanges(){settings=await api.save(settings);renderPresets();renderReferenceBoxes();}
function renderReferenceBoxes(){
  const host=$('reference-boxes');host.replaceChildren();
  if(!player.ready||region.selecting||!presets().length){host.hidden=true;return;}
  const bounds=region.bounds();if(!bounds.w||!bounds.h){host.hidden=true;return;}
  const visible=presets().filter(preset=>preset.showReference!==false);
  if(!visible.length){host.hidden=true;return;}
  host.hidden=false;
  for(const preset of visible){
    const box=document.createElement('div'),label=document.createElement('span');
    box.className='reference-box';
    Object.assign(box.style,{
      left:`${bounds.x+preset.x*bounds.w}px`,top:`${bounds.y+preset.y*bounds.h}px`,
      width:`${preset.width*bounds.w}px`,height:`${preset.height*bounds.h}px`
    });
    label.textContent=preset.name;box.append(label);host.append(box);
  }
}
function applyPreset(preset,{automatic=false}={}){
  const next=presetRegion(preset);if(!next)throw new Error('预设区域无效');
  region.set(next);
  status(`${automatic?'已自动应用':'已应用'}区域预设「${preset.name}」`);
}
function renderPresets(){
  const list=$('presets-list');list.replaceChildren();
  if(!presets().length){
    const empty=document.createElement('p');empty.className='preset-empty';
    empty.textContent='还没有保存的区域。先在画面中框选房间码，再输入名称保存。';list.append(empty);return;
  }
  for(const preset of presets()){
    const item=document.createElement('div'),checks=document.createElement('div'),info=document.createElement('div'),buttons=document.createElement('div');
    item.className='preset-item';checks.className='preset-checks';info.className='preset-info';buttons.className='preset-buttons';
    const autoLabel=document.createElement('label'),auto=document.createElement('input');
    auto.type='checkbox';auto.checked=preset.autoApply===true;
    auto.onchange=()=>safe(async()=>{preset.autoApply=auto.checked;await savePresetChanges();})();
    autoLabel.append(auto,document.createTextNode('自动应用'));
    const refLabel=document.createElement('label'),ref=document.createElement('input');
    ref.type='checkbox';ref.checked=preset.showReference!==false;
    ref.onchange=()=>safe(async()=>{preset.showReference=ref.checked;await savePresetChanges();})();
    refLabel.append(ref,document.createTextNode('显示参考框'));
    checks.append(autoLabel,refLabel);
    const name=document.createElement('strong'),coords=document.createElement('small');
    name.textContent=preset.name;
    coords.textContent=`${preset.x.toFixed(4)}, ${preset.y.toFixed(4)} · ${preset.width.toFixed(4)} × ${preset.height.toFixed(4)}`;
    info.append(name,coords);
    const apply=document.createElement('button'),rename=document.createElement('button'),remove=document.createElement('button');
    apply.type=rename.type=remove.type='button';apply.className=rename.className='quiet';remove.className='quiet danger';
    apply.textContent='应用';rename.textContent='重命名';remove.textContent='删除';
    apply.disabled=!player.ready;apply.title=apply.disabled?'请先加载播放器画面':'应用此识别区域';
    apply.onclick=()=>safe(async()=>applyPreset(preset))();
    rename.onclick=()=>safe(async()=>{
      const value=window.prompt('输入新的预设名称',preset.name);if(value===null)return;
      const next=value.trim();if(!next||next.length>64)throw new Error('预设名称长度需在 1-64 个字符');
      preset.name=next;await savePresetChanges();status(`预设已重命名为「${next}」`);
    })();
    remove.onclick=()=>safe(async()=>{
      if(!window.confirm(`确定删除预设「${preset.name}」？`))return;
      settings.presets=presets().filter(item=>item.id!==preset.id);
      await savePresetChanges();status(`已删除预设「${preset.name}」`);
    })();
    buttons.append(apply,rename,remove);item.append(checks,info,buttons);list.append(item);
  }
}
function updateReady(){
  $('recognize').disabled=!active&&!preparing&&(!player.ready||!region.region);
  $('recognize').replaceChildren(document.createTextNode(active?'停止识别 ':preparing?'取消准备 ':'开始识别 '));
  const k=document.createElement('kbd');k.textContent='Ctrl + 1';$('recognize').append(k);
  $('phase').textContent=active?'正在识别':preparing?'准备引擎':!player.ready?'等待画面':region.region?'准备就绪':'等待框选';$('phase').classList.toggle('active',active||preparing);
  $('select-region').disabled=!player.ready;$('save-region').disabled=!region.region;$('restore-region').disabled=!player.ready||!settings.region;$('presets-open').disabled=!player.ready;
  $('rule').disabled=active||preparing;$('source').disabled=active||preparing;
  $('record-paste').disabled=['delta','delta-1v1'].includes($('rule').value);
}
async function stop(){epoch++;active=false;preparing=false;session=null;frameQueue.changed();updateReady();await api.stop();}
async function toggle(){
  if(active||preparing){await stop();status('已停止本轮识别。未确认的候选码不会复制。');return;}
  if(!player.ready||!region.region)throw new Error('请先接入画面，再点击「框选房间码」选择识别范围。');
  const id=++epoch;preparing=true;updateReady();
  try{const result=await api.begin($('rule').value,player.isDesktop?'desktop':'player');if(id!==epoch)return;session=result.session;active=true;processed=0;frameQueue.changed();$('code').textContent='— — —';$('copy').disabled=true;$('candidate').textContent='正在识别选区，等待房间码稳定出现';status('正在识别选区。确认后会自动复制房间码，并结束本轮识别。');}
  finally{if(id===epoch)preparing=false;updateReady();}
}
function cropFrame(target){return region.crop(target,player.low?$('surface'):$('video'));}
function preview(){if(!player.ready||!cropFrame($('preview'))){$('preview').hidden=true;$('preview-empty').hidden=false;return;}$('preview').hidden=false;$('preview-empty').hidden=true;}
// Keep the latest frame for encoded-image IPC. Native replies own the slot until ACK.
function createOcrFrameQueue({readState,copy,send,onResult,onError}){
  let sequence=0,generation=0,latest=null,queued=false,inFlight=null,timer=null;
  let lastAt=-Infinity,lastMedia=null,lastFrame=null;
  const eligible=s=>s.active&&s.sessionId!==null&&s.ready&&s.region&&
    s.width>0&&s.height>0&&(s.codec||!s.paused&&!s.seeking);
  const current=job=>job.generation===generation&&job.sessionId===readState().sessionId;
  function cancelTimer(){if(timer!==null&&timer!==0)clearTimeout(timer);timer=null;}
  function changed(){
    generation++;latest=null;queued=false;cancelTimer();lastAt=-Infinity;lastMedia=lastFrame=null;
    // A delivered request remains owned until its exact Promise/ACK completes.
  }
  function ready(){
    const s=readState(),frame=latest,now=performance.now();
    if(!queued||!frame||!eligible(s)||frame.generation!==generation||frame.sessionId!==s.sessionId)return null;
    const interval=frame.frameDriven?0:16;
    if(now-lastAt<interval||frame.mediaTime===lastMedia||
      frame.presentedFrame!==null&&frame.presentedFrame===lastFrame||inFlight)return null;
    return {frame,now};
  }
  function ack(job){if(inFlight!==job)return;inFlight=null;drain();}
  async function capture(){
    const r=ready();if(!r)return;
    const {frame,now}=r;queued=false;lastAt=now;
    const job={...frame,frameId:++sequence};inFlight=job;
    try{
      // Read the latest surface at execution; encoding completes synchronously
      // before awaiting IPC, so subsequent canvas reuse cannot change this frame.
      const payload=copy();if(!payload)return;
      lastMedia=job.mediaTime;lastFrame=job.presentedFrame;
      const result=await send({session:job.sessionId,frame:job.frameId,...payload});
      if(current(job)&&eligible(readState()))onResult(result);
    }catch(error){if(current(job))await onError(error);}
    finally{ack(job);}
  }
  function deferCopy(){
    if(timer!==null)return;
    // Keep Canvas/PNG work outside the presentation callback, as in the host.
    timer=0;
    const id=setTimeout(()=>{timer=null;void capture();},0);
    if(timer===0)timer=id;
  }
  function drain(){if(ready())deferCopy();}
  function schedule(mediaTime,presentedFrame=null,frameDriven=false){
    const s=readState();
    if(!Number.isFinite(mediaTime)||!eligible(s)){latest=null;queued=false;cancelTimer();return;}
    latest={mediaTime,presentedFrame,frameDriven,sessionId:s.sessionId,generation};queued=true;drain();
  }
  return {schedule,changed};
}
const frameQueue=createOcrFrameQueue({
  readState:()=>{
    const surface=player.low?$('surface'):$('video');
    return {active,sessionId:session,ready:player.ready,region:region.region,
      width:surface.videoWidth||surface.width,height:surface.videoHeight||surface.height,
      // Electron keeps capture active behind the game (backgroundThrottling:false).
      codec:!!player.low,paused:player.video.paused,seeking:player.video.seeking};
  },
  copy:()=>{
    const roi=document.createElement('canvas');if(!cropFrame(roi))return null;
    const format=roi.width*roi.height<=400000?'image/png':'image/jpeg';
    return {image:roi.toDataURL(format,0.9),wide:roi.width/roi.height>=4};
  },
  send:payload=>api.frame(payload),
  onResult:result=>{
    if(result.ignored)return;
    $('frames').textContent=`已处理 ${++processed} 帧`;$('ocr-time').textContent=`OCR ${result.ms} ms`;
    if(result.confirmed){active=false;frameQueue.changed();$('code').textContent=result.code;$('copy').disabled=false;}
    else $('candidate').textContent=result.code?`候选 ${result.code} · 置信度 ${result.confidence} · 稳定确认中`:`未匹配 · 置信度 ${result.confidence}，请核对规则或缩小选区`;
    updateReady();
  },
  onError:async error=>{await stop();failure(error);}
});
function onFrame(mediaTime){
  if(!readyShown){readyShown=true;$('empty').hidden=true;$('media-stop').disabled=false;$('pause').disabled=!!player.low;$('mute').disabled=!!player.low||player.isDesktop;updateReady();region.paint();renderReferenceBoxes();}
  const now=performance.now();if(now-lastPreview>180){lastPreview=now;preview();}
  const presentedFrame=player.low?player.low.count+1:player.video.getVideoPlaybackQuality?.().totalVideoFrames;
  frameQueue.schedule(mediaTime,Number.isFinite(presentedFrame)&&presentedFrame>0?presentedFrame:null,!!player.low);
}
async function resetMedia(){loadEpoch++;await stop();player.stop();readyShown=false;region.set(null);processed=0;$('empty').hidden=false;$('media-stop').disabled=true;$('pause').disabled=true;$('mute').disabled=true;$('pause').textContent='暂停';$('mute').textContent='静音';$('code').textContent='— — —';$('copy').disabled=true;$('candidate').textContent='识别完成后，房间码会显示在这里';$('frames').textContent='已处理 0 帧';$('ocr-time').textContent='OCR — ms';renderReferenceBoxes();updateReady();}
async function load(source){if(!source)return;await resetMedia();$('source').value='player';$('media-label').textContent=source.label;status('正在加载视频…');
  await player.play(source,$('mode').value,Number($('buffer').value));
  if(source.demo){region.set({x:.20,y:.40,w:.60,h:.20});status('演示已就绪，已为你框选示例房间码。点击「开始识别」或按 Ctrl + 1。');}
  else {
    const automatic=presets().find(preset=>preset.autoApply);
    if(automatic)applyPreset(automatic,{automatic:true});
    else status('画面就绪后，点击「框选房间码」，拖动选择完整的房间码文字。');
  }
}
$('play-form').onsubmit=safe(async e=>{e.preventDefault();await resetMedia();const id=loadEpoch;$('play').disabled=true;status('正在解析直播地址…');try{const source=await api.play($('url').value,$('quality').value);if(id!==loadEpoch)return;await load(source);}finally{$('play').disabled=false;}});
$('demo').onclick=$('empty-demo').onclick=safe(async()=>load(await api.demo()));
$('open-file').onclick=safe(async()=>load(await api.openFile()));
$('media-stop').onclick=safe(async()=>{await resetMedia();await api.stopMedia();$('media-label').textContent='已停止';status('播放与识别已停止');});
$('recognize').onclick=safe(toggle);
$('copy').onclick=safe(async()=>{await api.copy();status('房间码已复制到剪贴板');});
$('select-region').onclick=safe(async()=>{await stop();region.enable(true);status('在画面中拖动框选完整房间码，尽量避开周围文字；按 Esc 取消。');});
$('pause').onclick=safe(async()=>{await stop();if(player.video.paused){await player.video.play();$('pause').textContent='暂停';}else{player.video.pause();$('pause').textContent='继续';status('画面已暂停，本轮识别已停止。继续播放后，可重新开始识别。');}});
$('mute').onclick=()=>{player.video.muted=!player.video.muted;$('mute').textContent=player.video.muted?'开启声音':'静音';};
$('mode').onchange=safe(async()=>{await stop();$('buffer').disabled=$('mode').value==='low';status('播放模式已保存，重新连接画面后生效。');settings.mode=$('mode').value;settings=await api.save(settings);});
const descriptions={valorant:'3 个大写字母 + 3 位数字',delta:'3 个大写字母 + 4 位数字','delta-1v1':'4 个大写字母 + 4 位数字',generic:'6 位大写字母或数字'};
function ruleChanged(){const keyboard=['delta','delta-1v1'].includes($('rule').value);$('rule-hint').textContent=descriptions[$('rule').value];$('input-hint').textContent=keyboard?'此规则使用 Ctrl+V；开始前先点击游戏的房间码输入框。':'切到游戏，用 Ctrl + 2 / 3 记录按钮位置。';updateReady();}
$('rule').onchange=safe(async()=>{await stop();ruleChanged();settings.rule=$('rule').value;settings=await api.save(settings);});
$('save-region').onclick=safe(async()=>{settings.region=region.region;settings=await api.save(settings);updateReady();status('选区已保存，可在相同布局的画面中恢复');});
$('restore-region').onclick=()=>{region.set(settings.region);status('已恢复上次保存的选区。请核对预览中的房间码是否完整。');};
$('presets-open').onclick=()=>{renderPresets();$('presets-dialog').showModal();};
$('presets-close').onclick=()=>$('presets-dialog').close();
$('preset-form').onsubmit=safe(async event=>{
  event.preventDefault();if(!player.ready||!region.region)throw new Error('请先加载画面并框选识别区域');
  const name=$('preset-name').value.trim();if(!name||name.length>64)throw new Error('预设名称长度需在 1-64 个字符');
  settings.presets=[...presets(),{
    id:crypto.randomUUID?.()||`preset-${Date.now()}`,
    name,x:region.region.x,y:region.region.y,width:region.region.w,height:region.region.h,
    autoApply:false,showReference:true
  }];
  await savePresetChanges();$('preset-name').value='';status(`已保存区域预设「${name}」`);
});
$('auto').onchange=safe(async()=>{await stop();await api.auto($('auto').checked);$('auto-label').textContent=$('auto').checked?'已启用':'仅复制';status($('auto').checked?'自动操作已启用，请记录按钮位置，并保持游戏在前台':'自动操作已关闭，仅复制房间码');});
for(const key of ['paste','join'])$('record-'+key).onclick=safe(async()=>{await stop();clearTimeout(recordTimer);status('将在 3 秒后记录位置：请切到游戏，将鼠标停在目标按钮上。');recordTimer=setTimeout(()=>safe(()=>api.record(key))(),3000);});
async function chooseDesktop(){
  await stop();const sources=await api.sources(),list=$('sources-list');list.replaceChildren();
  for(const source of sources){const button=document.createElement('button'),image=document.createElement('img'),name=document.createElement('span');image.src=source.thumbnail;image.alt='';name.textContent=source.name;button.append(image,name);button.onclick=safe(async()=>{$('sources-dialog').close();await resetMedia();await api.stopMedia();$('source').value='desktop';$('media-label').textContent=source.name;await player.desktop(source.id);status('已采集所选画面，请框选房间码区域');});list.append(button);}
  if(!sources.length)list.textContent='没有找到可采集的画面。请先打开目标窗口，再重新选择。';$('sources-dialog').showModal();
}
$('source').onchange=safe(async()=>{if($('source').value==='desktop')await chooseDesktop();else{await resetMedia();await api.stopMedia();}});
$('sources-close').onclick=()=>{$('sources-dialog').close();$('source').value=player.isDesktop?'desktop':'player';};
$('settings-open').onclick=safe(async()=>{await stop();for(const key of ['settle','hold','gap'])$(key).value=settings.timing[key];$('settings-dialog').showModal();});
$('settings-close').onclick=()=>$('settings-dialog').close();
for(const [id,timing] of Object.entries({'timing-fast':[10,20,50],'timing-stable':[30,45,80]}))$(id).onclick=()=>{['settle','hold','gap'].forEach((key,index)=>{$(key).value=timing[index];});};
$('settings-form').onsubmit=safe(async e=>{e.preventDefault();settings.timing=Object.fromEntries(['settle','hold','gap'].map(k=>[k,Number($(k).value)]));settings=await api.save(settings);$('settings-dialog').close();status('设置已保存');});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){region.enable(false);void stop();clearTimeout(recordTimer);}});
window.addEventListener('resize',renderReferenceBoxes);
api.onEvent(event=>{
  if(event.type==='toggle')safe(toggle)();
  if(event.type==='stopped'){active=false;session=null;frameQueue.changed();updateReady();}
  if(event.type==='status')status(event.message);
  if(event.type==='confirmed'){active=false;frameQueue.changed();$('code').textContent=event.code;$('copy').disabled=false;$('candidate').textContent='稳定确认通过 · 已复制';status('房间码已复制，本轮识别完成。按 Ctrl + 1 可开始下一轮。');updateReady();}
  if(event.type==='point'){$('record-'+event.key).replaceChildren(document.createTextNode(event.key==='paste'?'粘贴位置已记录':'加入位置已记录'));const small=document.createElement('small');small.textContent=`${event.point.x}, ${event.point.y}`;$('record-'+event.key).append(small);status('操作位置已记录');}
});
const initial=await api.init();document.querySelector('.version').textContent=`v${initial.version}`;settings=initial.settings;$('rule').value=settings.rule;$('mode').value=settings.mode;$('buffer').disabled=settings.mode==='low';ruleChanged();
