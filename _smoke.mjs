import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto('http://localhost:8080/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const result = await page.evaluate(async () => {
  // Load the REAL app module via Vite (not a replica).
  const mod = await import('/src/lib/imageDownload.ts');

  // Sanity: the exported pure helper resolves "1200 × 600" → exact pixels.
  const resolved = mod.resolveTargetDims({ bannerDimensions: '1200 × 600' });

  // Build a source image that is SOLID WHITE into the corners (the bug case),
  // with a red center, at gpt-image-1 landscape size 1536×1024.
  const src = document.createElement('canvas');
  src.width = 1536; src.height = 1024;
  const sctx = src.getContext('2d');
  sctx.fillStyle = 'white'; sctx.fillRect(0, 0, 1536, 1024);
  sctx.fillStyle = 'red'; sctx.fillRect(400, 300, 700, 400);
  const srcDataUrl = src.toDataURL('image/png');

  // Capture the OUTPUT blob the real function hands to the browser, and stop the
  // actual file-save click so headless doesn't choke.
  const captured = [];
  const origCreate = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { captured.push(b); return origCreate(b); };
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {};

  await mod.downloadImageRounded(srcDataUrl, 'smoke.png', {
    radius: mod.ROUNDED_CORNER_RADIUS,
    bannerDimensions: '1200 × 600',
  });

  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;

  // The output PNG is the last captured blob.
  const outBlob = captured[captured.length - 1];
  const buf = new Uint8Array(await outBlob.arrayBuffer());
  const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const pngW = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
  const pngH = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];

  // Decode the output PNG back and sample corner vs center alpha.
  const outUrl = origCreate(outBlob);
  const outImg = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = outUrl;
  });
  const chk = document.createElement('canvas');
  chk.width = outImg.naturalWidth; chk.height = outImg.naturalHeight;
  const cctx = chk.getContext('2d');
  cctx.drawImage(outImg, 0, 0);
  const corner = cctx.getImageData(0, 0, 1, 1).data;
  const center = cctx.getImageData(chk.width / 2, chk.height / 2, 1, 1).data;

  return {
    resolved,
    blobType: outBlob.type,
    isPng, pngW, pngH,
    cornerAlpha: corner[3],
    centerAlpha: center[3],
    centerRGB: [center[0], center[1], center[2]],
  };
});

await browser.close();
console.log('console/page errors:', errors.length ? errors : 'none');
console.log(JSON.stringify(result, null, 2));

const ok =
  result.isPng &&
  result.blobType === 'image/png' &&
  result.pngW === 1200 && result.pngH === 600 &&
  result.cornerAlpha === 0 &&
  result.centerAlpha === 255 &&
  result.resolved && result.resolved.width === 1200 && result.resolved.height === 600;
console.log(ok
  ? '\nSMOKE PASS: real downloadImageRounded → 1200×600 PNG, transparent corner, opaque center'
  : '\nSMOKE FAIL: see values above');
process.exit(ok ? 0 : 1);
