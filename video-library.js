(()=>{'use strict';
function init(){
 const trigger=document.getElementById('header-upload-video'),picker=document.getElementById('video-file-input');
 if(!trigger||!picker||document.getElementById('imax-library'))return;
 const s={files:[],tab:'videos',q:'',sort:'newest',selected:new Set(),loading:false,native:false};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>{if(!Number.isFinite(n)||n<0)return'—';let x=Math.floor(n),h=Math.floor(x/3600),m=Math.floor(x%3600/60),r=x%60;return h?[h,m,r].map(v=>String(v).padStart(2,'0')).join(':'):[m,r].map(v=>String(v).padStart(2,'0')).join(':')};
 const bytes=n=>n>=1073741824?(n/1073741824).toFixed(2)+' GB':n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';
 const style=document.createElement('style');
 style.textContent=`
#imax-library{position:fixed;inset:0;z-index:10000;background:#000;color:#f5f5f5;font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;padding:calc(12px + env(safe-area-inset-top)) 0 calc(10px + env(safe-area-inset-bottom));overflow:hidden}
#imax-library[hidden]{display:none!important}body.il-open{overflow:hidden!important}
#imax-library .top{height:62px;flex:0 0 62px;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
#imax-library .tabs,#imax-library .actions{display:flex;align-items:center;gap:14px}
#imax-library button{cursor:pointer;touch-action:manipulation}
#imax-library .tab{border:0;background:none;color:#999;font-size:20px;font-weight:700;padding:12px 2px;position:relative}
#imax-library .tab.active{color:white}#imax-library .tab.active:after{content:"";position:absolute;left:0;right:0;bottom:2px;height:4px;border-radius:8px;background:#e34b55}
#imax-library .ico{width:34px;height:38px;border:0;background:transparent;color:#ddd;font-size:19px}
#imax-library .search{margin:10px 18px;background:#1b1b1b;border:1px solid #333;border-radius:14px;padding:0 12px;display:flex;align-items:center;gap:10px;min-height:46px}
#imax-library .search[hidden],#imax-library .menu[hidden],#imax-library .selection[hidden]{display:none}
#imax-library input{background:transparent;border:0;outline:0;color:white;min-width:0;flex:1;font-size:15px}
#imax-library .menu{position:absolute;right:12px;top:75px;background:#202020;border:1px solid #393939;border-radius:12px;padding:6px;z-index:2}
#imax-library .menu button{display:block;width:100%;text-align:left;padding:11px 16px;background:none;border:0;color:white}
#imax-library .toolbar{display:flex;align-items:center;gap:8px;padding:16px 18px 12px;color:#aaa;font-size:13px}
#imax-library .count{flex:1;font-weight:700}#imax-library .add{border:1px solid #633038;background:#291417;color:#ff9da3;border-radius:10px;padding:9px 11px;font-size:12px;font-weight:700}
#imax-library .content{flex:1;min-height:0;overflow:auto;padding:4px 18px 28px;overscroll-behavior:contain}
#imax-library h3{font-size:14px;color:#999;margin:8px 0 12px}
#imax-library .video{display:flex;width:100%;align-items:center;gap:14px;text-align:left;padding:7px 0;border:0;background:none;color:#f2f2f2;min-width:0}
#imax-library .thumb{position:relative;flex:0 0 32%;max-width:210px;aspect-ratio:16/9;background:#281719;border-radius:9px;overflow:hidden;display:grid;place-items:center;color:#9a3942;font-size:30px}
#imax-library .thumb img{width:100%;height:100%;object-fit:cover}
#imax-library .duration{position:absolute;right:7px;bottom:5px;color:white;font-size:11px;text-shadow:0 1px 4px #000}
#imax-library .details{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
#imax-library .details strong{font-size:15px;line-height:1.35;font-weight:500;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
#imax-library .details small{color:#777;font-size:12px;display:flex;gap:10px;flex-wrap:wrap}
#imax-library .video.selected .thumb{outline:2px solid #e34b55}
#imax-library .check{width:23px;height:23px;border:1px solid #777;border-radius:6px;display:grid;place-items:center;flex:0 0 23px}
#imax-library .folder{width:100%;display:flex;align-items:center;gap:14px;padding:15px 2px;background:none;border:0;border-bottom:1px solid #222;color:white;text-align:left}
#imax-library .folder i{color:#e45b64;font-size:24px;width:48px}#imax-library .folder span{flex:1}
#imax-library .empty{min-height:55vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;color:#888;padding:20px}
#imax-library .empty strong{font-size:18px;color:#eee}#imax-library .empty span{font-size:13px;line-height:1.5;max-width:280px}
#imax-library .empty button,#imax-library .selection button{border:0;background:#d94350;color:white;border-radius:10px;padding:11px 16px;font-weight:700}
#imax-library .selection{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:#181818;border-top:1px solid #333}
@media(max-width:420px){#imax-library .top{padding:0 14px}#imax-library .tabs{gap:12px}#imax-library .tab{font-size:18px}#imax-library .actions{gap:8px}#imax-library .content{padding-left:14px;padding-right:14px}#imax-library .toolbar{padding-left:15px;padding-right:15px}#imax-library .video{gap:11px}#imax-library .thumb{flex-basis:34%}#imax-library .details strong{font-size:13px}#imax-library .details small{font-size:11px}}
`;
 document.head.append(style);
 const root=document.createElement('section');root.id='imax-library';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
 root.innerHTML='<div class="top"><div class="tabs"><button class="tab active" data-tab="videos">Videos</button><button class="tab" data-tab="folders">Folders</button></div><div class="actions"><button class="ico" data-a="search" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button><button class="ico" data-a="select" aria-label="Select"><i class="fa-regular fa-square-check"></i></button><button class="ico" data-a="menu" aria-label="Sort"><i class="fa-solid fa-ellipsis-vertical"></i></button><button class="ico" data-a="close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div></div><div class="search" hidden><i class="fa-solid fa-magnifying-glass"></i><input placeholder="Search videos..."><button data-a="clear">×</button></div><div class="menu" hidden><button data-sort="newest">Newest first</button><button data-sort="oldest">Oldest first</button><button data-sort="largest">Largest first</button><button data-sort="name">Name A–Z</button></div><div class="toolbar"><span class="count">Scanning videos…</span><button class="add" data-a="add">＋ Add videos</button></div><div class="content"></div><div class="selection" hidden><span class="selected-count">0 selected</span><button data-a="play">Play selected</button></div>';
 document.body.append(root);
 const $=q=>root.querySelector(q),content=$('.content'),search=$('.search'),input=$('.search input');
 function plugin(){return window.Capacitor?.Plugins?.MediaLibrary||window.Capacitor?.Plugins?.mediaLibrary||null}
 async function scan(){const p=plugin();if(!p?.listVideos){s.native=false;render();return} s.loading=true;render();try{const result=await p.listVideos();s.native=true;s.files=(result.videos||[]).map(v=>({...v,native:true,id:String(v.id),duration:(Number(v.duration)||0)/1000,modified:(Number(v.dateAdded)||0)*1000,folder:v.folder||v.relativePath||'On this device',size:Number(v.size)||0}));render();loadVisibleThumbnails()}catch(err){s.native=false;s.loading=false;content.innerHTML='<div class="empty"><strong>Video access needed</strong><span>'+(esc(err?.message||'Allow video access in Android permissions, then scan again.'))+'</span><button data-a="scan">Try again</button><button data-a="add">Choose videos manually</button></div>';$('.count').textContent='Permission required'}}
 function show(){root.hidden=false;document.body.classList.add('il-open');if(s.files.length===0)scan();else render()}
 function hide(){root.hidden=true;document.body.classList.remove('il-open')}
 trigger.addEventListener('click',e=>{e.preventDefault();show()});
 root.addEventListener('click',e=>{
  const a=e.target.closest('[data-a]')?.dataset.a;
  if(a==='close')hide();if(a==='add')picker.click();if(a==='scan')scan();
  if(a==='search'){search.hidden=!search.hidden;if(!search.hidden)input.focus();else{s.q='';input.value='';render()}}
  if(a==='clear'){s.q='';input.value='';render()}
  if(a==='select'){root.classList.toggle('select-mode');if(!root.classList.contains('select-mode'))s.selected.clear();render()}
  if(a==='menu')$('.menu').hidden=!$('.menu').hidden;
  if(a==='play'){const f=s.files.find(x=>s.selected.has(x.id));if(f)play(f)}
  const tab=e.target.closest('[data-tab]')?.dataset.tab;if(tab){s.tab=tab;root.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));render()}
  const sort=e.target.closest('[data-sort]')?.dataset.sort;if(sort){s.sort=sort;$('.menu').hidden=true;render()}
  const row=e.target.closest('[data-file]');if(row){const f=s.files.find(x=>x.id===row.dataset.file);if(!f)return;if(root.classList.contains('select-mode')){s.selected.has(f.id)?s.selected.delete(f.id):s.selected.add(f.id);render()}else play(f)}
  const folder=e.target.closest('[data-folder]');if(folder){s.q=folder.dataset.folder.toLowerCase();s.tab='videos';search.hidden=false;input.value=folder.dataset.folder;root.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='videos'));render()}
 });
 input.addEventListener('input',()=>{s.q=input.value.toLowerCase().trim();render()});
 picker.addEventListener('change',()=>{add([...picker.files]);picker.value='';});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)hide()});
 function add(files){const known=new Set(s.files.map(f=>f.name+'|'+f.size+'|'+f.folder));files.filter(f=>f.type.startsWith('video/')||/\.(mkv|mp4|mov|webm|avi|m4v|3gp|ts|mpeg|mpg)$/i.test(f.name)).forEach(file=>{const folder=file.webkitRelativePath?file.webkitRelativePath.split('/').slice(0,-1).join('/'):'On this device',key=file.name+'|'+file.size+'|'+folder;if(known.has(key))return;known.add(key);const f={id:'f'+Math.random().toString(36).slice(2),file,name:file.name,size:file.size,modified:file.lastModified,folder,duration:0,thumb:'',native:false};s.files.push(f);const v=document.createElement('video');v.preload='metadata';v.muted=true;v.src=URL.createObjectURL(file);v.onloadedmetadata=()=>{f.duration=v.duration||0;try{v.currentTime=Math.min(1,Math.max(.1,f.duration/10))}catch{}};v.onseeked=()=>{try{const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').drawImage(v,0,0,320,180);f.thumb=c.toDataURL('image/jpeg',.65)}catch{}URL.revokeObjectURL(v.src);v.removeAttribute('src');v.load();render()}});s.native=false;render()}
 function play(f){if(f.native){const cap=window.Capacitor;if(!f.path||!cap?.convertFileSrc){alert('This video path cannot be opened by the current Android file bridge. Please rescan after granting video access.');return}const src=cap.convertFileSrc(f.path);window.dispatchEvent(new CustomEvent('imax:play-native-video',{detail:{src,name:f.name}}));}else{const dt=new DataTransfer();dt.items.add(f.file);picker.files=dt.files;picker.dispatchEvent(new Event('change',{bubbles:true}))}try{const h=JSON.parse(localStorage.getItem('imaxVideoHistory')||'{}');h[f.name]={at:Date.now()};localStorage.setItem('imaxVideoHistory',JSON.stringify(h))}catch{}hide()}
 let thumbObserver=null;
 function loadVisibleThumbnails(){if(thumbObserver)thumbObserver.disconnect();if(!('IntersectionObserver'in window))return;thumbObserver=new IntersectionObserver(entries=>{entries.forEach(async entry=>{if(!entry.isIntersecting)return;const node=entry.target;thumbObserver.unobserve(node);const p=plugin();if(!p?.getVideoThumbnail)return;try{const r=await p.getVideoThumbnail({id:node.dataset.thumbId});if(r.thumbnail){const img=document.createElement('img');img.alt='';img.src='data:image/jpeg;base64,'+r.thumbnail;node.prepend(img)}}catch{}})},{root:content,rootMargin:'300px'});content.querySelectorAll('[data-thumb-id]').forEach(n=>thumbObserver.observe(n))}
 function render(){let list=s.files.filter(f=>f.name.toLowerCase().includes(s.q)||String(f.folder||'').toLowerCase().includes(s.q));$('.count').textContent=s.loading?'Scanning videos…':s.tab==='folders'?'Folders':s.files.length+' videos';$('.selection').hidden=!root.classList.contains('select-mode');$('.selected-count').textContent=s.selected.size+' selected';
  if(s.loading&&!s.files.length){content.innerHTML='<div class="empty"><i class="fa-solid fa-spinner fa-spin"></i><strong>Scanning your videos</strong><span>Finding videos stored on this device…</span></div>';return}
  if(s.tab==='folders'){const g=new Map();list.forEach(f=>g.set(f.folder,(g.get(f.folder)||0)+1));content.innerHTML=g.size?[...g].sort((a,b)=>a[0].localeCompare(b[0])).map(([n,c])=>'<button class="folder" data-folder="'+esc(n)+'"><i class="fa-regular fa-folder"></i><span><b>'+esc(n.split('/').filter(Boolean).pop()||n)+'</b><br><small>'+c+' videos</small></span><i class="fa-solid fa-chevron-right"></i></button>').join(''):'<div class="empty"><strong>No folders found</strong><span>Video folders on your device will appear here.</span></div>';return}
  list.sort((a,b)=>s.sort==='oldest'?a.modified-b.modified:s.sort==='largest'?b.size-a.size:s.sort==='name'?a.name.localeCompare(b.name):b.modified-a.modified);
  if(!list.length){content.innerHTML='<div class="empty"><i class="fa-solid fa-film"></i><strong>'+(s.loading?'Scanning videos…':s.q?'No matching videos':'No videos found')+'</strong><span>'+(s.q?'Try another search.':s.native?'No accessible videos were found on this device.':'Add videos from your phone to build your library.')+'</span>'+(s.native?'':'<button data-a="add">Choose videos</button>')+'</div>';return}
  const groups=new Map();list.forEach(f=>{const day=new Date(f.modified||Date.now()).toLocaleDateString(undefined,{month:'short',day:'2-digit'});if(!groups.has(day))groups.set(day,[]);groups.get(day).push(f)});
  let history={};try{history=JSON.parse(localStorage.getItem('imaxVideoHistory')||'{}')}catch{}
  content.innerHTML=[...groups].map(([day,items])=>'<section><h3>'+esc(day)+'</h3>'+items.map(f=>'<button class="video '+(s.selected.has(f.id)?'selected':'')+'" data-file="'+esc(f.id)+'"><span class="thumb" '+(f.native?'data-thumb-id="'+esc(f.id)+'"':'')+'>'+(f.thumb?'<img src="'+f.thumb+'" alt="">':'<i class="fa-solid fa-film"></i>')+'<span class="duration">'+fmt(f.duration)+'</span></span><span class="details"><strong title="'+esc(f.name)+'">'+esc(f.name)+'</strong><small>'+bytes(f.size)+' <span>'+(history[f.name]?'Watched':'Not played')+'</span></small></span>'+(root.classList.contains('select-mode')?'<span class="check">'+(s.selected.has(f.id)?'<i class="fa-solid fa-check"></i>':'')+'</span>':'')+'</button>').join('')+'</section>').join('');
  if(s.native)loadVisibleThumbnails()
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();