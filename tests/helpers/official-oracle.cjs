// Independent test oracle: talks directly to the installed official worker.
// Do not import the production client here: parity must exercise both adapters.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {inflateSync}=require('node:zlib');
const {spawn,execFileSync}=require('node:child_process');
const {requireFixture}=require('./private-fixtures.cjs');

const installedRuntime=process.env.FRAMECODE_OFFICIAL_OCR||path.join(process.env.LOCALAPPDATA||'', 'com.administrator.fps-vantix/LivePlayerHost/runtime/ocr');
function decodePng(bytes){
  if(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('PNG signature invalid');
  let width,height,depth,color,interlace;const idat=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];}
    if(type==='IDAT')idat.push(data);
    offset+=length+12;
  }
  if(depth!==8||![2,6].includes(color)||interlace!==0)throw new Error('Test PNG decoder requires noninterlaced 8-bit RGB/RGBA');
  const channels=color===6?4:3,stride=width*channels,packed=inflateSync(Buffer.concat(idat));
  if(packed.length!==(stride+1)*height)throw new Error('PNG pixel length invalid');
  const raw=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=packed[y*(stride+1)],row=y*stride;
    for(let x=0;x<stride;x++){
      const a=x>=channels?raw[row+x-channels]:0,b=y?raw[row+x-stride]:0,c=y&&x>=channels?raw[row+x-stride-channels]:0;
      const predictors=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)];
      if(filter>4)throw new Error('PNG filter invalid');
      raw[row+x]=(packed[y*(stride+1)+1+x]+predictors[filter])&255;
    }
  }
  if(channels===4)return {width,height,rgba:raw};
  const rgba=Buffer.alloc(width*height*4);
  for(let source=0,target=0;source<raw.length;source+=3,target+=4){raw.copy(rgba,target,source,source+3);rgba[target+3]=255;}
  return {width,height,rgba};
}
function cropRgba(image,region){
  if(!region)return image;
  const {x,y,w:width,h:height}=region,rgba=Buffer.alloc(width*height*4);
  for(let row=0;row<height;row++)image.rgba.copy(rgba,row*width*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4);
  return {width,height,rgba};
}
function decodeGdi(bytes){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'framecode-gdi-oracle-'));
  try{
    const source=path.join(temporary,'encoded-image'),output=path.join(temporary,'bgra.bin');
    fs.writeFileSync(source,bytes);
    execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),[
      '-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'decode-gdi.ps1'),'-InputPath',source,'-OutputPath',output
    ],{windowsHide:true,stdio:'pipe',timeout:10000});
    const decoded=fs.readFileSync(output),width=decoded.readInt32LE(0),height=decoded.readInt32LE(4),rgba=decoded.subarray(8);
    if(width<1||height<1||rgba.length!==width*height*4)throw new Error('GDI oracle returned an invalid bitmap');
    for(let offset=0;offset<rgba.length;offset+=4){const blue=rgba[offset];rgba[offset]=rgba[offset+2];rgba[offset+2]=blue;}
    return {width,height,rgba};
  }finally{
    if(!path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Refusing to remove oracle temporary directory outside temp');
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
class InstalledWorkerOracle{
  constructor(runtime=installedRuntime){this.runtime=runtime;this.sequence=0;this.pending=null;this.bytes=Buffer.alloc(0);this.stderr='';}
  async recognize(image,pattern){
    if(this.pending)throw new Error('Oracle requests must be serial');
    if(!this.child){
      const child=spawn(path.join(this.runtime,'room-code-assistant-worker.exe'),['ipc'],{
        cwd:this.runtime,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,
          TESSDATA_PREFIX:path.join(this.runtime,'tessdata'),TESSERACT_DLL:path.join(this.runtime,'libtesseract-5.dll'),
          TESSERACT_LANG:'eng',TESSERACT_WHITELIST:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',OCR_TIMING:'1'}
      });
      this.child=child;
      child.stdout.on('data',chunk=>{this.bytes=Buffer.concat([this.bytes,chunk]);this.read();});
      child.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk).slice(-16000);});
      child.on('error',error=>this.fail(error));
      child.on('exit',(code,signal)=>{this.child=null;this.fail(new Error(`Installed worker exited (${code}, ${signal}): ${this.stderr}`));});
    }
    const sequence=++this.sequence,header=Buffer.from(JSON.stringify({sequence,width:image.width,height:image.height,pattern,required_frames:1,rgba_len:image.rgba.length}));
    const prefix=Buffer.alloc(4);prefix.writeUInt32LE(header.length);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.fail(new Error(`Installed worker timed out: ${this.stderr}`));this.close();},10000);
      this.pending={sequence,resolve,reject,timer};
      this.child.stdin.write(Buffer.concat([prefix,header,image.rgba]));
    });
  }
  read(){
    if(this.bytes.length<4)return;
    const length=this.bytes.readUInt32LE(0);
    if(length>16_000_000){this.fail(new Error('Installed worker response too large'));return;}
    if(this.bytes.length<length+4)return;
    const bytes=this.bytes.subarray(4,length+4);this.bytes=this.bytes.subarray(length+4);
    let value;try{value=JSON.parse(bytes.toString('utf8'));}catch(error){this.fail(error);return;}
    const pending=this.pending;
    if(!pending||pending.sequence!==value.sequence){this.fail(new Error('Installed worker sequence mismatch'));return;}
    this.pending=null;clearTimeout(pending.timer);pending.resolve(value);
  }
  fail(error){if(this.pending){const pending=this.pending;this.pending=null;clearTimeout(pending.timer);pending.reject(error);}}
  close(){this.fail(new Error('Installed worker oracle closed'));this.child?.kill();this.child=null;this.bytes=Buffer.alloc(0);}
}
const observation=value=>Object.fromEntries(['type','raw','candidate','confidence','error'].map(key=>[key,value[key]]));
const readFixture=name=>decodePng(fs.readFileSync(requireFixture(name)));
module.exports={InstalledWorkerOracle,installedRuntime,decodePng,decodeGdi,cropRgba,readFixture,observation};
