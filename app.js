/* RPP02N GitHub Pages PC + Android Web Serial / Bluetooth Classic SPP proof of concept.
 * No remote requests, no storage, no third-party dependencies.
 * Native apps and BLE GATT require separate implementations.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';
  const ANDROID_MIN_CHROME = 138;
  const state = {
    port: null,
    busy: false,
    printing: false,
    logs: [],
    sppTried: false,
    sppFound: false,
    bleTried: false,
    bleFound: false,
  };
  const encoder = new TextEncoder();
  const ESC = 0x1b;
  const LF = 0x0a;

  function log(message) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    state.logs.push(`[${time}] ${message}`);
    if (state.logs.length > 120) state.logs.shift();
    $('log').textContent = state.logs.join('\n');
    $('log').scrollTop = $('log').scrollHeight;
  }

  function setCheck(symbolId, textId, good, goodText, badText) {
    const node = $(symbolId);
    node.textContent = good ? '✓' : '×';
    node.className = `check-icon ${good ? 'good' : 'bad'}`;
    $(textId).textContent = good ? goodText : badText;
  }

  function isSupported() {
    return window.isSecureContext && 'serial' in navigator;
  }

  function clientPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
    if (/Linux|X11/i.test(ua)) return 'Linux';
    return 'Unknown device';
  }

  function chromeMajor() {
    const ua = navigator.userAgent || '';
    const match = ua.match(/(?:Chrome|CriOS)\/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  function androidRfcommBlocked() {
    const platform = clientPlatform();
    const major = chromeMajor();
    return platform === 'Android' && major !== null && major < ANDROID_MIN_CHROME;
  }

  function setVerdict(text, kind) {
    const node = $('diagnosis-next');
    if (!node) return;
    node.className = kind === 'success' ? 'notice success' : kind === 'error' ? 'notice error' : 'notice';
    node.textContent = text;
  }

  function updateVerdict() {
    if (state.port) {
      setVerdict(
        'Verdict: Browser Classic SPP works on this device. Print a sample receipt to confirm paper output. This path can later be reused in a production web app.',
        'success'
      );
      return;
    }
    if (androidRfcommBlocked()) {
      setVerdict(
        'Verdict: Android Chrome ' + chromeMajor() + ' is below ' + ANDROID_MIN_CHROME +
          '. Bluetooth RFCOMM Web Serial is unavailable — update Chrome, then use Connect RPP02N (Bluetooth SPP). Do not look for the printer in the BLE picker.',
        'error'
      );
      return;
    }
    if (state.sppTried && !state.sppFound && state.bleTried && state.bleFound) {
      setVerdict(
        'Verdict: BLE device was visible, but standard Bluetooth Classic SPP was not offered to Chrome. Browser ESC/POS printing over SPP is unproven on this stack. Identify the radio service or plan a native/bridge Phase 2.',
        'error'
      );
      return;
    }
    if (state.sppTried && !state.sppFound && state.bleTried && !state.bleFound) {
      setVerdict(
        'Verdict: Neither standard Web Serial SPP nor BLE discovered RPP02N. Browser-only Bluetooth printing is not demonstrated on this device/Chrome stack — proceed to Phase 2 (native SPP or local bridge) if needed.',
        'error'
      );
      return;
    }
    if (state.sppTried && !state.sppFound) {
      const linuxHint = clientPlatform() === 'Linux'
        ? ' On Linux, ttyS0/ttyS1 are not the printer — pair/trust RPP02N in bluetoothctl first.'
        : '';
      setVerdict(
        'Verdict: Standard SPP chooser did not yield a printer. Confirm: printer ON, paired in OS Bluetooth (PIN 0000), Thermer force-stopped, then retry SPP. Optionally run BLE visibility (diagnostic only).' + linuxHint,
        ''
      );
      return;
    }
    setVerdict(
      'Use Connect RPP02N (Bluetooth SPP) first — RPP02N is Classic SPP, not BLE. If the SPP chooser is empty, run capabilities + BLE diagnostic below for a clear verdict.',
      ''
    );
  }

  function logPreflight(mode) {
    const platform = clientPlatform();
    const major = chromeMajor();
    log('PREFLIGHT (' + mode + '): Platform=' + platform +
      ', Chrome=' + (major !== null ? major : 'not identified') +
      ', secure=' + window.isSecureContext +
      ', WebSerial=' + ('serial' in navigator));
    log('PREFLIGHT checklist: printer ON, paired in OS Bluetooth (PIN 0000/000000), Thermer/other print apps closed, real Chrome (not in-app browser).');
    if (androidRfcommBlocked()) {
      log('PREFLIGHT BLOCK: Android Chrome ' + major + ' < ' + ANDROID_MIN_CHROME +
        ' — RFCOMM Web Serial unsupported. Update Chrome before connecting.');
      return false;
    }
    if (platform === 'Android' && major !== null) {
      log('PREFLIGHT: Android Chrome ' + major + ' meets RFCOMM Web Serial minimum (' + ANDROID_MIN_CHROME + '+).');
    }
    return true;
  }

  function renderSupport() {
    const secure = window.isSecureContext;
    const serial = 'serial' in navigator;
    const platform = clientPlatform();
    const major = chromeMajor();
    setCheck('secure-symbol', 'secure-text', secure, 'Ready', 'Not secure');
    setCheck('serial-symbol', 'serial-text', serial, 'Available', 'Unsupported');

    const note = $('compatibility-note');
    if (!secure) {
      note.className = 'notice error';
      note.textContent = 'Open this app over HTTPS (such as GitHub Pages) or localhost. HTTP opened from another device is not secure enough for Web Serial.';
    } else if (!serial) {
      note.className = 'notice error';
      note.textContent = 'Web Serial is unavailable here. Use up-to-date Google Chrome on desktop, or Chrome 138+ on Android. iPhone Safari and many in-app browsers are unsupported.';
    } else if (androidRfcommBlocked()) {
      note.className = 'notice error';
      note.textContent = 'Android Chrome ' + major + ' is below 138. Update Chrome so Bluetooth RFCOMM / Web Serial can see RPP02N SPP.';
    } else {
      note.className = 'notice success';
      note.textContent = 'Browser Web Serial is available. Pair RPP02N in this device’s Bluetooth settings, then use Connect RPP02N (Bluetooth SPP).';
    }
    $('platform-note').textContent = 'Detected platform: ' + platform +
      (major !== null ? ' · Chrome ' + major : '') +
      '. “Web Serial available” only confirms the browser API exists; RPP02N printing still needs a paired Classic SPP device.';
    $('picker-tip').hidden = platform !== 'Linux';
    $('android-picker-tip').hidden = platform !== 'Android';
    $('ble-test-btn').disabled = !secure || !('bluetooth' in navigator);
    updateVerdict();
  }

  function render() {
    const ready = isSupported() && !androidRfcommBlocked();
    const connected = Boolean(state.port);
    const busy = state.busy || state.printing;
    $('connect-spp-btn').disabled = !ready || connected || busy;
    $('connect-any-btn').disabled = !isSupported() || connected || busy;
    $('custom-rfcomm-btn').disabled = !isSupported() || connected || busy;
    $('use-spp-uuid-btn').disabled = connected || busy;
    $('reconnect-btn').disabled = !isSupported() || connected || busy;
    $('disconnect-btn').disabled = !connected || busy;
    $('test-btn').disabled = !connected || busy;
    $('custom-btn').disabled = !connected || busy;
    const badge = $('connection-badge');
    if (state.busy || state.printing) {
      badge.className = 'status-pill busy';
      badge.innerHTML = '<span class="status-dot"></span> Working…';
    } else if (connected) {
      badge.className = 'status-pill active';
      badge.innerHTML = '<span class="status-dot"></span> Connected';
    } else {
      badge.className = 'status-pill idle';
      badge.innerHTML = '<span class="status-dot"></span> Not connected';
    }
  }

  function diagnostic(error) {
    const name = error && error.name ? error.name : 'Error';
    const msg = error && error.message ? error.message : String(error);
    if (name === 'NotFoundError') {
      return 'No port selected or no compatible SPP port shown. Pair RPP02N in OS Bluetooth, close Thermer, then retry Connect RPP02N (Bluetooth SPP). BLE picker cannot find Classic SPP.';
    }
    if (name === 'SecurityError') return 'Permission denied/blocked. Check Chrome site settings and HTTPS.';
    if (name === 'NotAllowedError') return 'Permission denied. Try selecting the port again.';
    if (name === 'InvalidStateError') return 'Port busy/already open. Disconnect it from Thermer or another app, then retry.';
    if (name === 'NetworkError') return 'Connection interrupted. Keep printer on, nearby and paired, then retry.';
    return name + ': ' + msg;
  }

  async function openSelected(selected, viaLabel) {
    // On Bluetooth RFCOMM-emulated serial ports, the baud rate may be ignored.
    await selected.open({ baudRate: 9600 });
    state.port = selected;
    let detail = 'Connected via Web Serial (' + viaLabel + ').';
    try {
      const info = selected.getInfo();
      const props = [];
      if (info.bluetoothServiceClassId !== undefined) props.push('Bluetooth service class: ' + info.bluetoothServiceClassId);
      if (info.usbVendorId !== undefined) props.push('USB vendor: ' + info.usbVendorId);
      if (info.usbProductId !== undefined) props.push('USB product: ' + info.usbProductId);
      if (props.length) detail = props.join(' | ') + ' · via ' + viaLabel;
    } catch (_) { /* Some browsers omit optional port metadata. */ }
    $('device-info').textContent = detail;
    $('device-info').hidden = false;
    log('CONNECTED. ' + detail);
    log('Next: press Print sample receipt.');
    updateVerdict();
  }

  async function connectWithOptions(options, modeLabel) {
    if (!isSupported() || state.busy || state.port) return;
    if (!logPreflight(modeLabel)) {
      updateVerdict();
      render();
      return;
    }
    state.busy = true;
    render();
    try {
      log('Opening ' + modeLabel + ' chooser on ' + clientPlatform() + '…');
      // Must happen directly from a real button press (transient user activation).
      const selected = await navigator.serial.requestPort(options);
      if (modeLabel === 'Bluetooth SPP') {
        state.sppTried = true;
        state.sppFound = true;
      }
      log('Port selected; opening serial connection…');
      await openSelected(selected, modeLabel);
    } catch (error) {
      if (modeLabel === 'Bluetooth SPP') {
        state.sppTried = true;
        state.sppFound = false;
      }
      log('CONNECT FAILED (' + modeLabel + '): ' + diagnostic(error));
      updateVerdict();
    } finally {
      state.busy = false;
      render();
    }
  }

  function connectSpp() {
    return connectWithOptions({
      allowedBluetoothServiceClassIds: [SPP_UUID],
      filters: [{ bluetoothServiceClassId: SPP_UUID }],
    }, 'Bluetooth SPP');
  }

  function connectAnySerial() {
    return connectWithOptions({}, 'Any serial port');
  }

  async function checkCapabilities() {
    logPreflight('capabilities');
    log('DIAGNOSTICS: WebBluetooth=' + ('bluetooth' in navigator) +
      '. A present Web Serial API does not guarantee printer discovery.');
    if (androidRfcommBlocked()) {
      log('DIAGNOSTICS: Android RFCOMM blocked until Chrome ' + ANDROID_MIN_CHROME + '+.');
    }
    if ('serial' in navigator) {
      try {
        const ports = await navigator.serial.getPorts();
        log('DIAGNOSTICS: Browser has permission for ' + ports.length + ' serial port(s).');
      } catch (error) {
        log('DIAGNOSTICS ERROR: ' + diagnostic(error));
      }
    }
    updateVerdict();
  }

  // Web Bluetooth can only see Bluetooth Low Energy GATT devices; NOT Bluetooth Classic SPP.
  // Never send printer commands to arbitrary devices found by the chooser.
  async function checkBle() {
    const result = $('ble-result');
    state.bleTried = true;
    if (!window.isSecureContext || !('bluetooth' in navigator)) {
      state.bleFound = false;
      result.className = 'notice error';
      result.textContent = 'Web Bluetooth is unavailable in this browser/context. This does not mean the printer has no BLE.';
      log('BLE DIAGNOSTIC: Web Bluetooth API not available.');
      updateVerdict();
      return;
    }
    result.className = 'notice';
    result.textContent = 'Choose RPP02N in the Bluetooth Low Energy picker, if it appears. You may cancel safely. This is diagnostic only — not for printing.';
    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['generic_access', 'device_information'],
      });
      const name = device.name || '(unnamed device)';
      state.bleFound = true;
      log('BLE DIAGNOSTIC: User selected BLE device named ' + name + '.');
      result.className = 'notice success';
      result.textContent = 'BLE device selected: ' + name + '. Checking whether its GATT connection works…';
      try {
        if (!device.gatt) throw new Error('GATT is not exposed by this selected device');
        await device.gatt.connect();
        log('BLE DIAGNOSTIC: GATT connection succeeded. This is NOT a printing test.');
        result.textContent = 'BLE GATT connected to ' + name + '. BLE is available, but printing requires finding the correct writable GATT characteristic.';
      } catch (error) {
        log('BLE DIAGNOSTIC: Selected device; GATT connect failed: ' + diagnostic(error));
        result.textContent = 'BLE device visible (' + name + '), but GATT connection failed. This does not confirm BLE printing compatibility.';
      } finally {
        if (device.gatt && device.gatt.connected) device.gatt.disconnect();
      }
    } catch (error) {
      state.bleFound = false;
      log('BLE DIAGNOSTIC: ' + diagnostic(error));
      result.className = 'notice';
      result.textContent = 'No BLE device was selected. If RPP02N was absent, BLE is unconfirmed; Classic SPP printers often cannot appear here. Use Connect RPP02N (Bluetooth SPP) instead.';
    }
    updateVerdict();
  }

  async function connectCustomRfcomm() {
    if (!isSupported() || state.busy || state.port) return;
    const uuid = $('custom-uuid').value.trim();
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)) {
      log('CUSTOM RFCOMM: Please supply a valid 128-bit UUID from the printer SDP record.');
      return;
    }
    if (!logPreflight('custom RFCOMM')) {
      updateVerdict();
      return;
    }
    state.busy = true;
    render();
    try {
      log('CUSTOM RFCOMM: Requesting access to service UUID ' + uuid + '.');
      const selected = await navigator.serial.requestPort({
        allowedBluetoothServiceClassIds: [uuid],
        filters: [{ bluetoothServiceClassId: uuid }],
      });
      await openSelected(selected, 'custom RFCOMM');
    } catch (error) {
      log('CUSTOM RFCOMM FAILED: ' + diagnostic(error));
      updateVerdict();
    } finally {
      state.busy = false;
      render();
    }
  }

  function useStandardSppUuid() {
    $('custom-uuid').value = SPP_UUID;
    log('Filled standard Bluetooth SPP UUID (' + SPP_UUID + '). Prefer the primary Connect RPP02N (Bluetooth SPP) button for the same filter.');
  }

  async function reconnectPermitted() {
    if (!isSupported() || state.busy || state.port) return;
    state.busy = true;
    render();
    try {
      const ports = await navigator.serial.getPorts();
      if (!ports.length) {
        log('No previously permitted ports. Use Connect RPP02N (Bluetooth SPP) first.');
      } else if (ports.length > 1) {
        log('Several permitted ports found. For safety, please choose the printer using Connect RPP02N (Bluetooth SPP).');
      } else {
        log('Found one permitted port; opening…');
        await openSelected(ports[0], 'reconnect');
      }
    } catch (error) {
      log('RECONNECT FAILED: ' + diagnostic(error));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function disconnect() {
    if (!state.port || state.busy || state.printing) return;
    state.busy = true;
    render();
    const oldPort = state.port;
    try {
      await oldPort.close();
      log('Port closed successfully.');
    } catch (error) {
      log('DISCONNECT WARNING: ' + diagnostic(error));
    } finally {
      state.port = null;
      state.busy = false;
      $('device-info').hidden = true;
      updateVerdict();
      render();
    }
  }

  function asciiBytes(text) {
    const normalized = text.replace(/\r\n?/g, '\n');
    if (!normalized.trim()) throw new Error('Enter some text first.');
    // Raw control characters and non-ASCII are intentionally disallowed in v1.
    if (/[^\x20-\x7e\n]/.test(normalized)) {
      throw new Error('Use English/ASCII text only for this first test. Bengali/Unicode needs bitmap rendering.');
    }
    if (normalized.length > 1500) throw new Error('Text too long (max 1500 characters).');
    return encoder.encode(normalized);
  }

  function packet(text) {
    const body = asciiBytes(text);
    // ESC @ = initialize; ESC a 0 = left alignment. LF feeds paper.
    const bytes = new Uint8Array(2 + 3 + body.length + 3);
    bytes.set([ESC, 0x40, ESC, 0x61, 0x00], 0);
    bytes.set(body, 5);
    bytes.set([LF, LF, LF], 5 + body.length);
    return bytes;
  }

  async function print(text, label) {
    if (!state.port || state.busy || state.printing) return;
    let bytes;
    try { bytes = packet(text); }
    catch (error) { log('INPUT ERROR: ' + error.message); return; }

    state.printing = true;
    render();
    let writer;
    try {
      if (!state.port.writable) throw new Error('Port is no longer writable. Disconnect and reconnect.');
      writer = state.port.writable.getWriter();
      log('Sending ' + label + ' (' + bytes.length + ' bytes)…');
      await writer.write(bytes);
      log('WRITE COMPLETED: ' + bytes.length + ' bytes sent. Please verify the paper printed.');
    } catch (error) {
      log('PRINT FAILED: ' + diagnostic(error));
    } finally {
      if (writer) writer.releaseLock();
      state.printing = false;
      render();
    }
  }

  // A short line length fits the common 58 mm / 384-dot receipt layout.
  function sampleReceipt() {
    return [
      '       RPP02N BROWSER TEST',
      '--------------------------------',
      'HELLO PRINTER!',
      'Printed from Chrome',
      '--------------------------------',
      'ESC/POS over Web Serial SPP',
      'Test only - not a receipt',
    ].join('\n');
  }

  $('connect-spp-btn').addEventListener('click', connectSpp);
  $('connect-any-btn').addEventListener('click', connectAnySerial);
  $('capabilities-btn').addEventListener('click', checkCapabilities);
  $('ble-test-btn').addEventListener('click', checkBle);
  $('custom-rfcomm-btn').addEventListener('click', connectCustomRfcomm);
  $('use-spp-uuid-btn').addEventListener('click', useStandardSppUuid);
  $('reconnect-btn').addEventListener('click', reconnectPermitted);
  $('disconnect-btn').addEventListener('click', disconnect);
  $('test-btn').addEventListener('click', () => print(sampleReceipt(), 'sample receipt'));
  $('custom-btn').addEventListener('click', () => print($('custom-text').value, 'custom receipt'));
  $('clear-log').addEventListener('click', () => { state.logs.length = 0; $('log').textContent = ''; });
  $('copy-log').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.logs.join('\n'));
      log('Log copied to clipboard.');
    } catch (error) {
      log('COPY FAILED: ' + diagnostic(error));
    }
  });
  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', (event) => {
      const disconnectedPort = event.port || event.target;
      if (state.port && disconnectedPort === state.port) {
        state.port = null;
        state.printing = false;
        state.busy = false;
        $('device-info').hidden = true;
        log('Bluetooth/serial device disconnected.');
        updateVerdict();
        render();
      }
    });
  }

  if ($('custom-uuid') && !$('custom-uuid').value) {
    $('custom-uuid').placeholder = SPP_UUID;
  }

  renderSupport();
  render();
  log('Ready on ' + clientPlatform() + '. Prefer Connect RPP02N (Bluetooth SPP). This page does not send data to a server.');
  if (!isSupported()) {
    log('Browser unsupported or insecure context. Use GitHub Pages HTTPS in up-to-date PC Chrome or Android Chrome 138+.');
  } else if (androidRfcommBlocked()) {
    log('Android Chrome below 138 — update before SPP connect.');
  }
})();
