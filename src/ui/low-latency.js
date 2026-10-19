// Independently implemented incremental FLV/AVC video decoder.
export class LowLatencyPlayer {
  constructor(canvas,onFrame,onError,onMetrics){Object.assign(this,{canvas,onFrame,onError,onMetrics});this.controller=new AbortController();this.stopped=false;this.count=0;}
  stop(){this.stopped=true;this.controller.abort();this.reader?.cancel().catch(()=>{});if(this.decoder?.state!=='closed')this.decoder?.close();}
  async start(url){
    try{
      if(!globalThis.VideoDecoder)throw new Error('此运行环境不支持低延迟解码，请选择标准模式');
      const ctx=this.canvas.getContext('2d',{alpha:false});
      this.decoder=new VideoDecoder({output:frame=>{
        try{if(this.stopped)return;if(frame.displayWidth>4096||frame.displayHeight>2304)throw new Error('视频尺寸超出支持范围');
          this.canvas.width=frame.displayWidth;this.canvas.height=frame.displayHeight;ctx.drawImage(frame,0,0);this.onFrame(frame.timestamp/1e6);this.onMetrics(++this.count,this.decoder.decodeQueueSize);
        }catch(error){this.onError(error);this.stop();}finally{frame.close();}
      },error:()=>{this.onError(new Error('低延迟解码失败，请切换标准模式'));this.stop();}});
      const response=await fetch(url,{signal:this.controller.signal});if(!response.ok)throw new Error(`媒体连接失败（${response.status}）`);
      this.reader=response.body.getReader();let bytes=new Uint8Array(),header=false,configured=false,keySeen=false;
      const u24=(b,p)=>(b[p]<<16)|(b[p+1]<<8)|b[p+2];
      const u32=(b,p)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p);
      while(!this.stopped){
        const {done,value}=await this.reader.read();if(done)throw new Error('直播流已结束');
        const next=new Uint8Array(bytes.length+value.length);next.set(bytes);next.set(value,bytes.length);bytes=next;
        if(bytes.length>16*1024*1024)throw new Error('视频数据缓冲超出限制');
        if(!header){if(bytes.length<13)continue;if(bytes[0]!==70||bytes[1]!==76||bytes[2]!==86)throw new Error('低延迟模式只支持 FLV，请切换标准模式');const offset=u32(bytes,5);if(offset>1024)throw new Error('FLV 头无效');if(bytes.length<offset+4)continue;bytes=bytes.slice(offset+4);header=true;}
        let consumed=0;
        while(bytes.length-consumed>=15){
          const size=u24(bytes,consumed+1),end=consumed+11+size;if(size>8*1024*1024)throw new Error('视频分片过大');if(bytes.length<end+4)break;
          const type=bytes[consumed],dts=u24(bytes,consumed+4)+bytes[consumed+7]*16777216;
          if(type===9&&size>=5){
            const data=bytes.subarray(consumed+11,end),codec=data[0]&15;
            if(codec!==7)throw new Error('此直播不是 H.264/AVC，请切换标准模式');
            if(data[1]===0){
              if(data.length<9)throw new Error('AVC 配置无效');
              const description=data.slice(5);const config={codec:'avc1.'+[...description.slice(1,4)].map(x=>x.toString(16).padStart(2,'0')).join(''),description,optimizeForLatency:true};
              const support=await VideoDecoder.isConfigSupported(config);if(this.stopped)return;if(!support.supported)throw new Error('不支持该 AVC 编码配置');this.decoder.configure(config);configured=true;keySeen=false;
            }else if(data[1]===1&&configured){
              const isKey=(data[0]>>4)===1;if(isKey)keySeen=true;
              if(keySeen){let waited=0;while(this.decoder.decodeQueueSize>=6&&!this.stopped){await new Promise(r=>setTimeout(r,4));if((waited+=4)>250)throw new Error('解码跟不上直播，请切换标准模式');}
                if(this.stopped)return;let composition=u24(data,2);if(composition&0x800000)composition-=0x1000000;
                this.decoder.decode(new EncodedVideoChunk({type:isKey?'key':'delta',timestamp:(dts+composition)*1000,data:data.slice(5)}));
              }
            }
          }
          consumed=end+4;
        }
        bytes=bytes.slice(consumed);
      }
    }catch(error){if(!this.stopped){this.onError(error);this.stop();}}
  }
}
