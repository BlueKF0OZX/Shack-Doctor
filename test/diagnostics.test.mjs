import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIni, compare, diagnose, demoScan} from '../diagnostics.mjs';

const check = (scan,id) => diagnose(scan).find(c=>c.id===id);
test('INI import reads only diagnostic keys in the Configuration section',()=>{
  const ini='\uFEFF[Other]\nRig=Wrong\n[Configuration]\r\nRig="Icom IC-7300"\r\nCATSerialPort=COM5\nEQSLPasswd=secret\nMyCall=PRIVATE\n__proto__=pollution\nUDPServer=host=name\n[Other]\nCATSerialPort=COM9';
  assert.deepEqual(parseIni(ini),{Rig:'Icom IC-7300',CATSerialPort:'COM5',UDPServer:'host=name'});
  assert.equal({}.pollution,undefined);
});
test('comments, empty files, unrelated sections and unknown keys do not become evidence',()=>{
  assert.deepEqual(parseIni('; Rig=wrong\n# comment\n[General]\nRig=wrong\n[Configuration]\nUnknown=42\nInvalid'),{});
});
test('demo identifies the missing configured port, without claiming a port owner',()=>{
  const scan=demoScan();
  assert.equal(check(scan,'radio').status,'issue');
  assert.match(check(scan,'radio').summary,/COM3/);
  assert.equal(check(scan,'apps').status,'review');
  assert.match(check(scan,'apps').evidence.join(' '),/cannot identify serial-port ownership/);
});
test('Windows inventory failure is unknown, never a missing-radio diagnosis',()=>{
  const scan=demoScan();scan.errors.ports='Access denied';
  assert.equal(check(scan,'radio').status,'unknown');
  delete scan.ports;delete scan.errors.ports;
  assert.equal(check(scan,'radio').status,'unknown');
});
test('a present serial port passes presence only, including extended COM syntax',()=>{
  const scan=demoScan(true);scan.config.CATSerialPort='\\\\.\\com5';
  assert.equal(check(scan,'radio').status,'pass');
  assert.match(check(scan,'radio').evidence.join(' '),/does not verify CAT/);
});
test('None and network rig configurations are not diagnosed as missing serial hardware',()=>{
  const scan=demoScan();scan.config.Rig='None';
  assert.equal(check(scan,'radio').status,'unknown');
  scan.config.Rig='Hamlib NET rigctl';scan.config.CATSerialPort='COM99';scan.config.CATNetworkPort='127.0.0.1:4532';
  assert.equal(check(scan,'radio').status,'unknown');
});
test('PC microphone is a review item, because acoustic coupling can be intentional',()=>{
  const audio=check(demoScan(),'audio');
  assert.equal(audio.status,'review');assert.match(audio.steps.join(' '),/intentional/);
});
test('audio only passes when a matching healthy endpoint exists',()=>{
  const scan=demoScan(true);assert.equal(check(scan,'audio').status,'pass');
  scan.audio[0].status='Error';assert.equal(check(scan,'audio').status,'review');
  scan.errors.audio='Blocked';assert.equal(check(scan,'audio').status,'unknown');
});
test('clock service and UDP settings never masquerade as tested timing or delivery',()=>{
  const scan=demoScan(true);
  assert.equal(check(scan,'clock').status,'unknown');assert.equal(check(scan,'logging').status,'unknown');
  assert.match(check(scan,'clock').summary,/unmeasured/);
});
test('an empty observation does not generate false passes',()=>{
  assert.ok(diagnose({}).every(c=>c.status==='unknown'));
});
test('comparison detects modified and removed settings, ignores unapproved fields',()=>{
  const current={Rig:'Icom IC-7300',CATSerialPort:'COM3',secret:'not reportable'};
  const previous={Rig:'Icom IC-7300',CATSerialPort:'COM5',SoundInName:'USB',secret:'also secret'};
  assert.deepEqual(compare(current,previous),[
    {key:'CATSerialPort',label:'CAT port',before:'COM5',after:'COM3'},
    {key:'SoundInName',label:'Receive audio',before:'USB',after:'Not configured'}
  ]);
  assert.deepEqual(compare(current,current),[]);assert.deepEqual(compare(current,null),[]);
});
test('working demo comparison shows precisely the two changed diagnostic fields',()=>{
  assert.deepEqual(compare(demoScan().config,demoScan(true).config).map(c=>c.key),['CATSerialPort','SoundInName']);
});
