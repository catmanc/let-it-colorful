const {Plugin, Modal, Setting, Notice, MarkdownView, PluginSettingTab, addIcon} = require('obsidian');
const defaults={colors:['#FF0000','#FF8800','#008800','#0088FF','#AA00FF','#FFFF00','#000000','#FFFFFF']};
const valid=c=>/^#[0-9a-f]{6}$/i.test(c);


const iconIds=['lic-text','lic-background','lic-remove-text','lic-remove-background','lic-remove-all'];
const A='<path d="M20 78 L50 15 L80 78 M32 56 H68" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>';
const smallA='<path d="M28 75 L50 25 L72 75 M36 57 H64" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>';
const frame='<rect x="10" y="10" width="80" height="80" rx="9" fill="none" stroke="currentColor" stroke-width="6"/>';
const slash='<path d="M12 90 L88 10" stroke="#E34D59" stroke-width="9" stroke-linecap="round"/>';
const icons=[A.replace('currentColor','#D9AE22'),frame.replace('currentColor','#D9AE22')+smallA,A+slash,frame+smallA+slash,'<path d="M15 59 L55 19 Q62 12 69 19 L88 38 Q94 44 88 50 L51 87 H39 Z M32 42 L70 80 M51 87 H92" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/>'];
function cleanPalette(value,fallback){return Array.isArray(value)&&value.length&&value.every(c=>typeof c==='string'&&valid(c))?value.map(c=>c.toUpperCase()):[...fallback];}
class PaletteSettings extends PluginSettingTab {
 constructor(app,p){super(app,p);this.p=p;}
 display(){const root=this.containerEl;root.empty();for(const [key,title] of [['textColors','Text color palette'],['backgroundColors','Background color palette']]){
 root.createEl('h3',{text:title});const colors=this.p.settings[key];const save=async()=>{await this.p.saveData(this.p.settings);};
 colors.forEach((color,i)=>{const row=new Setting(root).setName('Color '+(i+1));let picker,field;
 row.addColorPicker(p=>{picker=p;p.setValue(color).onChange(async v=>{colors[i]=v.toUpperCase();field.setValue(colors[i]);await save();});});
 row.addText(t=>{field=t;t.setValue(color).onChange(async v=>{if(valid(v)){colors[i]=v.toUpperCase();picker.setValue(colors[i]);await save();}});t.inputEl.addEventListener('blur',()=>t.setValue(colors[i]));t.inputEl.style.width='90px';});
 for(const [delta,label] of [[-1,'↑'],[1,'↓']])row.addButton(b=>b.setButtonText(label).setDisabled(i+delta<0||i+delta>=colors.length).onClick(async()=>{[colors[i],colors[i+delta]]=[colors[i+delta],colors[i]];await save();this.display();}));
 row.addButton(b=>b.setIcon('trash-2').setTooltip('Delete color').setDisabled(colors.length<=1).onClick(async()=>{colors.splice(i,1);await save();this.display();}));});
 new Setting(root).addButton(b=>b.setButtonText('Add color').onClick(async()=>{colors.push('#808080');await save();this.display();})).addButton(b=>b.setButtonText('Restore default palette').onClick(async()=>{this.p.settings[key]=[...defaults.colors];await save();this.display();}));
 }}
}

function recolor(doc,a,b,prop,value){
 const tag=/<span\b(?:"[^"]*"|'[^']*'|[^'">])*?>|<\/span\s*>/gi;
 const stack=[], pairs=[]; let m;
 while((m=tag.exec(doc))){if(/^<\//.test(m[0])){const open=stack.pop();if(open&&open.style)pairs.push({...open,end:tag.lastIndex,close:m.index});}else{const match=/^<span\s+style\s*=\s*(["'])(.*?)\1\s*>$/i.exec(m[0]);let style=null;if(match){const entries=match[2].split(';').map(x=>x.trim()).filter(Boolean);if(entries.length&&entries.every(x=>/^(?:color|background-color)\s*:\s*#[0-9a-f]{6}$/i.test(x))){style={};for(const e of entries){const [k,v]=e.split(':');style[k.trim().toLowerCase()]=v.trim().toUpperCase();}}}stack.push({start:m.index,openEnd:tag.lastIndex,style});}}
 let lo=a,hi=b;let changed=true;while(changed){changed=false;for(const p of pairs){if(p.start<hi&&p.end>lo&&(p.start<lo||p.end>hi)){lo=Math.min(lo,p.start);hi=Math.max(hi,p.end);changed=true;}}}
 const relevant=pairs.filter(p=>p.start>=lo&&p.end<=hi);const events=new Map();for(const p of relevant){events.set(p.start,{end:p.openEnd,p,open:true});events.set(p.close,{end:p.end,p,open:false});}
 // Avoid editing code or unrelated HTML in the affected range; no silent corruption.
 const raw=doc.slice(lo,hi);if(/`|<!--|<\/?(?:pre|code)\b/i.test(raw))throw Error('Select plain text outside code or HTML comments.');
 const active=[];const chunks=[];function emit(t,style){if(!t)return;const key=JSON.stringify(style);const prev=chunks[chunks.length-1];if(prev&&prev.key===key)prev.t+=t;else chunks.push({t,style,key});}
 let i=lo;while(i<hi){const e=events.get(i);if(e){if(e.open)active.push(e.p);else active.pop();i=e.end;continue;}if(doc[i]==='<'&&/^<\/?[a-z!]/i.test(doc.slice(i)))throw Error('Selection contains unsupported HTML. Select plain text or native color spans.');let style={};for(const p of active)Object.assign(style,p.style);if(i>=a&&i<b){if(prop==='both'){delete style.color;delete style['background-color'];}else if(value)style[prop]=value;else delete style[prop];}const ordered={};for(const k of ['color','background-color'])if(style[k])ordered[k]=style[k];if(doc[i]==='\n')emit('\n',{});else emit(doc[i],ordered);i++;}
 const result=chunks.map(({t,style})=>{const css=Object.entries(style).map(([k,v])=>k+':'+v).join(';');return css?`<span style="${css}">${t}</span>`:t;}).join('');return {lo,hi,result};
}

function colorSpans(doc){const spans=[];const re=/<span\s+style\s*=\s*(["'])([^"']*)\1\s*>([^<>]*)<\/span\s*>/gi;let match;while((match=re.exec(doc))){const entries=match[2].split(';').map(x=>x.trim()).filter(Boolean);if(!entries.length||!entries.every(x=>/^(?:color|background-color)\s*:\s*#[0-9a-f]{6}$/i.test(x)))continue;const begin=match.index+match[0].indexOf('>')+1;spans.push({start:match.index,end:re.lastIndex,begin,finish:begin+match[3].length,text:match[3]});} return spans;}

class Palette extends Modal {
 constructor(app,plugin,apply,prop){super(app);this.plugin=plugin;this.apply=apply;this.prop=prop;}
 onOpen(){this.titleEl.setText('Choose color');const area=this.contentEl.createDiv();area.style.cssText='display:flex;flex-wrap:wrap;gap:12px';for(const c of this.plugin.settings[this.prop==='background-color'?'backgroundColors':'textColors']){if(!valid(c))continue;const b=area.createEl('button',{text:c});b.style.cssText='min-height:44px;border:2px solid var(--text-muted);background-color:'+c+';color:'+(parseInt(c.slice(1,3),16)*.299+parseInt(c.slice(3,5),16)*.587+parseInt(c.slice(5,7),16)*.114>145?'#000':'#fff');b.onclick=()=>{this.close();this.apply(c);};}let custom='#FF0000';new Setting(this.contentEl).setName('Custom color').addColorPicker(p=>p.setValue(custom).onChange(v=>custom=v)).addButton(b=>b.setButtonText('Apply').onClick(()=>{this.close();this.apply(custom);}));}
 onClose(){this.contentEl.empty();}
}
module.exports=class extends Plugin{
 async onload(){this.lastSelection=null;iconIds.forEach((id,i)=>addIcon(id,icons[i]));
 const capture=()=>{const view=this.app.workspace.getActiveViewOfType(MarkdownView);if(!view||!view.editor){this.lastSelection=null;return;}const ed=view.editor, sel=view.containerEl.ownerDocument.getSelection();if(!sel||!sel.rangeCount||!view.containerEl.contains(sel.anchorNode)||!view.containerEl.contains(sel.focusNode))return;if(sel.isCollapsed){this.lastSelection=null;return;}const text=sel.toString();if(!text)return;const doc=ed.getValue(), cm=ed.cm;let mapped=null;
 try{const r=sel.getRangeAt(0);const element=n=>n.nodeType===1?n:n.parentElement;const span=element(r.startContainer).closest('span[style]');if(span&&span.contains(r.endContainer)&&cm&&typeof cm.posAtDOM==='function'){
 const prefix=r.cloneRange();prefix.selectNodeContents(span);prefix.setEnd(r.startContainer,r.startOffset);const offset=prefix.toString().length;const full=span.textContent;const pos=cm.posAtDOM(span);const matches=colorSpans(doc).filter(p=>p.start<=pos&&pos<=p.end&&p.text===full);if(matches.length===1){const p=matches[0];if(p.text.slice(offset,offset+text.length)===text)mapped={a:p.begin+offset,b:p.begin+offset+text.length};}}
 if(!mapped&&cm&&typeof cm.posAtDOM==='function'){const a=cm.posAtDOM(r.startContainer,r.startOffset),b=cm.posAtDOM(r.endContainer,r.endOffset);if(a<b&&doc.slice(a,b)===text)mapped={a,b};}
 }catch(e){console.debug('Let It Colorful: DOM mapping unavailable',e);}
 this.lastSelection={ed,doc,text,mapped,time:Date.now()};};
 this.registerDomEvent(document,'contextmenu',capture,true);this.registerDomEvent(document,'pointerdown',e=>{if(e.button===2)capture();else if(e.target.closest?.('.cm-content'))this.lastSelection=null;},true);
 this.registerDomEvent(document,'selectionchange',capture);this.registerDomEvent(document,'pointerup',capture,true);this.registerDomEvent(document,'keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='p')capture();else if(e.target.closest?.('.cm-content')&& !['Control','Meta','Shift','Alt'].includes(e.key))this.lastSelection=null;},true);
 this.registerEvent(this.app.workspace.on('active-leaf-change',()=>{this.lastSelection=null;}));
 this.registerEvent(this.app.workspace.on('editor-menu',(menu,ed)=>{
 const cached=this.lastSelection;
 if(!ed.somethingSelected()&&!(cached&&cached.ed===ed&&cached.doc===ed.getValue()&&Date.now()-cached.time<15000&&cached.text))return;
 let target;try{target=this.target(ed);}catch(e){new Notice('Let It Colorful: '+e.message);return;}if(!target)return;
 const actions=[['Text color',iconIds[0],'color',false],['Highlight background',iconIds[1],'background-color',false],['Remove text color',iconIds[2],'color',true],['Remove background highlight',iconIds[3],'background-color',true],['Remove text and background color',iconIds[4],'both',true]];
 const addActions=(dest,prefix='')=>{for(const [name,icon,prop,remove] of actions)dest.addItem(item=>item.setTitle(prefix+name).setIcon(icon).onClick(()=>{const apply=c=>{if(ed.getValue()!==target.doc){new Notice('Document changed; try again.');return;}this.apply(ed,target.doc,target.a,target.b,prop,c);};if(remove)apply(null);else new Palette(this.app,this,c=>{if(valid(c))apply(c);},prop).open();}));};
 menu.addSeparator();addActions(menu,'Let It Colorful: ');
 }));
 const saved=await this.loadData()||{};const legacy=cleanPalette(saved.colors,defaults.colors);this.settings={...saved,textColors:cleanPalette(saved.textColors,legacy),backgroundColors:cleanPalette(saved.backgroundColors,legacy)};this.addSettingTab(new PaletteSettings(this.app,this));
 for(const [id,name,prop,remove,icon] of [['text-color','Text color','color',false,iconIds[0]],['highlight','Highlight background','background-color',false,iconIds[1]],['remove-color','Remove text and background color','both',true,iconIds[4]],['remove-text-color','Remove text color','color',true,iconIds[2]],['remove-highlight','Remove background highlight','background-color',true,iconIds[3]]])this.addCommand({id,name,icon,callback:()=>this.run(prop,remove)});}

 run(prop,remove){try{const view=this.app.workspace.getActiveViewOfType(MarkdownView);if(!view||!view.editor||view.getMode()!=='source'){new Notice('Let It Colorful: open a note in editing mode.');return;}if(remove)this.remove(view.editor,prop);else this.pick(view.editor,prop);}catch(e){console.error('Let It Colorful',e);new Notice('Let It Colorful: '+e.message);}}
 target(ed){const doc=ed.getValue();let a=ed.posToOffset(ed.getCursor('from')),b=ed.posToOffset(ed.getCursor('to'));if(a>b)[a,b]=[b,a];
 const spans=colorSpans(doc);
 const cached=this.lastSelection;this.lastSelection=null;
 const raw=doc.slice(a,b), visible=raw.replace(/<\/?span\b[^>]*>/gi,'');
 const touching=spans.filter(p=>p.start<=b&&p.end>=a);
 if(cached&&cached.ed===ed&&cached.doc===doc&&Date.now()-cached.time<15000){if(cached.mapped)return {doc,...cached.mapped};if(a!==b&&visible===cached.text)return {doc,a,b};const candidates=[];for(const p of touching){let i=p.text.indexOf(cached.text);while(i>=0){candidates.push({doc,a:p.begin+i,b:p.begin+i+cached.text.length});i=p.text.indexOf(cached.text,i+1);}}if(candidates.length===1)return candidates[0];throw Error('Cannot map rendered selection uniquely. Select in Source mode.');}
 if(a!==b&&visible)return {doc,a,b};
 if(touching.length===1&&a>=touching[0].begin&&a<=touching[0].finish){const p=touching[0];return {doc,a:p.begin,b:p.finish};}return null;}

 pick(ed,prop){const target=this.target(ed);new Palette(this.app,this,c=>{if(!target){new Notice('No editable selection detected. Switch to Source mode and select the text.');return;}const {doc,a,b}=target;if(ed.getValue()!==doc){new Notice('Document changed; try again.');return;}if(valid(c))this.apply(ed,doc,a,b,prop,c);},prop).open();}
 remove(ed,prop='both'){const target=this.target(ed);if(!target){new Notice('Select text or place the cursor inside colored text.');return;}this.apply(ed,target.doc,target.a,target.b,prop,null);}
 apply(ed,doc,a,b,prop,c){let patch;try{patch=recolor(doc,a,b,prop,c);}catch(e){new Notice(e.message);return;}const {lo,hi,result}=patch;if(result===doc.slice(lo,hi)){new Notice('Let It Colorful: no change (same color or no editable text). Try Source mode if needed.');return;}
 // Replace the complete affected spans, not a fragment inside a hidden HTML tag.
 ed.replaceRange(result,ed.offsetToPos(lo),ed.offsetToPos(hi));
 if(ed.getValue()!==doc.slice(0,lo)+result+doc.slice(hi)){new Notice('Let It Colorful: editor did not apply the expected change. Check Source mode.');return;}
 // Keep the affected visible text selected when it is a single span.
 const single=/^<span style="[^"]+">([^<]*)<\/span>$/.exec(result);
 if(single){const begin=lo+result.indexOf('>')+1;ed.setSelection(ed.offsetToPos(begin),ed.offsetToPos(begin+single[1].length));}
 }
};
