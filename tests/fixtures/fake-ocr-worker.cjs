// A controlled stand-in for the binary length-prefixed IPC protocol.
let bytes=Buffer.alloc(0);
const mode=process.argv[2];
function respond(header){
  if(mode==='exit')process.exit(17);
  if(mode==='timeout')return;
  const value={type:'observation',sequence:header.sequence,raw:header.pattern,candidate:header.pattern,confidence:91.75,error:null,
    request:{width:header.width,height:header.height,required_frames:header.required_frames,rgba_len:header.rgba_len}};
  if(mode==='wrong-sequence')value.sequence++;
  const data=Buffer.from(mode==='invalid-json'?'not-json':JSON.stringify(value)),prefix=Buffer.alloc(4);prefix.writeUInt32LE(data.length);
  const packet=Buffer.concat([prefix,data]);
  // Fragment the length and UTF-8 payload across arbitrary stream boundaries.
  if(mode==='split'){
    const cuts=[1,3,6,13,packet.length];let start=0;
    for(let index=0;index<cuts.length;index++){const part=packet.subarray(start,cuts[index]);start=cuts[index];setTimeout(()=>process.stdout.write(part),index*4);}
  }else setTimeout(()=>process.stdout.write(packet),mode==='delayed'?150:0);
}
process.stdin.on('data',chunk=>{
  bytes=Buffer.concat([bytes,chunk]);
  for(;;){
    if(bytes.length<4)return;
    const length=bytes.readUInt32LE(0);if(bytes.length<4+length)return;
    const header=JSON.parse(bytes.toString('utf8',4,4+length));
    if(bytes.length<4+length+header.rgba_len)return;
    bytes=bytes.subarray(4+length+header.rgba_len);respond(header);
  }
});
