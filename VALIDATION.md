# Prototype validation

Validated on Windows on 2026-09-16 with Node.js v24.19.0.

## Completed

- **20 automated tests pass**, with no skips on Windows: INI allowlisting, privacy filtering, missing-port detection, inventory-access failures, retained serial settings under a CAT proxy, audio endpoint states, unknown timing/delivery, comparisons, HTTP asset serving, Host/Origin/token guards, input limits, private-file protection, profile persistence across process restart, source separation, settings import, and report preview/download.
- Server, browser JavaScript, and diagnostic module syntax checked. PowerShell launcher parsed and launched successfully with its `-NoBrowser` option.
- The Windows collector detected local serial and audio devices and observed the Windows Time service. No transceiver was connected for this test.
- Restricted Windows inventory was also exercised. Blocked queries are surfaced as **unverified**, never as a detected missing radio.
- Browser demo inspection displays one missing port, two review findings, two unverified checks, and one passed configuration inspection.
- The example working setup comparison displays precisely the changed CAT port and receive-audio input.
- Profile creation, literal rendering of a name containing angle brackets, saved setup navigation, and scan-history navigation verified. The temporary UI-test profile was removed afterward; the example profile remains.
- Real Windows inspection through the browser completed, with absent WSJT-X settings accurately shown as unverified.
- A synthetic INI fixture imported through the browser file picker; imported configuration was diagnosed against the current Windows inventory. The fixture password field was excluded by the allowlist.
- Attention filter reduced the demo result list to its three flagged findings.
- Report preview verified and a real attachment download completed through the in-app browser.
- Keyboard Tab navigation inside the comparison dialog and Escape closing verified. Closing returns focus to the triggering comparison button.
- Desktop and 390px phone layouts visually inspected. 320px, 390px, and 768px widths checked for horizontal overflow; none found. Viewport overrides reset afterward.
- No browser warnings or errors observed in the completed flows.

## Fixes made during validation

- Corrected a security test that used fetch to forge Host; fetch normalizes that header, so the test now sends a raw HTTP request.
- Replaced an unreliable browser-generated Blob download with a report preview and a proper HTTP attachment. Added automated coverage.
- Prevented unavailable Windows inventory and unhealthy audio endpoints from reporting false passes.
- Prevented stale serial-port values under known CAT proxy configurations from producing false missing-port diagnoses.
- Corrected the comparison dialog's focus restoration by preserving its triggering element.

## Not validated or implemented

- No transceiver was connected. No specific radio model, driver combination, or firmware version is certified.
- No CAT or PTT commands are sent. Audio samples are not captured, and clock offset is not measured.
- Serial-port ownership and actual logger/QSO delivery are not measured.
- Full configuration backup, restore, automatic repair, and station-setting switching are not implemented.
- No installer or bundled Node runtime is supplied. The browser-opening branch of the launcher is provided but was not invoked during automated validation; the existing in-app browser was reused.
- This is a locally operated alpha prototype, not a hosted diagnostic service.

The next meaningful field test is a Windows station with WSJT-X and a connected transceiver: capture a known-working snapshot, deliberately change a supported diagnostic setting in WSJT-X, and check that Shack Doctor identifies the change while leaving the radio untouched.
