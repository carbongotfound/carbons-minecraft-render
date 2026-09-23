import {TILES} from './expansion-data.js';
import {ITEMS,RECIPES,SMELTING} from './core.js';
ITEMS.bone_meal={name:'Bone meal',max:64};
ITEMS.lava={...ITEMS.lava,name:'Lava block',block:49,tile:TILES.get(49),max:64};
SMELTING.deepslate='lava';
if(!RECIPES.some(r=>r.out==='bone_meal'))RECIPES.push({out:'bone_meal',n:3,need:{bone:1},size:1,pattern:[['bone']]});
