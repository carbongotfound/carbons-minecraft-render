const KEY='carbon-browser-options-v1';
export function installBrowserExperience(upgrade) {
  const g=upgrade.g,a=upgrade.a,$=id=>document.getElementById(id);
  let options={compact:true};try{options.compact=JSON.parse(localStorage.getItem(KEY)||'{}').compact!==false;}catch{}
  const state=g.browser={sprint:false,hiddenHUD:false};
  let sprinting=false;
  Object.defineProperty(state,'sprint',{enumerable:true,get:()=>sprinting,set:value=>{sprinting=!!value;$('touchSprint')?.setAttribute('aria-pressed',String(sprinting));}});
  const apply=()=>{document.body.dataset.compactHud=String(options.compact);compact.textContent='Compact HUD: '+(options.compact?'ON':'OFF');compact.setAttribute('aria-pressed',String(options.compact));};
  const compact=document.createElement('button');compact.id='compactHUD';compact.className='wide';
  compact.onclick=()=>{options.compact=!options.compact;apply();try{localStorage.setItem(KEY,JSON.stringify(options));}catch{}};
  $('helpBtn').before(compact);apply();
  const fullscreen=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{a.toast('Fullscreen is unavailable. You can still play in this browser window.');}};
  for(const [id,parent]of [['fullscreenBtn',$('helpBtn')],['titleFullscreen',$('titleRecovery')||$('joinForm')]]){
    const b=document.createElement('button');b.id=id;b.type='button';b.className='wide';b.textContent='Fullscreen';b.onclick=fullscreen;
    if(id==='fullscreenBtn')parent.before(b);else parent.after(b);
  }
  const updateFullscreen=()=>{for(const id of ['fullscreenBtn','titleFullscreen'])$(id).textContent=document.fullscreenElement?'Exit fullscreen':'Fullscreen';};
  document.addEventListener('fullscreenchange',updateFullscreen);
  $('world').tabIndex=0;$('world').setAttribute('aria-label','Survival world. WASD to move, Space to jump, left click to mine, right click to place.');
  $('help').insertAdjacentHTML('beforeend','<p>F1: hide or show the HUD. Fullscreen gives the game more room. Compact HUD hides the minimap and extra readings; M still opens the map.</p>');
  window.addEventListener('keydown',e=>{
    if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;
    if(e.code==='F1'&&g.playing&&!a.panel){e.preventDefault();if(!e.repeat){state.hiddenHUD=!state.hiddenHUD;document.body.dataset.hideHud=String(state.hiddenHUD);}}
    if(e.code==='Escape'){state.hiddenHUD=false;document.body.dataset.hideHud='false';state.sprint=false;}
  });
  window.addEventListener('blur',()=>{state.sprint=false;});
  if(matchMedia('(pointer:coarse)').matches){
    const sprint=document.createElement('button');sprint.id='touchSprint';sprint.textContent='Sprint';sprint.setAttribute('aria-pressed','false');sprint.onclick=()=>{state.sprint=!state.sprint;sprint.setAttribute('aria-pressed',String(state.sprint));};
    const sneak=document.createElement('button');sneak.id='touchSneak';sneak.textContent='Sneak';
    sneak.onpointerdown=e=>{e.preventDefault();sneak.setPointerCapture(e.pointerId);a.keys.add('ShiftLeft');};
    sneak.onpointerup=sneak.onpointercancel=()=>a.keys.delete('ShiftLeft');
    document.querySelector('.touch-actions').append(sprint,sneak);
  }
  return state;
}
