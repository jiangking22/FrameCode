import {LowLatencyPlayer} from './low-latency.js';
export class Player {
  constructor(video,canvas,onFrame,onError,onStatus){Object.assign(this,{video,canvas,onFrame,onError,onStatus});this.generation=0;this.ready=false;this.frame=0;this.lastTime=-1;this.draw=this.draw.bind(this);requestAnimationFrame(this.draw);}
  stop(){this.generation++;this.ready=false;this.low?.stop();this.low=null;this.mse?.destroy();this.mse=null;this.hls?.destroy();this.hls=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.video.pause();this.video.srcObject=null;this.video.removeAttribute('src');this.video.load();this.lastTime=-1;}
  async play(source,mode,buffer){
    this.stop();const generation=this.generation;this.label=source.label;this.isDesktop=false;
    if(mode==='low'&&source.format==='flv'){
      this.low=new LowLatencyPlayer(this.canvas,time=>{if(generation!==this.generation)return;this.ready=true;this.time=time;this.onFrame(time);},error=>this.onError(error),(frames,queue)=>this.onStatus(`视频 ${frames} 帧 · 解码队列 ${queue}`));
      void this.low.start(source.url);return;
    }
    if(mode==='low')this.onStatus('当前来源使用标准解码；低延迟模式适用于 AVC/FLV');
    this.video.loop=!!source.demo;this.video.muted=false;
    if(/^https?:/i.test(source.url))this.video.crossOrigin='anonymous';else this.video.removeAttribute('crossorigin');
    this.video.onerror=()=>{if(generation===this.generation)this.onError(new Error('视频无法播放，请检查地址、格式和网络'));};
    if(source.format==='flv'){
      if(!window.mpegts.isSupported())throw new Error('当前环境不支持 MSE');
      this.mse=window.mpegts.createPlayer({type:'flv',isLive:source.url.startsWith('http'),url:source.url},{enableWorker:true,enableStashBuffer:false,liveBufferLatencyChasing:true,liveBufferLatencyMaxLatency:Math.max(.5,buffer+.3),liveBufferLatencyMinRemain:buffer,autoCleanupSourceBuffer:true});
      this.mse.on(window.mpegts.Events.ERROR,()=>{if(generation===this.generation)this.onError(new Error('FLV 播放中断，请重连或改用桌面采集'));});
      this.mse.attachMediaElement(this.video);this.mse.load();
    }else if(source.format==='hls'){
      this.hls=new window.Hls({lowLatencyMode:true,backBufferLength:10,maxBufferLength:8});
      this.hls.on(window.Hls.Events.ERROR,(_,data)=>{if(data.fatal&&generation===this.generation)this.onError(new Error('HLS 播放中断，请重连'));});
      this.hls.loadSource(source.url);this.hls.attachMedia(this.video);
    }else this.video.src=source.url;
    await this.video.play();
  }
  async desktop(id){
    this.stop();const generation=this.generation;
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:id,maxFrameRate:30}}});
    if(generation!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
    this.stream=stream;this.isDesktop=true;this.video.srcObject=stream;this.video.muted=true;this.video.loop=false;
    stream.getVideoTracks()[0].onended=()=>{this.stop();this.onError(new Error('采集窗口已关闭，请重新选择'));};
    await this.video.play();
  }
  draw(){
    requestAnimationFrame(this.draw);
    if(this.low||this.video.readyState<2||this.video.paused)return;
    const {videoWidth:w,videoHeight:h,currentTime:time}=this.video;if(!w||!h||time===this.lastTime)return;
    if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;
    this.canvas.getContext('2d',{alpha:false}).drawImage(this.video,0,0);this.ready=true;this.lastTime=time;this.time=time;this.onFrame(time);
  }
}
