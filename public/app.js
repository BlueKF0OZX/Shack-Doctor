const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons = {
 radio:'<rect x="3" y="8" width="18" height="12" rx="2"/><path d="m6 8 10-5M6 12h6M6 16h6"/><circle cx="17" cy="14" r="2"/>',
 audio:'<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/>',
 config:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4m-5-9 3 3 6-6"/>',
 apps:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
 logging:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>'
};
const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] || icons.config}</svg>`;
const labels = {pass:'CHECK PASSED',issue:'ISSUE FOUND',review:'REVIEW',unknown:'UNVERIFIED'};
const fields = {Rig:'Radio model',CATSerialPort:'CAT port',CATSerialRate:'CAT speed',CATNetworkPort:'Network CAT address',SoundInName:'Receive audio',SoundOutName:'Transmit audio',UDPServer:'UDP destination',UDPServerPort:'UDP port'};
let state = {profiles:[],history:[],latest:null}, filter = 'all', activeView = 'station', busy = false, selectedProfile = null, toastTimer;
const fmt = value => new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,6000); }
async function api(route, data) {
  const response = await fetch(`/api/${route}`, data === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json','X-Shack-Token':state.token},body:JSON.stringify(data)});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The operation could not finish.');
  return result;
}
async function refresh() { state = await api('state'); render(); }
function notice(message, error=false) { $('#notice').hidden=!message; $('#notice').classList.toggle('error',error); $('#notice').textContent=message; }
function setBusy(value) {
  busy=value; document.body.classList.toggle('busy',value); $('#main').setAttribute('aria-busy',String(value));
  $('#scan').disabled=value; $('#demo').disabled=value; $('#save').disabled=value || !Object.keys(state.latest?.config || {}).length;
  $('#import').disabled=value || state.latest?.source!=='live'; $('#export').disabled=value || !state.latest;
  $('#scan').innerHTML=value ? 'Inspecting station…' : '<span>⌁</span> Check this computer';
  if(value){$('#pass-count').textContent='…';$('#dial-label').textContent='INSPECTING';$('#health-title').textContent='Listening to the evidence.';$('#health-summary').textContent='Reading device inventory and supported settings. This may take up to 20 seconds.';}
}
async function scan(mode) {
  if(busy) return; showView('station'); setBusy(true); notice('');
  try {
    await api('scan',{mode});
    if(mode==='demo') { try { const profile=await api('demo/baseline',{}); selectedProfile=profile.id; } catch(e) {toast(e.message);} }
    else selectedProfile=null;
    await refresh(); toast(mode==='demo' ? 'Demo loaded. Explore the findings or compare the working setup.' : 'Station inspection complete. Open a check for its evidence.');
  } catch(e) {render();notice(e.message,true);}
  finally{setBusy(false);}
}
function showView(view) {
  activeView=view;
  for(const name of ['station','profiles','history']) $(`#${name}-view`).hidden=name!==view;
  $$('.nav').forEach(button=>{button.classList.toggle('active',button.dataset.view===view);if(button.dataset.view===view)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  const names={station:['Station check','Know your station.','Follow the evidence. Find the break. Get back on the air.'],profiles:['Saved setups','Keep the good days.','Your station settings, preserved for the next time something changes.'],history:['Check history','A record of the evidence.','The last 30 inspections on this computer. Demo checks stay clearly labeled.']};
  $('#crumb').textContent=names[view][0];$('#page-title').textContent=names[view][1];$('#page-subtitle').textContent=names[view][2];
}
function render() {
  const scan=state.latest, checks=scan?.checks || [];
  const counts={pass:0,issue:0,review:0,unknown:0};checks.forEach(c=>counts[c.status]++);
  $('#profile-count').textContent=state.profiles.length;
  $('#source-badge').textContent=scan ? scan.source==='demo'?'DEMO STATION':'THIS COMPUTER' : 'NOT CHECKED';
  $('#source-badge').className=`badge ${scan?.source || ''}`;
  $('#pass-count').textContent=scan?`${counts.pass}/6`:'—';
  $('#dial-label').textContent=scan?'CHECKS PASSED':'AWAITING CHECK';
  $('#dial').className=`dial count-${counts.pass}`;
  $('#health-title').textContent=!scan?'Start with a station check.':counts.issue?'We found a break.':counts.review?'A few things to review.':'Here’s what we can verify.';
  $('#health-summary').textContent=!scan?'Inspect Windows devices and WSJT-X settings, or explore a sample station.':counts.issue?'A configured connection is missing. Start with the radio check, then review the rest of the chain.':'Passed checks confirm inventory or settings only. Unverified checks still need an operating test.';
  $('#health-chips').innerHTML=scan?Object.entries(counts).filter(([,n])=>n).map(([s,n])=>`<span class="chip ${s}">${n} ${s==='pass'?'passed':s==='issue'?'issue'+(n>1?'s':''):s==='review'?'to review':'unverified'}</span>`).join(''):'<span class="chip">6 diagnostic checks</span>';
  $('#scan-time').textContent=scan?`Inspected ${fmt(scan.scannedAt)}${scan.configImportedAt?' · settings imported':''}`:'No station data collected';
  $('#attention-count').textContent=counts.issue+counts.review;
  $('#save').disabled=busy || !Object.keys(scan?.config || {}).length;$('#export').disabled=busy || !scan;$('#import').disabled=busy || scan?.source!=='live';
  notice(scan?.source==='demo'?'DEMO STATION · These are example findings, not measurements from your computer. Use “Check this computer” for a real inspection.':scan?.configImportedAt?'Imported settings are being compared with the device inventory from your last check. A new check reloads the default WSJT-X configuration.':'');
  renderChain();renderChecks();renderBaseline();renderProfiles();renderHistory();showView(activeView);
}
function renderChain() {
  const scan=state.latest, config=scan?.config || {};
  const nodes=[['radio','Radio',config.Rig || 'Not identified'],['audio','Audio',scan?'Receive input':'Not inspected'],['config','WSJT-X',scan?.configSource?'Settings found':'Not inspected'],['apps','Applications',scan?`${scan.programs.length} running`:'Not inspected'],['logging','Logbook',config.UDPServer?'UDP configured':'Not verified']];
  $('#signal-chain').innerHTML=nodes.map(([id,name,description])=>{const check=scan?.checks.find(c=>c.id===id);return `<button class="signal-node ${check?.status || 'unknown'}" data-check="${id}" ${!scan?'disabled':''} aria-label="${name}: ${escape(description)}${check?'. '+labels[check.status]:''}"><span class="signal-icon">${icon(id)}</span><strong>${name}</strong><small>${escape(description)}</small></button>`;}).join('');
}
function renderChecks() {
  const placeholders=[['radio','Radio connection'],['audio','Receive audio'],['config','WSJT-X configuration'],['apps','Station applications'],['clock','Clock synchronization'],['logging','Logbook connection']].map(([id,title])=>({id,title,status:'unknown',summary:'Run a station check to inspect this part of your setup.'}));
  let checks=state.latest?.checks || placeholders;
  const order=['radio','audio','config','apps','clock','logging'];checks=[...checks].sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
  if(filter==='attention') checks=checks.filter(c=>['issue','review'].includes(c.status));
  $('#checks').innerHTML=checks.length?checks.map(c=>`<button class="check-card ${c.status}" data-check="${c.id}" ${!state.latest?'disabled':''}><div class="check-top"><span class="check-icon">${icon(c.id)}</span><span class="status ${c.status}">${state.latest?labels[c.status]:'NOT CHECKED'}</span></div><h3>${escape(c.title)}</h3><p>${escape(c.summary)}</p><span class="card-link">${state.latest?'View evidence & next steps':'Awaiting inspection'} <span>↗</span></span></button>`).join(''):'<div class="empty"><h2>No flagged findings.</h2><p>Unverified checks may still need your attention. Switch to All checks to see what hasn’t been tested.</p></div>';
}
function renderBaseline() {
  let profile=state.profiles.find(p=>p.id===selectedProfile && p.source===state.latest?.source);
  if(!profile) profile=state.profiles.find(p=>p.source===state.latest?.source && p.working);
  selectedProfile=profile?.id || null;
  $('#baseline-info').innerHTML=profile?`<span class="baseline-icon">▤</span><div><strong>${escape(profile.name)}</strong><small>${profile.source==='demo'?'Example':profile.working?'Operator-confirmed':'Saved snapshot'} · ${fmt(profile.savedAt)}</small><button class="text-button" data-compare="${profile.id}">What changed? ↗</button></div>`:'<span class="baseline-icon">▤</span><div><strong>No working setup selected</strong><small>Save a snapshot after a successful session.</small></div>';
}
function renderProfiles() {
  $('#profiles-view').innerHTML=`<p class="section-intro">Snapshots preserve diagnostic fields for comparison. They do not restore settings or replace a full configuration backup.</p>${state.profiles.length?`<div class="profile-grid">${state.profiles.map(p=>`<article class="panel profile-card"><div class="section-kicker"><span class="badge ${p.source}">${p.source==='demo'?'DEMO':'THIS COMPUTER'}</span><span>${p.working?'WORKING · OPERATOR CONFIRMED':'SAVED SNAPSHOT'}</span></div><h2>${escape(p.name)}</h2><p class="saved-time">Saved ${fmt(p.savedAt)}</p><dl class="profile-meta"><div><dt>RADIO</dt><dd>${escape(p.config.Rig || 'Not configured')}</dd></div><div><dt>CAT PORT</dt><dd>${escape(p.config.CATSerialPort || 'Not configured')}</dd></div><div><dt>RECEIVE AUDIO</dt><dd>${escape(p.config.SoundInName || 'Not configured')}</dd></div><div><dt>CAT SPEED</dt><dd>${escape(p.config.CATSerialRate || 'Not configured')}</dd></div></dl><div class="profile-actions"><button class="button secondary" data-compare="${p.id}" ${!state.latest || p.source!==state.latest.source?'disabled':''}>Compare with current</button><button class="text-button" data-delete="${p.id}">Remove</button></div></article>`).join('')}</div>`:'<div class="empty"><h2>Your first recovery point starts here.</h2><p>Run a station check, then save the setup. Mark it as working when you’ve successfully made contacts.</p><button class="button secondary" data-view="station">Go to station check</button></div>'}`;
}
function renderHistory() {
  $('#history-view').innerHTML=state.history.length?`<div class="history-list">${state.history.map(h=>`<article class="panel history-row"><span aria-hidden="true">⌁</span><div><h3>${fmt(h.at)}</h3><p>Inspection summary · ${h.unverified??'Unrecorded'} unverified checks</p></div><span class="badge ${h.source}">${h.source==='demo'?'DEMO':'THIS COMPUTER'}</span><div class="chips"><span class="chip ${h.issues?'issue':'pass'}">${h.issues} issues</span><span class="chip review">${h.reviews} to review</span></div></article>`).join('')}</div>`:'<div class="empty"><h2>A fresh workbench.</h2><p>Your checks will appear here. Run your first inspection or explore the demo station.</p><button class="button secondary" data-view="station">Go to station check</button></div>';
}
function detail(id) {
  const check=state.latest?.checks.find(c=>c.id===id);if(!check) return;
  $('#detail-content').innerHTML=`<span class="status ${check.status}">${labels[check.status]}</span><h2>${escape(check.title)}</h2><p>${escape(check.summary)}</p><h3>What we observed</h3><div class="evidence">${check.evidence.length?check.evidence.map(e=>`<div>${escape(e)}</div>`).join(''):'No supported configuration fields were available.'}</div><h3>What to do next</h3><ol>${check.steps.map(s=>`<li>${escape(s)}</li>`).join('')}</ol><p class="dialog-note">${state.latest.source==='demo'?'Example evidence from the demo station.':'Evidence from '+fmt(state.latest.scannedAt)+'.'} Shack Doctor does not open serial ports, key the transmitter, or change application settings.</p><div class="dialog-actions"><button class="button secondary" data-close>Got it</button></div>`;
  $('#detail').showModal();
}
async function compareProfile(id) {
  const result=await api('compare',{id});selectedProfile=id;
  $('#detail-content').innerHTML=`<span class="badge ${result.profile.source}">${result.profile.source==='demo'?'DEMO COMPARISON':'SETTINGS COMPARISON'}</span><h2>${result.changes.length?`${result.changes.length} things changed.`:'Same settings. A useful clue.'}</h2><p>Comparing the current inspection with <strong>${escape(result.profile.name)}</strong>, saved ${fmt(result.profile.savedAt)}.</p><div class="diff-list">${result.changes.map(c=>`<div class="diff-row"><div class="diff-label">${escape(c.label)}</div><div class="diff-values"><div><small>SAVED SETUP</small><span class="diff-before">${escape(c.before)}</span></div><span>→</span><div><small>CURRENT SETUP</small><span class="diff-after">${escape(c.after)}</span></div></div></div>`).join('')}</div><p class="dialog-note">${result.changes.length?'Use these differences as clues when reviewing WSJT-X settings. Changes are not automatically faults.':'The saved diagnostic settings match. Cables, hardware, audio levels, clock offset, and port ownership can still differ.'} No settings have been changed.</p><div class="dialog-actions"><button class="button secondary" data-close>Close comparison</button></div>`;
  $('#detail').showModal();
}
async function exportReport() {
  if(!state.latest) return;
  try {
    const {report}=await api('report/preview');
    $('#detail-content').innerHTML=`<h2>Your diagnostic report.</h2><p>Review device names and configured network addresses before sharing. Nothing is uploaded automatically.</p><pre class="report-preview" tabindex="0">${escape(report)}</pre><div class="dialog-actions"><button class="button secondary" data-close>Close</button><a class="button primary" href="/api/report" download>Download text report</a></div>`;
    $('#detail').showModal();
  } catch(e){toast(e.message);}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button || button.disabled) return;
  try {
    if(button.hasAttribute('data-close')) button.closest('dialog').close();
    else if(button.dataset.view) showView(button.dataset.view);
    else if(button.dataset.check) detail(button.dataset.check);
    else if(button.dataset.filter){filter=button.dataset.filter;$$('[data-filter]').forEach(b=>{b.classList.toggle('selected',b===button);b.setAttribute('aria-pressed',String(b===button));});renderChecks();}
    else if(button.dataset.compare) await compareProfile(button.dataset.compare);
    else if(button.dataset.delete){const profile=state.profiles.find(p=>p.id===button.dataset.delete);if(!profile)return;$('#detail-content').innerHTML=`<h2>Remove this snapshot?</h2><p>${escape(profile.name)} will be removed from Shack Doctor. Your application settings will stay as they are.</p><div class="dialog-actions"><button class="button secondary" data-close>Keep snapshot</button><button class="button primary" data-confirm-delete="${profile.id}">Remove snapshot</button></div>`;$('#detail').showModal();}
    else if(button.dataset.confirmDelete){button.disabled=true;await api('profile/delete',{id:button.dataset.confirmDelete});$('#detail').close();await refresh();toast('Snapshot removed.');}
  } catch(e){toast(e.message);button.disabled=false;}
});
$('#scan').addEventListener('click',()=>scan('live'));
$('#demo').addEventListener('click',()=>scan('demo'));
$('#save').addEventListener('click',()=>{$('#profile-name').value='';$('#working').checked=false;$('#save-dialog').showModal();$('#profile-name').focus();});
$('#save-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const profile=await api('profile',{name:$('#profile-name').value,working:$('#working').checked});selectedProfile=profile.id;$('#save-dialog').close();await refresh();toast('Setup saved on this computer.');}catch(e){toast(e.message);}finally{button.disabled=false;}});
$('#import').addEventListener('click',()=>$('#ini-file').click());
$('#ini-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>200000)throw new Error('Choose an INI file smaller than 200 KB.');state.latest=await api('import',{text:await file.text()});render();toast('Diagnostic settings imported. The original file was not changed.');}catch(e){toast(e.message);}finally{event.target.value='';}});
$('#export').addEventListener('click',exportReport);
for(const dialog of $$('dialog')) dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
function clock(){ $('#utc').textContent=new Date().toISOString().slice(11,19)+' UTC'; }clock();setInterval(clock,1000);
$$('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
try{await refresh();}catch(e){render();notice('Cannot reach the local service. Keep Shack Doctor running, then reload this page.',true);$('#scan').disabled=true;$('#demo').disabled=true;}
