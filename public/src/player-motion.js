// Movement uses blocks/second. Ground friction and air control are independent
// of the renderer's frame rate and never add speed to diagonal input.
export const PLAYER_MOTION = Object.freeze({walk:4.317,sprint:5.612,sneak:1.3,swim:2.2,jump:8.4,gravity:32});

export function verticalMotion(velocity,dt) {
  dt=Math.max(0,Math.min(.1,Number(dt)||0));
  const next=Math.max(-45,velocity-PLAYER_MOTION.gravity*dt);
  return {velocity:next,distance:(velocity+next)*.5*dt};
}

export function horizontalMotion(state, {forward=0,side=0,yaw=0,speed=PLAYER_MOTION.walk,grounded=false,water=false,active=true}, dt) {
  dt=Math.max(0,Math.min(.1,Number(dt)||0));
  const length=Math.max(1,Math.hypot(forward,side));
  const tx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)*speed/length;
  const tz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*speed/length;
  if(!active){state.x=state.z=0;return {x:0,z:0};}
  const rate=water?7:grounded?24:5;
  const factor=1-Math.exp(-rate*dt);
  const oldX=state.x||0,oldZ=state.z||0;
  state.x=oldX+(tx-oldX)*factor;state.z=oldZ+(tz-oldZ)*factor;
  // Integrate the exponential exactly instead of using end-of-frame velocity.
  return {x:tx*dt+(oldX-tx)*factor/rate,z:tz*dt+(oldZ-tz)*factor/rate};
}
