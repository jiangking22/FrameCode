// Real game screenshots and their expected codes stay outside published Git data.
const fs=require('node:fs');
const path=require('node:path');

const directory=path.resolve(process.env.FRAMECODE_TEST_FIXTURES||path.join(__dirname,'../fixtures'));
const gameImages=Object.freeze(['valorant-room.png','valorant-dialog-075.png','valorant-dialog-050.png','valorant-user-room.png']);
const manifestName='valorant-dialog-downscales.json';
function fixturePath(name){
  if(typeof name!=='string'||!name||path.basename(name)!==name||name==='.'||name==='..')throw new Error('Invalid private fixture filename');
  return path.join(directory,name);
}
function missingFixtures(names){
  return [...new Set(names)].filter(name=>{try{return !fs.statSync(fixturePath(name)).isFile();}catch{return true;}});
}
function missingMessage(names){
  return `Missing private OCR test fixtures: ${names.join(', ')}. These files are excluded from the repository. Set FRAMECODE_TEST_FIXTURES to your local private fixture directory (default: tests/fixtures).`;
}
function requireFixtures(names){
  const missing=missingFixtures(names);if(missing.length)throw new Error(missingMessage(missing));
}
function requireFixture(name){requireFixtures([name]);return fixturePath(name);}
function loadGameFixture(){
  const manifest=JSON.parse(fs.readFileSync(requireFixture(manifestName),'utf8'));
  if(typeof manifest.source!=='string'||!manifest.source.endsWith('.png')||typeof manifest.expectedRoomCode!=='string'||!/^[A-Z]{3}[0-9]{3}$/.test(manifest.expectedRoomCode)){
    throw new Error('Private OCR fixture manifest must provide a PNG source filename and a valid expectedRoomCode.');
  }
  return {source:requireFixture(manifest.source),expectedRoomCode:manifest.expectedRoomCode};
}
module.exports={directory,gameImages,fixturePath,requireFixture,requireFixtures,missingFixtures,missingMessage,loadGameFixture};
