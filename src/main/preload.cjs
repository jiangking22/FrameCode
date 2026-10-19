const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('fc:'+name,...args);
contextBridge.exposeInMainWorld('framecode',{
  init:()=>invoke('init'),openFile:()=>invoke('file'),demo:()=>invoke('demo'),
  play:(url,quality)=>invoke('play',url,quality),stopMedia:()=>invoke('stop-media'),
  sources:()=>invoke('sources'),begin:(rule,source)=>invoke('begin',rule,source),stop:()=>invoke('stop'),
  frame:payload=>invoke('frame',payload),copy:()=>invoke('copy'),
  record:key=>invoke('record',key),auto:enabled=>invoke('auto',enabled),
  save:settings=>invoke('save',settings),
  onEvent:callback=>{const handler=(_,event)=>callback(event);ipcRenderer.on('fc:event',handler);return()=>ipcRenderer.removeListener('fc:event',handler);}
});
