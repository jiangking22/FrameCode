const RULES = Object.freeze({valorant:'[A-Z]{3}[0-9]{3}', delta:'[A-Z]{3}[0-9]{4}', 'delta-1v1':'[A-Z]{4}[0-9]{4}', generic:'[A-Z0-9]{6}'});
function candidate(text, rule) {
  if (!Object.hasOwn(RULES,rule)) throw new Error('未知识别规则');
  const expression=new RegExp(`(?<![A-Z0-9])${RULES[rule]}(?![A-Z0-9])`,'g');
  const matches=[...new Set(String(text).toUpperCase().match(expression)||[])];
  return matches.length===1 ? matches[0] : null;
}
class Confirmation {
  start(rule,session,stableMs=150) {
    if (!Object.hasOwn(RULES,rule)) throw new Error('未知识别规则');
    if(![100,150].includes(stableMs))throw new Error('无效确认时间');
    Object.assign(this,{rule,session,stableMs,active:true,code:null,count:0,since:0,lastFrame:-1,lastAt:-Infinity});
  }
  stop() { this.active=false; this.code=null; this.count=0; }
  observe({session,frame,at,text,confidence}) {
    const no={confirmed:false,code:null};
    if (!this.active || session!==this.session || !Number.isSafeInteger(frame) || frame<=this.lastFrame || !Number.isFinite(at) || at<this.lastAt) return no;
    this.lastFrame=frame; this.lastAt=at;
    const code=Number.isFinite(confidence)&&confidence>=80 ? candidate(text,this.rule) : null;
    if (!code) { this.code=null; this.count=0; return no; }
    if(code!==this.code) {this.code=code; this.count=1; this.since=at;}
    else this.count++;
    const confirmed=this.count>=2 && at-this.since>=this.stableMs;
    if(confirmed) this.active=false;
    return {confirmed,code,count:this.count};
  }
}
function regionPixels(r,width,height) {
  if(!r || ![r.x,r.y,r.w,r.h,width,height].every(Number.isFinite) || width<=0 || height<=0 || r.x<0 || r.y<0 || r.w<=0 || r.h<=0 || r.x+r.w>1.000001 || r.y+r.h>1.000001) throw new Error('选区尺寸无效');
  const x=Math.floor(r.x*width),y=Math.floor(r.y*height);
  return {x,y,w:Math.min(width,Math.ceil((r.x+r.w)*width))-x,h:Math.min(height,Math.ceil((r.y+r.h)*height))-y};
}
function validateUrl(value) {
  if(typeof value!=='string'||value.length>8192) throw new Error('请输入公开直播链接或媒体流地址');
  let url; try {url=new URL(value);} catch {throw new Error('链接格式无效');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('仅支持不含登录信息的 HTTP/HTTPS 地址');
  return url;
}
module.exports={RULES,candidate,Confirmation,regionPixels,validateUrl};
