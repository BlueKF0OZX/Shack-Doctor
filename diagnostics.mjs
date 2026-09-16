export const fields = {
  Rig: 'Radio model', CATSerialPort: 'CAT port', CATSerialRate: 'CAT speed',
  CATNetworkPort: 'Network CAT address', SoundInName: 'Receive audio',
  SoundOutName: 'Transmit audio', UDPServer: 'UDP destination', UDPServerPort: 'UDP port'
};

// Only collect troubleshooting fields. Never retain passwords, callsigns, or the complete INI.
export function parseIni(text) {
  let section = ''; const result = {};
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[;#]/.test(line)) continue;
    if (/^\[.*\]$/.test(line)) { section = line.slice(1, -1); continue; }
    if (section !== 'Configuration') continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    if (Object.hasOwn(fields, key)) result[key] = line.slice(index + 1).trim().replace(/^"(.*)"$/, '$1');
  }
  return result;
}

export function compare(current, baseline) {
  if (!baseline) return [];
  return Object.entries(fields).filter(([key]) => (current[key] ?? '') !== (baseline[key] ?? ''))
    .map(([key, label]) => ({key, label, before: baseline[key] || 'Not configured', after: current[key] || 'Not configured'}));
}

export function diagnose(scan) {
  const c = scan.config || {}; const items = [];
  const add = (id, status, title, summary, evidence, steps) => items.push({id, status, title, summary, evidence, steps});
  add('config', Object.keys(c).length ? 'pass' : 'unknown', 'WSJT-X configuration',
    Object.keys(c).length ? `${scan.configSource || 'Configuration'} inspected` : scan.errors?.config || 'No supported configuration found',
    [...Object.entries(c).map(([k,v]) => `${fields[k]}: ${v}`), ...(scan.errors?.config ? [scan.errors.config] : [])],
    ['Open WSJT-X once and save your settings.', 'For a custom instance, use Import settings and select its WSJT-X.ini file. Only diagnostic fields are read.']);
  const port = (c.CATSerialPort || '').replace(/^\\\\\.\\/, '').toUpperCase();
  // WSJT-X can retain an old serial-port value after switching to a CAT proxy.
  const proxyRig = /net rigctl|ham radio deluxe|dx lab|flrig|omni.?rig|tci/i.test(c.Rig || '');
  const serial = /^COM\d+$/.test(port) && Boolean(c.Rig) && c.Rig !== 'None' && !proxyRig;
  const exists = scan.ports?.some(p => p.port.toUpperCase() === port);
  const portsUnknown = scan.errors?.ports || !Array.isArray(scan.ports);
  add('radio', !serial || portsUnknown ? 'unknown' : exists ? 'pass' : 'issue', 'Radio connection',
    !serial ? 'Direct serial CAT could not be assessed' : portsUnknown ? 'Windows device list could not be read' : exists ? `${port} is present in Windows` : `${port} is configured, but missing`,
    [`Configured radio: ${c.Rig || 'Unknown'}`, `Configured port: ${c.CATSerialPort || 'None'}`, ...(scan.ports || []).map(p => `${p.port} · ${p.name}`), 'Device presence does not verify CAT communication or identify which port belongs to your radio.'],
    ['Confirm the radio is powered on and its USB cable is connected.', 'In Windows Device Manager → Ports, identify the port belonging to your radio.', 'In WSJT-X → Settings → Radio, match the serial port and the radio’s CAT baud rate.', 'Use Test CAT in WSJT-X after checking these settings.']);
  const audio = c.SoundInName || '';
  const suspicious = /webcam|microphone array|realtek|facetime/i.test(audio);
  const normalize = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const audioMatch = scan.audio?.some(a => normalize(a.name) === normalize(audio) && a.status === 'OK');
  const audioUnknown = scan.errors?.audio || !Array.isArray(scan.audio);
  add('audio', !audio || audioUnknown ? 'unknown' : suspicious ? 'review' : audioMatch ? 'pass' : 'review', 'Receive audio',
    !audio ? 'No receive device setting found' : audioUnknown ? 'Audio devices could not be inspected' : suspicious ? 'Is this your intended radio input?' : audioMatch ? 'Configured endpoint is present' : 'Confirm the selected audio endpoint',
    [`WSJT-X input: ${audio || 'Unknown'}`, `WSJT-X output: ${c.SoundOutName || 'Unknown'}`, ...(scan.audio || []).map(a => `${a.name} (${a.status || 'present'})`), 'Device names may differ between Windows and Qt. Audio levels and direction are not measured.'],
    ['Open WSJT-X → Settings → Audio.', 'Match Input to the radio’s receive-audio device. A PC microphone may be intentional for acoustic coupling.', 'Observe the WSJT-X input meter and waterfall while receiving. Check the radio manual for USB audio routing.']);
  const programs = scan.programs || [];
  const programsUnknown = scan.errors?.programs || !Array.isArray(scan.programs);
  add('apps', programsUnknown ? 'unknown' : programs.length > 1 ? 'review' : 'pass', 'Station applications',
    programsUnknown ? 'Application inventory unavailable' : programs.length > 1 ? `${programs.length} radio applications are running` : programs.length ? `${programs[0]} is running` : 'No recognized radio applications running',
    [...programs, 'This check cannot identify serial-port ownership. Several applications can coexist when configured to share a CAT service.'],
    ['If CAT fails, check whether more than one application is configured to open the same serial port directly.', 'Use a compatible shared rig-control service, or close the competing application and retry Test CAT.']);
  add('clock', 'unknown', 'Clock synchronization', scan.clock?.status === 'Running' ? 'Time service running; offset unmeasured' : 'Clock accuracy has not been verified',
    [`Windows Time service: ${scan.clock?.status || 'Unavailable'}`, 'A running service does not prove that the clock is synchronized. Third-party time software may manage it.'],
    ['Check your time synchronization application for a recent successful sync and measured offset.', 'WSJT-X decoding needs accurate timing. A service state alone is insufficient evidence.']);
  add('logging', 'unknown', 'Logbook connection', c.UDPServer ? `UDP configured for ${c.UDPServer}:${c.UDPServerPort || 'unspecified'}` : 'No UDP destination found',
    ['Configuration inspection only. No test QSO has been sent and delivery has not been verified.'],
    ['Compare the WSJT-X UDP destination and port with your logger’s integration settings.', 'After a real contact, confirm the QSO appears in the destination logbook.']);
  return items;
}

export function demoScan(healthy = false) {
  return {
    source: 'demo', scannedAt: new Date().toISOString(), configSource: 'Example WSJT-X configuration',
    config: {Rig: 'Icom IC-7300', CATSerialPort: healthy ? 'COM5' : 'COM3', CATSerialRate: '115200', SoundInName: healthy ? 'Microphone (USB Audio CODEC)' : 'Microphone Array (Realtek Audio)', SoundOutName: 'Speakers (USB Audio CODEC)', UDPServer: '127.0.0.1', UDPServerPort: '2237'},
    ports: [{port:'COM5', name:'Silicon Labs CP210x USB to UART Bridge'}],
    audio: [{name:'Microphone (USB Audio CODEC)',status:'OK'}, {name:'Speakers (USB Audio CODEC)',status:'OK'}, {name:'Microphone Array (Realtek Audio)',status:'OK'}],
    programs: healthy ? ['wsjtx'] : ['wsjtx','Log4OM2'], clock: {status:'Running'}, errors: {}
  };
}

export function formatReport(scan) {
  const labels={pass:'CHECK PASSED',issue:'ISSUE FOUND',review:'REVIEW',unknown:'UNVERIFIED'};
  return ['SHACK DOCTOR · DIAGNOSTIC REPORT',`Source: ${scan.source==='demo'?'DEMO — SYNTHETIC EXAMPLE':'This computer'}`,`Inspected: ${scan.scannedAt}`,scan.configImportedAt?`Settings imported: ${scan.configImportedAt}`:'','',
    ...diagnose(scan).flatMap(c=>[`${c.title.toUpperCase()} — ${labels[c.status]}`,c.summary,...c.evidence.map(e=>'  '+e),'Next steps:',...c.steps.map((v,i)=>`  ${i+1}. ${v}`),'']),
    'LIMITS','Read-only inventory and configuration inspection. No CAT communication, audio-level, clock-offset, port-ownership, or log delivery tests were performed.',
    'This report includes diagnostic device names and configured network destinations. Review it before sharing.'].join('\n');
}
