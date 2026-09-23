// Minimal pass interface for the vendored Three r180 SMAAPass.
import {Mesh,PlaneGeometry,OrthographicCamera} from '../../src/engine.js';
export class Pass { constructor(){this.enabled=true;this.needsSwap=true;this.clear=false;this.renderToScreen=false;} }
export class FullScreenQuad {
  constructor(material){this.mesh=new Mesh(new PlaneGeometry(2,2),material);this.camera=new OrthographicCamera(-1,1,1,-1,0,1);this.mesh.frustumCulled=false;}
  get material(){return this.mesh.material;}
  set material(value){this.mesh.material=value;}
  render(renderer){renderer.render(this.mesh,this.camera);}
  dispose(){this.mesh.geometry.dispose();}
}
