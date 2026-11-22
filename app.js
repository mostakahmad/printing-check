/* RPP02N GitHub Pages PC + Android Web Serial / Bluetooth Classic SPP proof of concept.
 * No remote requests, no storage, no third-party dependencies.
 * Native apps and BLE GATT require separate implementations.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = { port: null, busy: false, printing: false, logs: [] };
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

  function renderSupport() {
    const secure = window.isSecureContext;
    const serial = 'serial' in navigator;
    const platform = clientPlatform();
    setCheck('secure-symbol', 'secure-text', secure, 'Ready', 'Not secure');
    setCheck('serial-symbol', 'serial-text', serial, 'Available', 'Unsupported');

    const note = $('compatibility-note');
    if (!secure) {
      note.className = 'notice error';
      note.textContent = 'Open this app over HTTPS (such as GitHub Pages) or localhost. HTTP opened from another device is not secure enough for Web Serial.';
    } else if (!serial) {
      note.className = 'notice error';
      note.textContent = 'Web Serial is unavailable here. Use up-to-date Google Chrome on desktop, or Chrome 138+ on Android. iPhone Safari and many in-app browsers are unsupported.';
    } else {
      note.className = 'notice success';
      note.textContent = 'Browser Web Serial is available. Pair RPP02N in this device’s Bluetooth settings, then select its Bluetooth Serial Port.';
    }
    $('platform-note').textContent = `Detected platform: ${platform}. “Web Serial available” only confirms the browser API exists; actual RPP02N Bluetooth printing still requires a compatible paired SPP device.`;
    $('picker-tip').hidden = platform !== 'Linux';
  }

  function render() {
    const ready = isSupported();
    const connected = Boolean(state.port);
    const busy = state.busy || state.printing;
    $('connect-btn').disabled = !ready || connected || busy;
    $('reconnect-btn').disabled = !ready || connected || busy;
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
    if (name === 'NotFoundError') return 'No port was selected. If RPP02N is missing, pair it in this PC/phone Bluetooth settings and retry; do not select unrelated ttyS ports.';
    if (name === 'SecurityError') return 'Permission denied/blocked. Check Chrome site settings and HTTPS.';
    if (name === 'NotAllowedError') return 'Permission denied. Try selecting the port again.';
    if (name === 'InvalidStateError') return 'Port busy/already open. Disconnect it from Thermer or another app, then retry.';
    if (name === 'NetworkError') return 'Connection interrupted. Keep printer on, nearby and paired, then retry.';
    return `${name}: ${msg}`;
  }

  async function openSelected(selected) {
    // On Bluetooth RFCOMM-emulated serial ports, the baud rate may be ignored.
    await selected.open({ baudRate: 9600 });
    state.port = selected;
    let detail = 'Connected via Web Serial.';
    try {
      const info = selected.getInfo();
      const props = [];
      if (info.bluetoothServiceClassId !== undefined) props.push(`Bluetooth service class: ${info.bluetoothServiceClassId}`);
      if (info.usbVendorId !== undefined) props.push(`USB vendor: ${info.usbVendorId}`);
      if (info.usbProductId !== undefined) props.push(`USB product: ${info.usbProductId}`);
      if (props.length) detail = props.join(' | ');
    } catch (_) { /* Some browsers omit optional port metadata. */ }
    $('device-info').textContent = detail;
    $('device-info').hidden = false;
    log('CONNECTED. ' + detail);
    log('Next: press Print sample receipt.');
  }

  async function connectNew() {
    if (!isSupported() || state.busy || state.port) return;
    state.busy = true;
    render();
    try {
      log('Opening the browser serial-port chooser on ' + clientPlatform() + '…');
      // Must happen directly from a real button press (transient user activation).
      const selected = await navigator.serial.requestPort();
      log('Port selected; opening serial connection…');
      await openSelected(selected);
    } catch (error) {
      log('CONNECT FAILED: ' + diagnostic(error));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function reconnectPermitted() {
    if (!isSupported() || state.busy || state.port) return;
    state.busy = true;
    render();
    try {
      const ports = await navigator.serial.getPorts();
      if (!ports.length) {
        log('No previously permitted ports. Use Choose & connect printer first.');
      } else if (ports.length > 1) {
        log('Several permitted ports found. For safety, please choose the printer using Choose & connect printer.');
      } else {
        log('Found one permitted port; opening…');
        await openSelected(ports[0]);
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
      log(`Sending ${label} (${bytes.length} bytes)…`);
      await writer.write(bytes);
      log(`WRITE COMPLETED: ${bytes.length} bytes sent. Please verify the paper printed.`);
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
      'ESC/POS over Web Serial',
      'Test only - not a receipt',
    ].join('\n');
  }

  $('connect-btn').addEventListener('click', connectNew);
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
        render();
      }
    });
  }
  renderSupport();
  render();
  log('Ready on ' + clientPlatform() + '. This page does not send data to a server.');
  if (!isSupported()) log('Browser unsupported or insecure context. Use GitHub Pages HTTPS in up-to-date PC Chrome or Android Chrome 138+.');
})();
