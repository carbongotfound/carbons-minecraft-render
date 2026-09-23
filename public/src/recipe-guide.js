import {ITEMS,SMELTING,patternFor} from './core.js';
import {icon} from './art.js';
const $=id=>document.getElementById(id);
export function recipeGuide(recipe,inventory,fill,atlas){
 let root=$('recipePreview');if(!root){root=document.createElement('section');root.id='recipePreview';$('recipes').before(root);}
 root.replaceChildren();const title=document.createElement('strong');title.textContent=`${recipe.n} × ${ITEMS[recipe.out].name}`;root.append(title);
 const station=document.createElement('p');station.textContent=recipe.smelt?'Furnace · 10 seconds · add fuel':recipe.size>2?'Crafting table · 3 × 3':'Inventory or crafting table';root.append(station);
 const grid=document.createElement('div');grid.className='recipe-diagram';const pattern=recipe.smelt?[[recipe.input]]:patternFor(recipe),width=recipe.smelt?1:recipe.size>2?3:2;grid.style.gridTemplateColumns=`repeat(${width},36px)`;
 for(let y=0;y<width;y++)for(let x=0;x<width;x++){const id=pattern[y]?.[x],cell=document.createElement('div');cell.className='recipe-cell';if(id){const img=document.createElement('img');img.src=icon(id,atlas);img.alt=ITEMS[id].name;cell.title=ITEMS[id].name;cell.append(img);}grid.append(cell);}root.append(grid);
 const needs=recipe.need||{[recipe.input]:1};for(const[id,n]of Object.entries(needs)){const line=document.createElement('p'),owned=inventory.count(id);line.textContent=`${ITEMS[id].name}: ${owned} / ${n}`;line.className=owned>=n?'ingredient-owned':'ingredient-missing';root.append(line);}
 if(!recipe.smelt){const button=document.createElement('button');button.textContent='Fill crafting grid';button.onclick=()=>fill(recipe);root.append(button);}else{const hint=document.createElement('p');hint.textContent='Place a furnace, right-click it, then add the ingredient to Input and coal or wood to Fuel.';root.append(hint);}
}
export function smeltingRecipes(){return Object.entries(SMELTING).filter(([id,out])=>ITEMS[id]&&ITEMS[out]).map(([input,out])=>({input,out,n:1,smelt:true,need:{[input]:1}}));}
