# RPP02N Bluetooth Printer Lab — GitHub Pages v1.1

A ready-to-upload, single-page static test application for printing **directly from PC Chrome and Android Chrome** to an RPP02N Bluetooth Classic SPP thermal printer. Uses **Web Serial + ESC/POS** in the visitor's browser, not a server. No npm, build, API key, app installation or backend required.

## Final requirements

- One HTTPS GitHub Pages URL shared between desktop and mobile.
- Browser-initiated printer selection, connect, reconnect, disconnect.
- Basic ESC/POS print test and custom ASCII text printing.
- Connection status and diagnostic log.
- Print data remains on the device (only downloaded static HTML/CSS/JS).
- Hardware acceptance is **not yet confirmed** for your particular RPP02N variant; Thermer Android printing succeeded earlier, but that does not prove browser SPP compatibility.

## Deploy to GitHub Pages

1. Create a **public** GitHub repository, e.g. `rpp02n-bluetooth-printer`.
2. Upload the **four files** (`index.html`, `styles.css`, `app.js`, `README.md`) into the **root** of the repository. If using the ZIP, extract it first, rather than uploading the ZIP itself.
3. Commit the files to `main`.
4. GitHub repository **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.
5. Open `https://YOUR-USERNAME.github.io/rpp02n-bluetooth-printer/` on the *same device that has Bluetooth*. The Pages URL appears in repository Settings → Pages when deployed.

The website is hosted publicly, but Bluetooth device access is only available when the **user explicitly chooses a port** in the browser's permission prompt. The website does not auto-scan or directly access distant printers.

## Test on Android Chrome

1. Update Google Chrome (version 138 or newer for Bluetooth RFCOMM support).
2. Pair RPP02N in **Android Settings → Bluetooth**. Try `0000` if asked for a PIN, subject to your unit's instructions.
3. Close **Thermer** so the printer's serial connection is free.
4. Turn on the printer and open your GitHub Pages URL in **Google Chrome**, not the Facebook/WhatsApp in-app browser.
5. Choose & connect printer → select the RPP02N / Bluetooth Serial Port entry → Print sample receipt.
6. A successful browser write does **not** prove actual paper printed. Check the receipt and log.

## Test on PC Chrome

1. PC must have **its own Bluetooth adapter**. Pair RPP02N from Windows/macOS/Linux system Bluetooth settings.
2. Open your **same** HTTPS GitHub Pages URL in up-to-date **desktop Google Chrome**.
3. Choose & connect printer → select its Bluetooth Serial Port → Print sample receipt.
4. On Linux, **ttyS0 / ttyS1 / ttyS10** are usually built-in serial ports, **not RPP02N**. Do not select them. GitHub Pages cannot fix an OS-level Bluetooth discovery or SPP pairing problem.

### Linux diagnostics for your earlier screenshot

```sh
bluetoothctl
# inside bluetoothctl:
power on
agent on
default-agent
scan on
# when RPP02N appears, use its real Bluetooth MAC address:
pair XX:XX:XX:XX:XX:XX
trust XX:XX:XX:XX:XX:XX
info XX:XX:XX:XX:XX:XX
exit
```

Optionally, if `sdptool` is available, inspect the device's serial/RFCOMM services:

```sh
sdptool browse XX:XX:XX:XX:XX:XX
```

This is diagnostic guidance, not a guaranteed fix. Some Linux systems need additional Bluetooth SPP configuration. Avoid blindly choosing `/dev/ttyS*`, and do not assume `Connected: no` in BlueZ means pairing failed; RFCOMM may connect only when the app opens the port.

## Browser support / limitations

| Environment | Web Serial + Bluetooth Classic SPP |
|---|---|
| Windows Chrome 117+ | Supported in principle; pair printer first |
| Linux Chrome 117+ | Supported in principle; Linux Bluetooth SPP discovery/configuration can require extra steps |
| macOS Chrome 117+ | Supported in principle; pair printer first |
| Android Chrome 138+ | Bluetooth RFCOMM supported; pair printer first |
| iPhone Safari, Firefox or unsupported browser | Not supported by this implementation |

**This is Bluetooth Classic SPP / RFCOMM, not Web Bluetooth BLE.** A printer exposing only a custom RFCOMM service UUID may need that *verified UUID* in `allowedBluetoothServiceClassIds`. A printer exposing only BLE GATT would need a separate implementation after verifying its writable characteristics. No device UUIDs are guessed.

## Run locally on PC (optional)

```sh
python3 -m http.server 8000
# then open http://localhost:8000 in desktop Chrome
```

`localhost` is treated as a trustworthy origin by browsers, like GitHub Pages HTTPS. To test from a separate phone via LAN, host over HTTPS instead.

## Technical details

- `navigator.serial.requestPort()` is called from a user click.
- `{baudRate: 9600}` when opening the port, often ignored for Bluetooth RFCOMM emulation.
- Sends an ASCII-only ESC/POS packet: `ESC @`, `ESC a 0`, ASCII, line-feed.
- No build dependencies, external scripts, external APIs, accounts, telemetry, cloud printing, Bluetooth auto-connect, paper cutter, or drawer trigger.
- Browser write completion means only that bytes were accepted by the browser's writable stream.
- Unicode Bangla, QR code, images, automatic Android/iOS app support, POS receipts and Laravel/Next.js integrations are future phases after proof of hardware printing.

## Evaluation checklist

- [ ] PC browser displays Web Serial Available.
- [ ] PC browser can select an **RPP02N Bluetooth** port, not a system serial port.
- [ ] PC browser displays Connected and an actual receipt prints.
- [ ] Android Chrome can select the **RPP02N Bluetooth** port.
- [ ] Android Chrome displays Connected and an actual receipt prints.
- [ ] Disconnect/reconnect and custom text work on both devices.

## Verified references

- Chrome desktop Bluetooth serial: https://developer.chrome.com/blog/serial-over-bluetooth/
- Chrome Android 138 RFCOMM: https://developer.chrome.google.cn/release-notes/138?hl=en
- Chrome Web Serial guide: https://developer.chrome.com/docs/capabilities/serial
- MDN Web Serial API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
- RPP02N manufacturer product description: https://www.rongtatech.com/rpp02n-58mm-thermal-mobile-printer-mini_p32.html
