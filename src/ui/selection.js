export class RegionSelection {
  constructor(shell,surface,overlay,onChange){Object.assign(this,{shell,surface,overlay,onChange});this.region=null;this.selecting=false;
    shell.addEventListener('pointerdown',e=>{if(!this.selecting)return;this.start=this.position(e);shell.setPointerCapture(e.pointerId);});
    shell.addEventListener('pointermove',e=>{if(!this.selecting||!this.start)return;const p=this.position(e);this.set({x:Math.min(p.x,this.start.x),y:Math.min(p.y,this.start.y),w:Math.abs(p.x-this.start.x),h:Math.abs(p.y-this.start.y)},false);});
    shell.addEventListener('pointerup',()=>{if(!this.selecting||!this.start)return;this.start=null;this.enable(false);if(!this.region||this.region.w<.01||this.region.h<.01)this.set(null);else this.onChange(this.region);});
    new ResizeObserver(()=>this.paint()).observe(shell);
  }
  bounds(){const r=this.shell.getBoundingClientRect(),scale=Math.min(r.width/this.surface.width,r.height/this.surface.height),w=this.surface.width*scale,h=this.surface.height*scale;return {x:(r.width-w)/2,y:(r.height-h)/2,w,h,left:r.left,top:r.top};}
  position(e){const b=this.bounds();return {x:Math.max(0,Math.min(1,(e.clientX-b.left-b.x)/b.w)),y:Math.max(0,Math.min(1,(e.clientY-b.top-b.y)/b.h))};}
  enable(value){this.selecting=value;this.start=null;this.shell.style.cursor=value?'crosshair':'';document.querySelector('#select-tip').hidden=!value;}
  set(region,notify=true){this.region=region;this.paint();if(notify)this.onChange(region);}
  paint(){const r=this.region;this.overlay.hidden=!r;if(!r)return;const b=this.bounds();Object.assign(this.overlay.style,{left:`${b.x+r.x*b.w}px`,top:`${b.y+r.y*b.h}px`,width:`${r.w*b.w}px`,height:`${r.h*b.h}px`});}
  crop(target,surface=this.surface){const r=this.region;if(!r||r.w<=0||r.h<=0)return false;
    const sourceWidth=surface.videoWidth||surface.width,sourceHeight=surface.videoHeight||surface.height;
    if(!sourceWidth||!sourceHeight)return false;
    // Crop in source pixels and cap output width without enlarging the image.
    const left=Math.max(0,Math.min(sourceWidth,Math.floor(r.x*sourceWidth)));
    const top=Math.max(0,Math.min(sourceHeight,Math.floor(r.y*sourceHeight)));
    const right=Math.max(left,Math.min(sourceWidth,Math.ceil((r.x+r.w)*sourceWidth)));
    const bottom=Math.max(top,Math.min(sourceHeight,Math.ceil((r.y+r.h)*sourceHeight)));
    const sw=right-left,sh=bottom-top;if(!sw||!sh)return false;
    const scale=Math.min(1,1280/sw);
    target.width=Math.max(1,Math.round(sw*scale));target.height=Math.max(1,Math.round(sh*scale));
    const context=target.getContext('2d',{alpha:false,willReadFrequently:false});
    if(!context)return false;
    context.drawImage(surface,left,top,sw,sh,0,0,target.width,target.height);
    return true;
  }
}
