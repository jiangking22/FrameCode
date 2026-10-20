const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {packager}=require('@electron/packager');

const root=path.resolve(__dirname,'..');
const dist=path.join(root,'dist');
const buildName='FrameCode-win32-x64';
const build=path.join(dist,buildName);
const zip=path.join(dist,`FrameCode-${require(path.join(root,'package.json')).version}-win32-x64.zip`);
const installer=path.join(root,'installer','FrameCode.iss');

function findInnoCompiler(){
  if(process.env.INNO_SETUP_ISCC){
    if(!fs.existsSync(process.env.INNO_SETUP_ISCC))throw new Error(`找不到 Inno Setup 编译器：${process.env.INNO_SETUP_ISCC}`);
    return process.env.INNO_SETUP_ISCC;
  }
  const roots=[process.env['ProgramFiles(x86)'],process.env.ProgramFiles,process.env.LOCALAPPDATA].filter(Boolean);
  for(const directory of roots){
    const candidate=path.join(directory,'Inno Setup 6','ISCC.exe');
    if(fs.existsSync(candidate))return candidate;
  }
  throw new Error('缺少 Inno Setup 6，请安装后设置 INNO_SETUP_ISCC 环境变量再运行 npm run package');
}

function insideDist(target){
  const resolved=path.resolve(target);
  if(!resolved.startsWith(dist+path.sep))throw new Error(`拒绝操作 dist 目录之外的路径：${resolved}`);
  return resolved;
}
function requireFile(relative){
  const target=path.join(root,relative);
  if(!fs.existsSync(target))throw new Error(`打包缺少文件：${relative}`);
  return target;
}
function run(file,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(file,args,{windowsHide:true,stdio:'inherit'});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`${path.basename(file)} 退出码 ${code}`)));
  });
}
function findElectronZip(version){
  const name=`electron-v${version}-win32-x64.zip`;
  const roots=[process.env.ELECTRON_CACHE,process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'electron','Cache')].filter(Boolean);
  const seen=new Set();
  function visit(directory,depth){
    if(depth>3||seen.has(directory))return null;
    seen.add(directory);
    let entries;
    try{entries=fs.readdirSync(directory,{withFileTypes:true});}catch{return null;}
    for(const entry of entries){
      const target=path.join(directory,entry.name);
      if(entry.isFile()&&entry.name===name)return target;
      if(entry.isDirectory()){
        const found=visit(target,depth+1);
        if(found)return found;
      }
    }
    return null;
  }
  for(const directory of roots){
    const found=visit(directory,0);
    if(found)return found;
  }
  return null;
}
async function assertPackaged(relative){
  const file=path.join(build,'resources','app',relative);
  if(!fs.existsSync(file))throw new Error(`生成的应用缺少运行文件：${relative}`);
}

(async()=>{
  const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const required=[
    'src/main/app.cjs',
    'src/main/ocr.cjs',
    'src/core/recognition.cjs',
    'src/core/settings.cjs',
    'src/ui/index.html',
    'native/input.ps1',
    'resources/demo.mp4',
    'resources/streamlink/streamlink-8.6.2-1-py314-x86_64/bin/streamlink.exe',
    'resources/ocr-runtime/room-code-assistant-worker.exe',
    'resources/ocr-runtime/libtesseract-5.dll',
    'resources/ocr-runtime/tessdata/eng.traineddata',
    'resources/ocr-runtime/manifest.sha256.json',
    'resources/third-party/README.md',
    'resources/third-party/license-sources.json',
    'node_modules/mpegts.js/dist/mpegts.js',
    'node_modules/hls.js/dist/hls.min.js'
  ];
  required.forEach(requireFile);
  await require('../src/main/ocr.cjs').verifyRuntime(root);
  await run(process.execPath,['--test',path.join(root,'tests/ocr-runtime.test.cjs')]);
  const innoCompiler=findInnoCompiler();

  fs.mkdirSync(dist,{recursive:true});
  for(const target of [build,zip])if(fs.existsSync(insideDist(target)))fs.rmSync(insideDist(target),{recursive:true,force:true});

  const electronVersion=JSON.parse(fs.readFileSync(path.join(root,'node_modules/electron/package.json'),'utf8')).version;
  const electronZip=findElectronZip(electronVersion);
  if(electronZip)console.log(`Using cached Electron runtime: ${electronZip}`);
  const output=await packager({
    dir:root,
    out:dist,
    platform:'win32',
    arch:'x64',
    name:'FrameCode',
    appVersion:packageJson.version,
    overwrite:true,
    prune:true,
    asar:false,
    ...(electronZip?{electronZipDir:path.dirname(electronZip)}:{}),
    ignore:[
      /^\/(?:\.git|\.gitignore|artifacts|dist|docs|tests|scripts)(?:\/|$)/,
      /^\/installer(?:\/|$)/,
      /^\/README\.md$/,
      /^\/(?:node_modules|resources\/streamlink)\/.*\/(?:test|tests|__tests__|_tests|SelfTest)(?:\/|$)/i,
      /^\/package-lock\.json$/,
      /^\/SPEC\.md$/,
      /^\/artifacts-audit\.json$/,
      /^\/resources\/ocr(?:\/|$)/,
      /^\/resources\/(?:demo\.(?:flv|png)|streamlink\.zip)$/
    ]
  });
  if(output.length!==1||path.resolve(output[0])!==build)throw new Error('打包器返回了意外的输出目录');

  for(const relative of required.filter(item=>!item.startsWith('resources/streamlink/')))await assertPackaged(relative);
  await assertPackaged('resources/streamlink/streamlink-8.6.2-1-py314-x86_64/bin/streamlink.exe');
  await require('../src/main/ocr.cjs').verifyRuntime(path.join(build,'resources/app'));

  const runtimePackage={...packageJson};
  delete runtimePackage.scripts;
  delete runtimePackage.devDependencies;
  await fs.promises.writeFile(path.join(build,'resources/app/package.json'),JSON.stringify(runtimePackage,null,2)+'\n');
  const guide=fs.readFileSync(path.join(root,'README.md'),'utf8').split('\n## 源码运行与打包')[0].trim()+'\n';
  await fs.promises.writeFile(path.join(build,'使用说明.md'),guide);
  await run(process.execPath,[path.join(root,'scripts/smoke-installed.cjs'),
    path.join(build,'FrameCode.exe'),path.join(root,'artifacts',`package-${packageJson.version}`)]);

  await run(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),[
    '-NoLogo','-NoProfile','-NonInteractive','-Command',
    `Compress-Archive -LiteralPath '${build.replaceAll("'","''")}' -DestinationPath '${zip.replaceAll("'","''")}' -CompressionLevel Optimal`
  ]);
  const innoSetupEnv={...process.env,FRAMECODE_APP_VERSION:packageJson.version,FRAMECODE_APP_SOURCE_DIR:build};
  await new Promise((resolve,reject)=>{
    const child=spawn(innoCompiler,['/Q',installer,`/O${dist}`],{windowsHide:true,stdio:'inherit',env:innoSetupEnv});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`Inno Setup 退出码 ${code}`)));
  });
  const setup=path.join(dist,`FrameCode-${packageJson.version}-win32-x64-Setup.exe`);
  if(!fs.existsSync(setup)||fs.statSync(setup).size<50*1024*1024)throw new Error('未生成包含完整离线资源的安装包');
  const mb=value=>`${(value/1024/1024).toFixed(1)} MB`;
  console.log(`PACKAGED ${build}`);
  console.log(`ZIP ${zip} (${mb(fs.statSync(zip).size)})`);
  console.log(`SETUP ${setup} (${mb(fs.statSync(setup).size)})`);
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
