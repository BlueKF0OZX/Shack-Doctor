import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let child,temp,base,token,port;
async function start(){
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,SHACK_DOCTOR_PORT:String(port),SHACK_DOCTOR_DATA_DIR:path.join(temp,'state'),LOCALAPPDATA:path.join(temp,'appdata')},windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw new Error('Server exited: '+output);
    try{const r=await fetch(base+'/api/state');if(r.ok){token=(await r.json()).token;return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }throw new Error('Server did not start: '+output);
}
async function stop(){if(child&&child.exitCode===null){const stopped=once(child,'exit');child.kill();await stopped;}}
async function post(route,data={},headers={}){return fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Shack-Token':token,...headers},body:JSON.stringify(data)});}
before(async()=>{
  temp=await mkdtemp(path.join(os.tmpdir(),'shack-doctor-test-'));
  const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');port=listener.address().port;await new Promise(resolve=>listener.close(resolve));base=`http://127.0.0.1:${port}`;
  await mkdir(path.join(temp,'appdata','WSJT-X'),{recursive:true});
  await writeFile(path.join(temp,'appdata','WSJT-X','WSJT-X.ini'),'[Configuration]\nRig=Icom IC-7300\nCATSerialPort=COM99\nSoundInName=Fixture input\nEQSLPasswd=fixture-secret\nMyCall=PRIVATE\n');
  await start();
});
after(async()=>{await stop();if(temp&&path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('shack-doctor-test-'))await rm(temp,{recursive:true,force:true});});

test('all shipped browser assets serve with the intended types and security headers',async()=>{
  for(const [route,type] of [['/','text/html'],['/styles.css','text/css'],['/app.js','text/javascript'],['/favicon.svg','image/svg+xml']]){
    const response=await fetch(base+route);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(type));assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.ok((await response.text()).length>0);
  }
});
test('cross-origin requests, forged hosts and missing tokens are rejected',async()=>{
  assert.equal((await post('scan',{mode:'demo'},{Origin:'https://example.com'})).status,403);
  // fetch normalizes Host; a raw HTTP request verifies the actual rebinding guard.
  const forgedStatus=await new Promise((resolve,reject)=>{http.get(base+'/api/state',{headers:{Host:'attacker.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
  assert.equal(forgedStatus,403);
  assert.equal((await fetch(base+'/api/state',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await post('scan',{mode:'demo'},{'X-Shack-Token':'wrong'})).status,403);
});
test('the web server never serves private source or saved state',async()=>{
  for(const route of ['/server.mjs','/data/stations.json','/collect.ps1','/../package.json','/%2e%2e/package.json'])assert.equal((await fetch(base+route)).status,404);
});
test('malformed and oversized requests get explicit client errors',async()=>{
  assert.equal((await post('scan',null)).status,400);
  assert.equal((await post('scan',[])).status,400);
  assert.equal((await post('scan',{}, {'Content-Type':'text/plain'})).status,415);
  assert.equal((await post('import',{text:'x'.repeat(256100)})).status,413);
  assert.equal((await fetch(base+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json','X-Shack-Token':token},body:'{'})).status,400);
});
test('demo scan, baseline, comparison and persistent snapshots work end-to-end',async()=>{
  const scan=await (await post('scan',{mode:'demo'})).json();assert.equal(scan.source,'demo');assert.equal(scan.checks.length,6);
  const baseline=await (await post('demo/baseline')).json();
  const repeat=await (await post('demo/baseline')).json();assert.equal(repeat.id,baseline.id);
  const comparison=await (await post('compare',{id:baseline.id})).json();assert.equal(comparison.changes.length,2);
  const snapshot=await (await post('profile',{name:'Test snapshot <script>',working:false})).json();assert.equal(snapshot.working,false);
  const state=await (await fetch(base+'/api/state')).json();assert.equal(state.profiles.length,2);assert.equal(state.history[0].unverified,2);
  await stop();await start();
  const restarted=await (await fetch(base+'/api/state')).json();assert.equal(restarted.profiles.length,2);assert.equal(restarted.latest,null);
  assert.equal((await post('compare',{id:snapshot.id})).status,400);
  await post('profile/delete',{id:snapshot.id});
  assert.equal((await (await fetch(base+'/api/state')).json()).profiles.length,1);
});
test('profile and import validation preserve state on invalid input',async()=>{
  await post('scan',{mode:'demo'});
  assert.equal((await post('profile',{name:' '})).status,400);
  assert.equal((await post('profile',{name:'x'.repeat(61)})).status,400);
  assert.equal((await post('import',{text:'[Configuration]\nRig=Unexpected'})).status,400);
  assert.equal((await post('compare',{id:'missing'})).status,400);
});
test('reports offer a readable preview and a real downloadable attachment',async()=>{
  await post('scan',{mode:'demo'});
  const response=await fetch(base+'/api/report');assert.equal(response.status,200);
  assert.match(response.headers.get('content-disposition'),/^attachment; filename="shack-doctor-demo-/);
  const text=await response.text();assert.match(text,/DEMO — SYNTHETIC EXAMPLE/);assert.match(text,/COM3 is configured, but missing/);assert.match(text,/offset.*tests were performed/);
  const preview=await (await fetch(base+'/api/report/preview')).json();assert.equal(preview.report,text);
});
test('Windows inspection, settings import and source separation', {skip:process.platform!=='win32',timeout:30000},async()=>{
  const response=await post('scan',{mode:'live'});assert.equal(response.status,200);
  const scan=await response.json();assert.equal(scan.source,'live');assert.equal(scan.config.Rig,'Icom IC-7300');assert.ok(!JSON.stringify(scan).includes('fixture-secret'));assert.ok(!JSON.stringify(scan).includes('PRIVATE'));
  assert.ok(Array.isArray(scan.ports));assert.ok(Array.isArray(scan.audio));
  const baseline=(await (await fetch(base+'/api/state')).json()).profiles[0];assert.equal((await post('compare',{id:baseline.id})).status,400);
  assert.equal((await post('import',{text:'[Other]\nRig=wrong'})).status,400);
  const imported=await (await post('import',{text:'[Configuration]\nRig=Yaesu FT-991A\nCATSerialPort=COM7\nEQSLPasswd=do-not-retain'})).json();assert.equal(imported.configSource,'Imported WSJT-X settings');assert.equal(imported.config.Rig,'Yaesu FT-991A');assert.ok(!JSON.stringify(imported).includes('do-not-retain'));
  const saved=await (await post('profile',{name:'Live fixture',working:true})).json();assert.equal(saved.source,'live');
  const disk=await readFile(path.join(temp,'state','stations.json'),'utf8');assert.ok(!disk.includes('fixture-secret'));assert.ok(!disk.includes('do-not-retain'));
});
