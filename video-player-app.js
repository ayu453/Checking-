/* IMAX Video Player V1 — local library, normal playback and IMAX theatre mode. */
(() => {
'use strict';
const video=document.getElementById('imax-video'), fileInput=document.getElementById('video-file-input');
if(!video||!fileInput)return;
const state={files:[],activeIndex:-1,mode:'theatre',subtitleUrl:null,subtitleTrack:null};
const $=(s,r=document)=>r.querySelector(s);
const style=document.createElement('style');
style.textContent=[
'#imax-library-launch{border:1px solid rgba(248,113,113,.35);background:rgba(35,12,18,.88);color:#fee2e2;border-radius:12px;padding:9px 12px;font:600 12px system-ui;display:inline-flex;align-items:center;gap:8px;cursor:pointer}',
'#imax-library-launch:hover{background:rgba(127,29,29,.65);border-color:#f87171}',
'#imax-player-library{position:fixed;inset:0;z-index:1000;background:rgba(3,5,9,.96);backdrop-filter:blur(20px);color:#f8fafc;display:none;overflow:auto;font-family:system-ui,sans-serif}',
'#imax-player-library.open{display:block}',
'#imax-player-library .ipl-wrap{max-width:1180px;margin:auto;padding:clamp(18px,4vw,42px)}',
'#imax-player-library .ipl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:28px}',
'#imax-player-library h2{font-size:clamp(24px,4vw,36px);font-weight:800;letter-spacing:-.04em}',
'#imax-player-library .ipl-sub{color:#94a3b8;font-size:13px;margin-top:5px}',
'#imax-player-library .ipl-actions{display:flex;gap:9px;flex-wrap:wrap}',
'#imax-player-library .ipl-section{margin:26px 0 12px;font-size:14px;font-weight:800;color:#cbd5e1}',
'#imax-player-library .ipl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:13px}',
'#imax-player-library .ipl-card{background:linear-gradient(145deg,#171923,#0c0e14);border:1px solid #252a36;border-radius:15px;padding:15px;min-width:0}',
'#imax-player-library .ipl-poster{height:104px;border-radius:10px;background:radial-gradient(circle at 50% 20%,#5b1d2b,#171923 70%);display:grid;place-items:center;color:#fecaca;font-size:30px;margin-bottom:12px}',
'#imax-player-library .ipl-name{font-size:13px;font-weight:750;overflow-wrap:anywhere;line-height:1.4}',
'#imax-player-library .ipl-meta{font-size:11px;color:#94a3b8;margin-top:5px}',
'#imax-player-library .ipl-card button{width:100%;margin-top:12px}',
'#imax-player-library .ipl-empty{border:1px dashed #374151;border-radius:16px;padding:35px 18px;text-align:center;color:#94a3b8;grid-column:1/-1}',
'#imax-player-library .ipl-drop{border:1px dashed #7f1d1d;background:rgba(69,10,10,.18);border-radius:15px;padding:20px;text-align:center;color:#fecaca;font-size:12px;margin-top:18px}',
'#imax-player-library .ipl-footer{margin-top:30px;color:#64748b;font-size:11px;line-height:1.6}',
'.ipl-btn{border:1px solid #334155;background:#111827;color:#e2e8f0;border-radius:11px;padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer}',
'.ipl-btn.primary{background:#991b1b;border-color:#b91c1c;color:white}',
'#imax-video.player-normal-mode{display:block!important;position:fixed;inset:0;width:100vw;height:100dvh;object-fit:contain;background:#000;z-index:900}',
'body.imax-normal-view #canvas-container{visibility:hidden}',
'body.imax-normal-view #player-bar,body.imax-normal-view #cinema-left-tools,body.imax-normal-view #cinema-right-tools,body.imax-normal-view #controls-panel,body.imax-normal-view #quick-controls{display:none!important}',
'#imax-normal-controls{position:fixed;z-index:950;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));padding:12px 14px;border:1px solid rgba(255,255,255,.12);border-radius:17px;background:rgba(9,11,17,.88);backdrop-filter:blur(18px);color:white;display:none;font:12px system-ui}',
'body.imax-normal-view #imax-normal-controls{display:block}',
'#imax-normal-controls .inc-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
'#imax-normal-controls button,#imax-normal-controls select{border:1px solid #374151;background:#171923;color:#f8fafc;border-radius:9px;padding:9px 12px;cursor:pointer}',
'#imax-normal-controls .inc-main{display:flex;align-items:center;gap:8px}',
'#imax-normal-controls .inc-title{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw;color:#cbd5e1}',
'#imax-normal-controls input[type=range]{width:100%;accent-color:#ef4444}',
'@media(max-width:600px){#imax-player-library .ipl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#imax-player-library .ipl-card{padding:10px}#imax-player-library .ipl-poster{height:78px}#imax-normal-controls{left:7px;right:7px;padding:9px}#imax-normal-controls button{padding:8px 10px}}'
].join('');
document.head.appendChild(style);
const library=document.createElement('section');library.id='imax-player-library';
library.innerHTML='<div class="ipl-wrap"><div class="ipl-head"><div><div style="font-size:10px;letter-spacing:.22em;color:#f87171;font-weight:900">IMAX MEDIA CENTER</div><h2>Your Video Library</h2><div class="ipl-sub">Choose a local movie, build a queue, then watch normally or inside the IMAX theatre.</div></div><button class="ipl-btn" data-close>✕ Close</button></div><div class="ipl-actions"><button class="ipl-btn primary" data-add>＋ Add videos</button><button class="ipl-btn" data-resume>▶ Continue current video</button><button class="ipl-btn" data-theatre>▣ Open IMAX Theatre</button></div><div class="ipl-section">Recently added · This session</div><div class="ipl-grid" data-grid><div class="ipl-empty">Your library is empty. Add videos from your device.</div></div><div class="ipl-drop" data-drop>Drop video files here to add them to your session library</div><div class="ipl-footer">Videos are opened locally in your browser and are not uploaded. The library list lasts for this browser session; select files again after refreshing. Playback compatibility depends on browser and video codecs.</div></div>';
document.body.appendChild(library);
const multi=document.createElement('input');multi.type='file';multi.accept='video/*,.mkv,.mov,.webm';multi.multiple=true;multi.hidden=true;document.body.appendChild(multi);
const controls=document.createElement('div');controls.id='imax-normal-controls';
controls.innerHTML='<div class="inc-row"><div class="inc-title" data-title>No video selected</div><div class="inc-main"><button data-prev>⏮</button><button data-play>▶</button><button data-next>⏭</button><button data-audio>♫ Audio</button><button data-subtitle>CC</button><select data-speed aria-label="Playback speed"><option value=".5">0.5×</option><option value=".75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="1.75">1.75×</option><option value="2">2×</option></select><button data-theatre>IMAX Theatre</button></div></div><div style="display:flex;align-items:center;gap:9px;margin-top:10px"><span data-current>0:00</span><input data-seek type="range" min="0" max="1000" value="0" aria-label="Seek video" style="flex:1;min-width:0"><span data-duration>0:00</span></div>';
document.body.appendChild(controls);
const grid=$('[data-grid]',library),fmt=n=>!Number.isFinite(n)?'0:00':Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
const bytes=n=>n>1024**3?(n/1024**3).toFixed(1)+' GB':n>1024**2?(n/1024**2).toFixed(0)+' MB':(n/1024).toFixed(0)+' KB';
function closeLibrary(){library.classList.remove('open')}
function render(){grid.innerHTML='';if(!state.files.length){grid.innerHTML='<div class="ipl-empty">Your library is empty. Add MP4, MKV or another video file from your device.</div>';return}
state.files.forEach((file,index)=>{const card=document.createElement('article');card.className='ipl-card';const poster=document.createElement('div');poster.className='ipl-poster';poster.textContent='▶';const name=document.createElement('div');name.className='ipl-name';name.textContent=file.name;const meta=document.createElement('div');meta.className='ipl-meta';meta.textContent=bytes(file.size)+(state.activeIndex===index?' · Now playing':'');const play=document.createElement('button');play.className='ipl-btn primary';play.textContent=state.activeIndex===index?'Resume':'Play video';play.addEventListener('click',()=>loadAt(index));card.append(poster,name,meta,play);grid.appendChild(card)})}
function loadAt(index){if(index<0||index>=state.files.length)return;state.activeIndex=index;const transfer=new DataTransfer();transfer.items.add(state.files[index]);fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));$('[data-title]',controls).textContent=state.files[index].name;render();closeLibrary()}
function addFiles(files){for(const f of Array.from(files||[]))if(f&&(f.type.startsWith('video/')||/\.(mkv|mov|webm|mp4|m4v|avi|mpeg|mpg)$/i.test(f.name))){if(!state.files.some(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified))state.files.push(f)}render();if(state.activeIndex<0&&state.files.length)loadAt(0)}
function setMode(mode){state.mode=mode;if(mode==='normal'){document.body.classList.add('imax-normal-view');video.classList.add('player-normal-mode');document.body.classList.remove('cinema-ui-hidden')}else{document.body.classList.remove('imax-normal-view');video.classList.remove('player-normal-mode');closeLibrary()}}
function openLibrary(){library.classList.add('open');render()}
$('[data-add]',library).addEventListener('click',()=>multi.click());$('[data-close]',library).addEventListener('click',closeLibrary);
$('[data-resume]',library).addEventListener('click',()=>{if(video.currentSrc||video.src){closeLibrary();setMode('normal');video.play().catch(()=>{})}});
$('[data-theatre]',library).addEventListener('click',()=>setMode('theatre'));
multi.addEventListener('change',e=>addFiles(e.target.files));
const drop=$('[data-drop]',library);['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.style.background='rgba(127,29,29,.35)'}));['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.style.background='';if(t==='drop')addFiles(e.dataTransfer.files)}));
library.addEventListener('dragover',e=>e.preventDefault());library.addEventListener('drop',e=>{if(e.target===library){e.preventDefault();addFiles(e.dataTransfer.files)}});
controls.querySelector('[data-play]').addEventListener('click',()=>video.paused?video.play().catch(()=>{}):video.pause());
controls.querySelector('[data-prev]').addEventListener('click',()=>loadAt(state.activeIndex-1));controls.querySelector('[data-next]').addEventListener('click',()=>loadAt(state.activeIndex+1));
controls.querySelector('[data-audio]').addEventListener('click',()=>{const b=document.querySelector('[data-player-action="audio"]');if(b)b.click();else if(window.imaxAudioTrackManager)window.imaxAudioTrackManager.openTrackPicker()});
controls.querySelector('[data-theatre]').addEventListener('click',()=>setMode('theatre'));
controls.querySelector('[data-speed]').addEventListener('change',e=>{video.playbackRate=Number(e.target.value);if(window.imaxAudioTrackManager)window.imaxAudioTrackManager.setPlaybackRate(video.playbackRate)});
const subtitleInput=document.createElement('input');subtitleInput.type='file';subtitleInput.accept='.vtt,text/vtt';subtitleInput.hidden=true;document.body.appendChild(subtitleInput);
controls.querySelector('[data-subtitle]').addEventListener('click',()=>subtitleInput.click());
subtitleInput.addEventListener('change',()=>{const f=subtitleInput.files&&subtitleInput.files[0];if(!f)return;if(state.subtitleUrl)URL.revokeObjectURL(state.subtitleUrl);if(state.subtitleTrack)state.subtitleTrack.remove();state.subtitleUrl=URL.createObjectURL(f);const track=document.createElement('track');track.kind='subtitles';track.label=f.name;track.srclang='en';track.src=state.subtitleUrl;track.default=true;video.appendChild(track);state.subtitleTrack=track;track.addEventListener('load',()=>{try{track.track.mode='showing'}catch(_){}})});
const seek=controls.querySelector('[data-seek]');seek.addEventListener('input',()=>{if(Number.isFinite(video.duration)&&video.duration>0)video.currentTime=(Number(seek.value)/1000)*video.duration});
video.addEventListener('timeupdate',()=>{if(!Number.isFinite(video.duration)||video.duration<=0)return;seek.value=String(Math.round(video.currentTime/video.duration*1000));controls.querySelector('[data-current]').textContent=fmt(video.currentTime);controls.querySelector('[data-duration]').textContent=fmt(video.duration)});
video.addEventListener('play',()=>controls.querySelector('[data-play]').textContent='Ⅱ');video.addEventListener('pause',()=>controls.querySelector('[data-play]').textContent='▶');video.addEventListener('loadedmetadata',()=>{controls.querySelector('[data-duration]').textContent=fmt(video.duration)});
const headerRight=document.querySelector('header > div:last-child');if(headerRight){const launch=document.createElement('button');launch.id='imax-library-launch';launch.innerHTML='<i class="fa-solid fa-photo-film"></i><span>Library</span>';launch.addEventListener('click',openLibrary);headerRight.insertBefore(launch,headerRight.firstChild)}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&library.classList.contains('open'))closeLibrary()});
window.imaxVideoPlayer={openLibrary,addFiles,setMode,get state(){return {...state,files:state.files.map(f=>f.name)}}};
})();