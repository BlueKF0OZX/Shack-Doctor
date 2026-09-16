import http from 'node:http';
import {readFileSync, writeFileSync, mkdirSync, renameSync, existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes, randomUUID} from 'node:crypto';
import {parseIni, diagnose, compare, demoScan, formatReport} from './diagnostics.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SHACK_DOCTOR_PORT || 4783);
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(24).toString('hex');
const dataDir = process.env.SHACK_DOCTOR_DATA_DIR || path.join(root, 'data');
mkdirSync(dataDir, {recursive:true});
const statePath = path.join(dataDir, 'stations.json');
let state = {profiles:[], history:[]};
if (existsSync(statePath)) {
  // A corrupt file is never silently overwritten.
  state = JSON.parse(readFileSync(statePath, 'utf8'));
  if (!Array.isArray(state.profiles) || !Array.isArray(state.history)) throw new Error('Invalid saved station data');
}
let latest = null, scanning = false;
function persist() {
  writeFileSync(statePath + '.tmp', JSON.stringify(state, null, 2), {mode:0o600});
  renameSync(statePath + '.tmp', statePath);
}
function response(res, status, value) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
function enrich(scan) { return {...scan, checks:diagnose(scan)}; }
async function collect() {
  if (process.platform !== 'win32') throw new Error('Live inspection requires Windows. You can still explore the demo station.');
  const {stdout} = await promisify(execFile)('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'collect.ps1')], {timeout:20000, maxBuffer:2*1024*1024, windowsHide:true});
  const devices = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  const scan = {...devices, source:'live', scannedAt:new Date().toISOString(), config:{}, configSource:null};
  if (process.env.LOCALAPPDATA) {
    try {
      const file = await readFile(path.join(process.env.LOCALAPPDATA, 'WSJT-X', 'WSJT-X.ini'), 'utf8');
      scan.config = parseIni(file); scan.configSource = 'Default WSJT-X.ini';
    } catch (e) { if (e.code !== 'ENOENT') scan.errors.config = 'WSJT-X settings could not be read'; }
  }
  return scan;
}
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw Object.assign(new Error('Expected JSON'), {status:415});
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 256000) throw Object.assign(new Error('Request too large'), {status:413}); chunks.push(chunk); }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { throw Object.assign(new Error('Expected a valid JSON object'), {status:400}); }
}
const assets = {'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return response(res,403,{error:'Local access only'});
  const url = new URL(req.url, origin);
  try {
    if (req.method === 'GET' && Object.hasOwn(assets,url.pathname)) {
      const file = assets[url.pathname]; res.writeHead(200,{'Content-Type':mime[path.extname(file)]}); return res.end(await readFile(path.join(root,'public',file)));
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return response(res,200,{application:'shack-doctor',version:'0.1.0',token, ...state, latest:latest && enrich(latest)});
    if (req.method === 'GET' && url.pathname === '/api/report') {
      if (!latest) return response(res,400,{error:'Run a station check first'});
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="shack-doctor-${latest.source}-${latest.scannedAt.slice(0,10)}.txt"`});
      return res.end(formatReport(latest));
    }
    if (req.method === 'GET' && url.pathname === '/api/report/preview') {
      if (!latest) return response(res,400,{error:'Run a station check first'});
      return response(res,200,{report:formatReport(latest)});
    }
    if (req.method !== 'POST') return response(res,404,{error:'Not found'});
    if (req.headers['x-shack-token'] !== token) return response(res,403,{error:'Reload the app and try again'});
    const input = await body(req);
    if (url.pathname === '/api/scan') {
      if (scanning) return response(res,409,{error:'A station check is already running'});
      scanning = true;
      try {
        latest = input.mode === 'demo' ? demoScan() : await collect();
        const scan = enrich(latest);
        state.history.unshift({id:randomUUID(), at:latest.scannedAt, source:latest.source, issues:scan.checks.filter(c=>c.status==='issue').length, reviews:scan.checks.filter(c=>c.status==='review').length, unverified:scan.checks.filter(c=>c.status==='unknown').length});
        state.history = state.history.slice(0,30); persist();
        return response(res,200,scan);
      } finally { scanning = false; }
    }
    if (url.pathname === '/api/import') {
      if (!latest || latest.source !== 'live') return response(res,400,{error:'Check this computer before importing its settings'});
      if (scanning) return response(res,409,{error:'Wait for the station check to finish'});
      if (typeof input.text !== 'string') return response(res,400,{error:'Choose a WSJT-X INI file'});
      const config = parseIni(input.text);
      if (!Object.keys(config).length) return response(res,400,{error:'No supported WSJT-X fields found in the Configuration section'});
      latest = {...latest, config, configSource:'Imported WSJT-X settings', configImportedAt:new Date().toISOString()};
      return response(res,200,enrich(latest));
    }
    if (url.pathname === '/api/profile') {
      if (scanning) return response(res,409,{error:'Wait for the station check to finish'});
      if (!latest || !Object.keys(latest.config).length) return response(res,400,{error:'Inspect a station configuration first'});
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 60) return response(res,400,{error:'Use a profile name between 1 and 60 characters'});
      if (state.profiles.length >= 30) return response(res,400,{error:'Profile limit reached. Remove an old profile first.'});
      const profile = {id:randomUUID(),name:input.name.trim(),savedAt:new Date().toISOString(), source:latest.source, config:latest.config, working:input.working===true};
      state.profiles.unshift(profile); persist(); return response(res,200,profile);
    }
    if (url.pathname === '/api/profile/delete') {
      state.profiles = state.profiles.filter(p=>p.id!==input.id); persist(); return response(res,200,{ok:true});
    }
    if (url.pathname === '/api/compare') {
      const profile = state.profiles.find(p=>p.id===input.id);
      if (!profile || !latest) return response(res,400,{error:'Select a saved profile and run a station check'});
      if (profile.source !== latest.source) return response(res,400,{error:'Demo profiles can only be compared with demo scans; live profiles with live scans'});
      return response(res,200,{profile,changes:compare(latest.config,profile.config)});
    }
    if (url.pathname === '/api/demo/baseline') {
      const existing = state.profiles.find(p=>p.source==='demo' && p.name==='Home shack · working example');
      if (existing) return response(res,200,existing);
      if (state.profiles.length >= 30) return response(res,400,{error:'Remove an old profile before adding the example'});
      const profile = {id:randomUUID(),name:'Home shack · working example',savedAt:new Date(Date.now()-86400000).toISOString(),source:'demo',config:demoScan(true).config,working:true};
      state.profiles.unshift(profile); persist(); return response(res,200,profile);
    }
    return response(res,404,{error:'Not found'});
  } catch(e) { response(res,e.status || 500,{error:e.message.includes('powershell') ? 'Windows inspection could not finish. Retry the check or use the demo station.' : e.message}); }
});
server.listen(port,'127.0.0.1',()=>console.log(`Shack Doctor is ready at ${origin}`));
server.on('error',e=>{console.error(e.code==='EADDRINUSE' ? `Port ${port} is busy. Set SHACK_DOCTOR_PORT to another port.` : e.message); process.exitCode=1;});
