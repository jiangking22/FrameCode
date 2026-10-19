const http=require('node:http');
const {randomBytes}=require('node:crypto');
const {Readable}=require('node:stream');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {validateUrl}=require('../core/recognition.cjs');
class MediaRelay {
  constructor(root){this.root=root;this.resources=new Map();this.controllers=new Set();this.token=randomBytes(24).toString('hex');this.generation=0;}
  async start(){
    this.server=http.createServer((req,res)=>this.serve(req,res));
    await new Promise(resolve=>this.server.listen(0,'127.0.0.1',resolve));
    this.base=`http://127.0.0.1:${this.server.address().port}/${this.token}/`;
  }
  stop(){this.generation++;this.resolver?.kill();this.resolver=null;for(const c of this.controllers)c.abort();this.controllers.clear();this.resources.clear();}
  add(url,headers={}){
    validateUrl(url);for(const [id,r] of this.resources)if(r.url===url)return this.base+id;
    if(this.resources.size>1024)this.resources.delete(this.resources.keys().next().value);
    const id=randomBytes(12).toString('hex');this.resources.set(id,{url,headers});return this.base+id;
  }
  async serve(req,res){
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'||!req.url.startsWith('/'+this.token+'/')){res.writeHead(403).end();return;}
    const source=this.resources.get(req.url.slice(this.token.length+2));if(!source){res.writeHead(404).end();return;}
    const controller=new AbortController();this.controllers.add(controller);res.on('close',()=>controller.abort());
    const timer=setTimeout(()=>controller.abort(),20000);
    try{
      const headers={...source.headers};if(req.headers.range)headers.Range=req.headers.range;
      const upstream=await fetch(source.url,{headers,signal:controller.signal});clearTimeout(timer);
      if(!upstream.ok){res.writeHead(upstream.status).end();return;}
      const type=upstream.headers.get('content-type')||'';
      if(/mpegurl/i.test(type)||/\.m3u8(?:[?#]|$)/i.test(source.url)){
        const raw=await upstream.text();if(raw.length>2_000_000)throw new Error('playlist too large');
        const playlist=raw.split(/\r?\n/).map(line=>{
          if(line.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_,url)=>`URI="${this.add(new URL(url,upstream.url).href,source.headers)}"`);
          return line.trim()?this.add(new URL(line.trim(),upstream.url).href,source.headers):line;
        }).join('\n');
        res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'}).end(playlist);
      }else{
        for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)res.setHeader(key,value);}
        res.writeHead(upstream.status);Readable.fromWeb(upstream.body).on('error',()=>res.destroy()).pipe(res);
        await new Promise(resolve=>{res.on('close',resolve);res.on('finish',resolve);});
      }
    }catch{if(!res.headersSent)res.writeHead(502).end('Media unavailable');else res.destroy();}
    finally{clearTimeout(timer);this.controllers.delete(controller);}
  }
  async resolve(address,quality='best'){
    const url=validateUrl(address);this.stop();const generation=this.generation;
    if(/\.(flv|m3u8|mp4|webm)(?:[?#]|$)/i.test(url.href))return {url:this.add(url.href),format:/\.m3u8/i.test(url.pathname)?'hls':/\.flv/i.test(url.pathname)?'flv':'file',label:url.hostname};
    const exe=path.join(this.root,'resources/streamlink/streamlink-8.6.2-1-py314-x86_64/bin/streamlink.exe');
    if(!fs.existsSync(exe))throw new Error('缺少直播解析组件；仍可使用桌面采集或直接媒体地址');
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(exe,['--json','--loglevel','none','--stream-timeout','15',url.href],{windowsHide:true});this.resolver=child;
      let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('直播解析超时，请确认直播间正在开播'));},45000);
      child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8_000_000)child.kill();});child.stderr.resume();
      child.on('error',()=>{clearTimeout(timer);reject(new Error('无法启动直播解析组件'));});
      child.on('exit',code=>{clearTimeout(timer);if(this.resolver===child)this.resolver=null;if(code!==0){reject(new Error('未取得直播流，请确认开播状态和平台支持，或使用桌面采集'));return;}try{resolve(JSON.parse(output));}catch{reject(new Error('直播解析返回格式异常'));}});
    });
    if(generation!==this.generation)throw new Error('播放请求已取消');
    const stream=result.streams?.[quality]||result.streams?.best||result;
    if(typeof stream.url!=='string')throw new Error('该直播间没有可用的视频流');
    const headers={};for(const key of ['User-Agent','Referer','Origin','Cookie','Accept','Accept-Language','user-agent','referer','origin','cookie','accept','accept-language'])if(typeof stream.headers?.[key]==='string')headers[key]=stream.headers[key];
    const format=stream.type==='hls'||/\.m3u8/i.test(stream.url)?'hls':'flv';
    return {url:this.add(stream.url,headers),format,label:url.hostname};
  }
  close(){this.stop();this.server?.close();}
}
module.exports={MediaRelay};
