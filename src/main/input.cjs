const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const path=require('node:path');
class InputBridge {
  constructor(root) {this.root=root;this.pending=new Map();this.sequence=0;}
  start() {
    if(this.child)return;
    const child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.root,'native/input.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;this.stderr='';
    child.stderr.on('data',b=>{this.stderr=(this.stderr+b).slice(-2000);});
    createInterface({input:child.stdout}).on('line',line=>{
      let r;try{r=JSON.parse(line);}catch{return;}
      const p=this.pending.get(r.id);if(!p)return;
      clearTimeout(p.timer);this.pending.delete(r.id);
      if(r.ok)p.resolve(r.value);
      else {
        const reason=r.error||'Windows 输入组件未返回详情';
        let message=reason;
        if(reason.startsWith('Target integrity higher:'))message='游戏的运行权限高于 FrameCode。请退出并右键“以管理员身份运行”本工具，再重新记录位置。 详情：'+reason;
        else if(reason==='Input integrity could not be verified')message='无法核验游戏输入权限，已停止自动操作。请核对游戏与工具的运行权限。';
        else if(reason.startsWith('Windows refused input:'))message+=' 若游戏以管理员身份运行，请以相同权限运行本工具。房间码仍在剪贴板中。';
        p.reject(new Error('自动输入未完成：'+message));
      }
    });
    const failed=()=>{if(this.child===child)this.child=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('Windows 输入组件不可用'));}this.pending.clear();};
    child.on('error',failed);child.on('exit',failed);
  }
  request(command,data={}) {
    this.start();const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('输入组件超时'));},15000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.stdin.write(JSON.stringify({id,command,...data})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
    });
  }
  async record(ownPid) {
    const fields=String(await this.request('record')).split(',').map(Number);
    if(fields.length!==8||!fields.every(Number.isFinite)||fields[1]===ownPid||fields[0]===0)throw new Error('请先把鼠标移到游戏按钮，并让游戏窗口处于前台');
    const [hwnd,pid,x,y,l,t,r,b]=fields;
    await this.request('access',{pid});
    return {hwnd,pid,x,y,l,t,r,b};
  }
  async execute(mode,points,timing,signal) {
    const check=()=>{if(signal.aborted)throw new Error('操作已停止');};
    check();const join=points.join,paste=points.paste;
    if(!join || mode==='buttons'&&(!paste||paste.hwnd!==join.hwnd||paste.pid!==join.pid))throw new Error('请在同一个游戏窗口重新记录操作位置');
    if(mode==='keyboard')await this.request('paste',join);
    else await this.request('click',{...paste,settle:timing.settle,hold:timing.hold});
    await new Promise(resolve=>setTimeout(resolve,timing.gap));check();
    await this.request('click',{...join,settle:timing.settle,hold:timing.hold});
    check();return '操作已发送；请在游戏中确认是否加入';
  }
  close(){this.child?.stdin.end();}
}
module.exports={InputBridge};


