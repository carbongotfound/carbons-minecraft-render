/** Stable first-person input and shortest-angle interpolation. Pure, unit-testable math. */
export const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const damp=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*Math.max(0,dt)));
export class LookInput {
 constructor(){this.sensitivity=.0022;this.dx=0;this.dy=0;this.ignoreUntil=0;this.droppedSpikes=0;this.last=-Infinity;}
 reset(now=0){this.dx=this.dy=0;this.ignoreUntil=now+70;this.last=now;}
 push(dx,dy,now=0,width=1920,height=1080){
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||now<this.ignoreUntil)return false;
  // Pointer-lock transitions can report a desktop-sized jump. Never apply that as a turn.
  if(Math.abs(dx)>Math.max(900,width*1.25)||Math.abs(dy)>Math.max(700,height*1.25)){this.droppedSpikes++;return false;}
  this.dx+=dx;this.dy+=dy;this.last=now;return true;
 }
 apply(player){const x=this.dx,y=this.dy;this.dx=this.dy=0;player.yaw=Math.atan2(Math.sin(player.yaw-x*this.sensitivity),Math.cos(player.yaw-x*this.sensitivity));player.pitch=clamp(player.pitch-y*this.sensitivity,-Math.PI/2+.015,Math.PI/2-.015);return {x,y};}
}
export function interpolatedPose(a,b,t){return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:a.yaw+angleDelta(b.yaw,a.yaw)*t,pitch:a.pitch+(b.pitch-a.pitch)*t};}
export function validStack(s,items){return !!s&&!!items[s.id]&&Number.isInteger(s.count)&&s.count>0&&s.count<=(items[s.id].max||64)&&Number.isFinite(s.wear||0)&&(s.wear||0)>=0;}
