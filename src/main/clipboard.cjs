async function writeVerified(clipboard,text,current,delay=ms=>new Promise(r=>setTimeout(r,ms))){
  for(let attempt=0;attempt<5;attempt++){
    if(!current())throw new Error('复制已取消');
    await clipboard.writeText(text);await delay(60);
    if(!current())throw new Error('复制已取消');
    if(await clipboard.readText()===text)return;
  }
  throw new Error('剪贴板被其他程序占用，请重新识别或手动复制');
}
module.exports={writeVerified};
