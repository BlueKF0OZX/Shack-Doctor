# Shack Doctor

A local Windows troubleshooting workbench for amateur radio stations. Inspect the evidence, compare a saved setup, and spend less time guessing.

Looking for a QSO? Visit [On Air](https://qso.onair-radio.workers.dev/) to find an AllStar conversation.

**Version 0.1.0 — working prototype.** This is a read-only diagnostic tool, not a verified station controller or an automatic repair tool.

## Open it

Install **Node.js 22 or newer** from [nodejs.org](https://nodejs.org), then double-click **Start-ShackDoctor.cmd**. The launcher opens the local app in your browser. Keep its console window open; Ctrl+C stops the service. There are no third-party packages to install.

Alternatively, from this folder:

```powershell
npm start
```

Open [Shack Doctor](http://127.0.0.1:4783). The service binds only to `127.0.0.1`, not the LAN. If the port is occupied, set `SHACK_DOCTOR_PORT` to another port before starting.

## Try the complete workflow

1. Choose **Explore demo**. All synthetic results are visibly labeled.
2. Open **Radio connection**. The sample configuration points at COM3 while Windows lists COM5; the next steps explain how to check the correct port.
3. Choose **What changed?** to compare with the example working setup. It shows the changed CAT port and receive audio device.
4. Choose **Check this computer** to inspect actual Windows devices, recognized radio applications, the Windows Time service, and default WSJT-X diagnostic settings.
5. If you use a named/custom WSJT-X instance, choose **Import its settings** after the live inspection and select that instance's INI file. A new inspection reloads the default configuration.
6. **Save this setup** to keep its diagnostic fields. Mark it working only after successful operation. Saved setups can be compared, inspected, or removed.
7. Download a plain-text diagnostic report with evidence and suggested next steps.

## What is implemented

- Windows serial-port and audio-endpoint inventory using read-only CIM queries.
- Default WSJT-X INI inspection and manual INI import, limited to an explicit diagnostic-field allowlist.
- Six evidence-led checks: configuration, serial-port presence, receive-audio selection, running applications, clock service, and logbook UDP configuration.
- Distinct **passed**, **issue**, **review**, and **unverified** results. The dial counts inspection checks; it is not a station health score.
- Local named snapshots, operator-confirmed working setups, field-by-field comparison, and the last 30 inspection summaries.
- Clearly separated demo and live data, responsive interface, keyboard-accessible dialogs, reduced-motion support, and downloadable reports.
- No external frontend libraries, analytics, remote fonts, or cloud services.

## Current limits

- No serial ports are opened; no CAT commands, PTT, audio capture, transmission, or radio configuration writes occur.
- A present port does not establish which radio it belongs to, verify the baud rate, or prove CAT communication. No specific radio model is certified yet. The IC-7300 demo is illustrative, not hardware validation.
- The audio check matches names conservatively. It does not measure level, direction, sample rate, clipping, routing, or distinguish every Qt/Windows naming variation. Some legitimate PC inputs are flagged for review, not diagnosed as broken.
- Application inventory does not identify the owner of an open COM port.
- Windows Time service state is observed, but clock offset and synchronization accuracy are **not measured**.
- UDP destination settings are inspected; QSO delivery, logger integration, and network reachability are **not tested**.
- Snapshots preserve only diagnostic settings. They are **not full backups**, and automatic repair/restore and profile switching are not implemented.
- Only the default `%LOCALAPPDATA%\WSJT-X\WSJT-X.ini` is discovered automatically. Qt multi-configuration layouts, named instances, and unusual serialized values may require manual review. Imported files need a `[Configuration]` section.
- If Windows inventory is blocked, checks remain unverified. Run under a normal Windows user session; the app does not request administrator access.
- The server is designed for one local operator. Do not expose it through a proxy or public tunnel.

## Data and privacy

Saved snapshots and history live in `data/stations.json` beside the app (ignored by Git). `SHACK_DOCTOR_DATA_DIR` can select a different data directory. The current scan is held in memory and disappears on service restart.

The configuration allowlist covers radio model, CAT port/speed/network address, audio device names, and UDP destination/port. Callsign, passwords, full INI contents, and process command lines are not retained by the application. Reports contain device names and configured network destinations; review them before sharing. No report is uploaded automatically.

The server validates Host and Origin headers, refuses cross-site requests, requires an in-memory token for actions, limits request size, serves only four public assets, and sets a restrictive Content Security Policy. These controls do not replace OS account security.

## Validation

```powershell
npm test
```

Tests exercise parsing/privacy, conservative diagnoses, snapshot comparison, real HTTP endpoints, request guards, input limits, persistence across restart, source separation, and the Windows collector path. Integration tests use isolated temporary storage and fixture settings, never your real WSJT-X configuration.

See [VALIDATION.md](VALIDATION.md) for the verified prototype flows and remaining hardware checks.

## References

The diagnostic field names follow the [WSJT-X configuration source](https://github.com/WSJTX/wsjtx/blob/master/Configuration.cpp). Operating guidance refers to the [official WSJT-X user guide](https://wsjt.sourceforge.io/wsjtx-main_en.html). Software observations are intentionally kept separate from conclusions requiring hardware or timing measurements.
