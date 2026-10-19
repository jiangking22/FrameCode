const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {MediaRelay}=require('../src/main/media.cjs');
test('relay protects routes, rewrites playlists and invalidates stopped sessions',async()=>{
 const upstream=http.createServer((req,res)=>{if(req.url==='/live.m3u8')res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'}).end('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXTINF:2,\npart.ts\n');else res.end('fixture');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const relay=new MediaRelay('');await relay.start();
 try{
  const origin=`http://127.0.0.1:${upstream.address().port}`;
  assert.equal((await fetch(relay.base.replace(relay.token,'wrong')+'a')).status,403);
  const source=await relay.resolve(origin+'/live.m3u8');assert.equal(source.format,'hls');
  const text=await(await fetch(source.url)).text();assert.match(text,/URI="http:\/\/127.0.0.1:/);assert.ok(!text.includes('part.ts'));
  const segment=text.split('\n').find(s=>s.startsWith('http:'));assert.equal(await(await fetch(segment)).text(),'fixture');
  relay.stop();assert.equal((await fetch(source.url)).status,404);
 }finally{relay.close();await new Promise(r=>upstream.close(r));}
});
