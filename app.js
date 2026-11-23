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
    imageReady: false,
    imageName: '',
  };
  const encoder = new TextEncoder();
  const ESC = 0x1b;
  const GS = 0x1d;
  const LF = 0x0a;
  // Common 58 mm thermal width (RPP02N-class). Wider printers still accept this.
  const PRINT_WIDTH_DOTS = 384;
  const MAX_IMAGE_HEIGHT = 2400;
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
    $('image-btn').disabled = !connected || busy || !state.imageReady;
    $('image-clear-btn').disabled = !state.imageReady || busy;
    $('image-input').disabled = busy;
    $('image-pick-btn').classList.toggle('is-disabled', busy);
    $('image-pick-btn').setAttribute('aria-disabled', busy ? 'true' : 'false');
    $('image-threshold').disabled = !state.imageReady || busy;
    $('image-dither').disabled = !state.imageReady || busy;
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
    await printBytes(bytes, label);
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

  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function setImageFileName(text) {
    const node = $('image-file-name');
    if (node) node.textContent = text;
  }

  function clearImage() {
    state.imageReady = false;
    state.imageName = '';
    const canvas = $('image-preview');
    const ctx = canvas.getContext('2d');
    canvas.width = PRINT_WIDTH_DOTS;
    canvas.height = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $('image-preview-wrap').hidden = true;
    $('image-meta').textContent = '';
    $('image-input').value = '';
    setImageFileName('No image selected yet. Tap the button above — gallery / Files should open on phone.');
    render();
  }

  function looksLikeImage(file) {
    if (file.type && file.type.startsWith('image/')) return true;
    // Android gallery sometimes leaves type empty; fall back to extension.
    return /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || '');
  }

  function decodeImageFile(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file).catch(() => decodeImageViaElement(file));
    }
    return decodeImageViaElement(file);
  }

  function decodeImageViaElement(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not decode this image on this phone browser.'));
      };
      img.src = url;
    });
  }

  async function loadImageFile(file) {
    if (!file) return;
    if (!looksLikeImage(file)) {
      log('IMAGE ERROR: Please choose an image file (JPG, PNG, WebP, GIF, BMP).');
      setImageFileName('Not an image: ' + (file.name || 'unknown'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      log('IMAGE ERROR: File too large (max 8 MB).');
      return;
    }
    state.busy = true;
    render();
    try {
      log('IMAGE: Loading ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)…');
      setImageFileName('Loading ' + file.name + '…');
      const bitmap = await decodeImageFile(file);
      state.imageName = file.name || 'image';
      await prepareImageFromBitmap(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();
      setImageFileName('Selected: ' + state.imageName);
      log('IMAGE READY: ' + state.imageName + ' → ' + $('image-preview').width + '×' + $('image-preview').height + ' dots.');
    } catch (error) {
      clearImage();
      log('IMAGE ERROR: ' + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render();
    }
  }

  async function prepareImageFromBitmap(bitmap) {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    if (!srcW || !srcH) throw new Error('Could not read image dimensions.');

    let width = Math.min(PRINT_WIDTH_DOTS, srcW);
    let height = Math.round(srcH * (width / srcW));
    if (height > MAX_IMAGE_HEIGHT) {
      height = MAX_IMAGE_HEIGHT;
      width = Math.max(8, Math.round(srcW * (height / srcH)));
      width = Math.min(PRINT_WIDTH_DOTS, width);
    }
    // ESC/POS raster width must be a multiple of 8 dots.
    width = Math.max(8, Math.floor(width / 8) * 8);

    const work = document.createElement('canvas');
    work.width = width;
    work.height = height;
    const wctx = work.getContext('2d', { willReadFrequently: true });
    wctx.fillStyle = '#ffffff';
    wctx.fillRect(0, 0, width, height);
    wctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = wctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const threshold = Number($('image-threshold').value) || 128;
    const useDither = $('image-dither').checked;
    const gray = new Float32Array(width * height);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const a = data[i + 3] / 255;
      const r = data[i] * a + 255 * (1 - a);
      const g = data[i + 1] * a + 255 * (1 - a);
      const b = data[i + 2] * a + 255 * (1 - a);
      gray[p] = luminance(r, g, b);
    }

    if (useDither) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const old = gray[idx];
          const neu = old < threshold ? 0 : 255;
          const err = old - neu;
          gray[idx] = neu;
          if (x + 1 < width) gray[idx + 1] += err * (7 / 16);
          if (y + 1 < height) {
            if (x > 0) gray[idx + width - 1] += err * (3 / 16);
            gray[idx + width] += err * (5 / 16);
            if (x + 1 < width) gray[idx + width + 1] += err * (1 / 16);
          }
        }
      }
    }

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const v = gray[p] < threshold ? 0 : 255;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
    wctx.putImageData(imageData, 0, 0);

    const preview = $('image-preview');
    preview.width = width;
    preview.height = height;
    const pctx = preview.getContext('2d');
    pctx.fillStyle = '#ffffff';
    pctx.fillRect(0, 0, width, height);
    pctx.drawImage(work, 0, 0);

    state.imageReady = true;
    $('image-preview-wrap').hidden = false;
    $('threshold-value').textContent = String(threshold);
    $('image-meta').textContent =
      state.imageName + ' · ' + width + '×' + height + ' dots · ' +
      (useDither ? 'dithered' : 'threshold') + ' · ~' +
      Math.ceil((width / 8) * height / 1024) + ' KB raster';
  }

  async function refreshImageFromFile() {
    const input = $('image-input');
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    state.busy = true;
    render();
    try {
      const bitmap = await decodeImageFile(file);
      await prepareImageFromBitmap(bitmap);
      if (typeof bitmap.close === 'function') bitmap.close();
    } catch (error) {
      log('IMAGE ERROR: ' + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render();
    }
  }

  /** ESC/POS GS v 0 — raster bit image (m=0 normal density). */
  function buildRasterFromCanvas(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) throw new Error('No image loaded.');
    if (width % 8 !== 0) throw new Error('Image width must be a multiple of 8.');

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { data } = ctx.getImageData(0, 0, width, height);
    const widthBytes = width / 8;
    const raster = new Uint8Array(widthBytes * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Black pixel → print bit 1 (thermal burns dark).
        if (data[i] < 128) {
          raster[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }

    const xL = widthBytes & 0xff;
    const xH = (widthBytes >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    // ESC @ init + GS v 0 m xL xH yL yH + raster + feed
    const header = new Uint8Array([
      ESC, 0x40,
      GS, 0x76, 0x30, 0x00,
      xL, xH, yL, yH,
    ]);
    const footer = new Uint8Array([LF, LF, LF]);
    const out = new Uint8Array(header.length + raster.length + footer.length);
    out.set(header, 0);
    out.set(raster, header.length);
    out.set(footer, header.length + raster.length);
    return out;
  }

  async function printBytes(bytes, label) {
    if (!state.port || state.busy || state.printing) return;
    state.printing = true;
    render();
    let writer;
    try {
      if (!state.port.writable) throw new Error('Port is no longer writable. Disconnect and reconnect.');
      writer = state.port.writable.getWriter();
      log('Sending ' + label + ' (' + bytes.length + ' bytes)…');
      // Chunk large rasters so Bluetooth RFCOMM buffers do not overflow.
      const CHUNK = 512;
      for (let offset = 0; offset < bytes.length; offset += CHUNK) {
        await writer.write(bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length)));
      }
      log('WRITE COMPLETED: ' + bytes.length + ' bytes sent. Please verify the paper printed.');
    } catch (error) {
      log('PRINT FAILED: ' + diagnostic(error));
    } finally {
      if (writer) writer.releaseLock();
      state.printing = false;
      render();
    }
  }

  async function printImage() {
    if (!state.port || !state.imageReady || state.busy || state.printing) return;
    let bytes;
    try {
      bytes = buildRasterFromCanvas($('image-preview'));
    } catch (error) {
      log('IMAGE ERROR: ' + error.message);
      return;
    }
    await printBytes(bytes, 'image raster (' + state.imageName + ')');
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
  $('image-input').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (file) loadImageFile(file);
    else {
      log('IMAGE: File picker closed without a selection.');
      setImageFileName('No image selected yet. Tap the button above — gallery / Files should open on phone.');
    }
  });
  // Fallback if a tap hits the label chrome instead of the overlay input.
  $('image-pick-btn').addEventListener('click', (event) => {
    if (state.busy || state.printing) {
      event.preventDefault();
      return;
    }
    if (event.target === $('image-input')) return;
    event.preventDefault();
    try { $('image-input').click(); } catch (_) { /* ignore */ }
  });
  $('image-threshold').addEventListener('input', () => {
    $('threshold-value').textContent = String($('image-threshold').value);
  });
  $('image-threshold').addEventListener('change', refreshImageFromFile);
  $('image-dither').addEventListener('change', refreshImageFromFile);
  $('image-btn').addEventListener('click', printImage);
  $('image-clear-btn').addEventListener('click', clearImage);
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
