export const RESOLUTIONS=['native','960x540','1280x720','1920x1080','2560x1440','3840x2160'];
export const AA_MODES=['none','fxaa','smaa','msaa'];
export const DEFAULT_OPTIONS={sensitivity:1,fov:75,bob:true,shadows:false,renderDistance:4,shadowDistance:48,resolution:'native',aa:'none',maxLights:8,smoothLighting:true,sound:false,viewMode:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function cleanOptions(value={}){
 const out={...DEFAULT_OPTIONS};
 for(const [k,a,b] of [['sensitivity',.25,2.5],['fov',60,100],['renderDistance',2,12],['shadowDistance',16,96],['maxLights',2,128],['viewMode',0,2]])if(Number.isFinite(value[k]))out[k]=clamp(value[k],a,b);
 for(const k of ['bob','shadows','smoothLighting','sound'])if(typeof value[k]==='boolean')out[k]=value[k];
 if(RESOLUTIONS.includes(value.resolution))out.resolution=value.resolution;
 if(AA_MODES.includes(value.aa))out.aa=value.aa;
 out.maxLights=Math.round(out.maxLights);out.viewMode=Math.round(out.viewMode);out.renderDistance=Math.round(out.renderDistance);
 return out;
}
export function workerCount(threads){return Math.max(1,Math.floor(Math.max(1,Number(threads)||2)*.75));}
export function renderSize(resolution,viewportWidth,viewportHeight,maxSize=16384){
 if(resolution==='native'){const scale=Math.min(1,1920/viewportWidth,1080/viewportHeight,maxSize/viewportWidth,maxSize/viewportHeight);return [Math.max(1,Math.floor(viewportWidth*scale)),Math.max(1,Math.floor(viewportHeight*scale))];}
 const [w,h]=(RESOLUTIONS.includes(resolution)?resolution:'1280x720').split('x').map(Number);
 // Fit the selected resolution budget to the viewport without stretching the world.
 const scale=Math.min(w/viewportWidth,h/viewportHeight,maxSize/viewportWidth,maxSize/viewportHeight);
 return [Math.max(1,Math.floor(viewportWidth*scale)),Math.max(1,Math.floor(viewportHeight*scale))];
}
export function frameInterval({hidden=false,focused=true,playing=true,menu=false}){return hidden?1000:!focused?100:!playing||menu?33:0;}
