const assert = require("node:assert/strict");
const { before, after, test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

const prototypePath = resolve(__dirname, "..", "sikka-ipad-prototype.html");
let browser;

before(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=user-gesture-required"]
  });
});

after(async () => { if (browser) await browser.close(); });

async function openPage(initialize) {
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 }, hasTouch: true });
  if (initialize) await context.addInitScript(initialize);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(pathToFileURL(prototypePath).href);
  return { page, context, errors };
}

async function waitState(page, expected) {
  await page.waitForFunction(value => document.body.dataset.state === value, expected, { timeout: 18000 });
}

async function prepare(page) {
  await page.locator("#enable").click();
  await waitState(page, "idle");
  assert.equal(await page.locator("#setup").isHidden(), true);
  assert.equal(await page.evaluate(() => microphoneStream), null);
}

async function lift(page) {
  await page.keyboard.down("b");
  await page.keyboard.up("b");
  await waitState(page, "ready");
}

test("the deliverable is self-contained and its script parses", () => {
  const html = readFileSync(prototypePath, "utf8");
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+(?:stylesheet|preload)|@import|fetch\(/i);
  new Function(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});

test("real microphone recording follows DTMF, ringing and pickup; its download decodes", async () => {
  const { page, context, errors } = await openPage();
  try {
    await prepare(page);
    await page.evaluate(() => {
      window.observedStates = [];
      new MutationObserver(() => observedStates.push(document.body.dataset.state)).observe(document.body, { attributes: true, attributeFilter: ["data-state"] });
      window.observedFrequencies = [];
      const original = audioContext.createOscillator.bind(audioContext);
      audioContext.createOscillator = () => {
        const oscillator = original();
        const start = oscillator.start.bind(oscillator);
        oscillator.start = (...args) => { observedFrequencies.push(oscillator.frequency.value); start(...args); };
        return oscillator;
      };
    });
    await lift(page);
    assert.equal(await page.locator("#call").getAttribute("aria-label"), "Call Yesterday for Tomorrow");
    assert.equal(await page.evaluate(() => soundNodes.size), 2);
    await page.locator("#call").click();
    await waitState(page, "recording");
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    assert.equal(await page.evaluate(() => session.recorder.state), "recording");
    const flow = await page.evaluate(() => observedStates);
    for (const expected of ["permission", "dialing", "ringing", "pickup", "recording"]) assert.ok(flow.includes(expected), `${expected} appears in ${flow}`);
    const positions = ["dialing", "ringing", "pickup", "recording"].map(value => flow.indexOf(value));
    assert.deepEqual(positions, [...positions].sort((first, second) => first - second));
    const frequencies = await page.evaluate(() => observedFrequencies);
    assert.ok(frequencies.includes(697) && frequencies.includes(1477) && frequencies.includes(480) && frequencies.includes(880));
    await page.waitForTimeout(1400);
    assert.match(await page.locator("#timer").textContent(), /^00:0[1-9]/);
    await page.locator("#stop").click();
    await waitState(page, "complete");
    await page.waitForFunction(() => recordingUrl && saving === 0);
    assert.equal(await page.evaluate(() => microphoneStream), null);
    const decoded = await page.evaluate(async () => {
      const response = await fetch(recordingUrl);
      const bytes = await response.arrayBuffer();
      const byteCount = bytes.byteLength;
      const decodedAudio = await audioContext.decodeAudioData(bytes);
      return { bytes: byteCount, duration: decodedAudio.duration, type: recordingType };
    });
    assert.ok(decoded.bytes > 100);
    assert.ok(decoded.duration > 0.5);
    assert.match(decoded.type, /^audio\//);
    assert.match(await page.locator("#download").getAttribute("download"), /^sikka-message-.*\.(m4a|webm|ogg)$/);
    const downloadEvent = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloadEvent;
    assert.equal(await download.failure(), null);
    await page.keyboard.down("b");
    await page.keyboard.up("b");
    await waitState(page, "ready");
    await page.evaluate(() => preview.play());
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    await page.evaluate(() => preview.pause());
    await page.waitForFunction(() => soundNodes.size === 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("held and repeated B keydowns do not allocate more audio or repeat resets", async () => {
  const { page, context, errors } = await openPage();
  try {
    await prepare(page);
    await lift(page);
    await page.keyboard.down("b");
    const originalGeneration = await page.evaluate(() => generation);
    await page.evaluate(() => {
      for (let index = 0; index < 2000; index += 1) document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", repeat: true, bubbles: true }));
      for (let index = 0; index < 20; index += 1) document.dispatchEvent(new KeyboardEvent("keydown", { key: "b", code: "KeyB", repeat: false, bubbles: true }));
    });
    assert.equal(await page.evaluate(() => generation), originalGeneration);
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    assert.equal(await page.locator("body").getAttribute("data-state"), "idle");
    await page.keyboard.up("b");
    await waitState(page, "ready");
    assert.equal(await page.evaluate(() => soundNodes.size), 2);
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "b", code: "KeyB", bubbles: true })));
    assert.equal(await page.evaluate(() => soundNodes.size), 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const stage of ["dialing", "ringing", "pickup", "recording"]) {
  test(`pedal press cancels ${stage}, closes capture, and never restarts the sequence`, async () => {
    const { page, context, errors } = await openPage();
    try {
      await prepare(page);
      await lift(page);
      await page.locator("#call").click();
      await waitState(page, stage);
      await page.evaluate(() => { window.capturedStream = microphoneStream; });
      if (stage === "recording") await page.waitForTimeout(450);
      await page.keyboard.down("b");
      await waitState(page, "idle");
      await page.waitForTimeout(stage === "dialing" ? 7500 : 800);
      assert.equal(await page.locator("body").getAttribute("data-state"), "idle");
      assert.equal(await page.evaluate(() => soundNodes.size), 0);
      assert.equal(await page.evaluate(() => session), null);
      assert.equal(await page.evaluate(() => microphoneStream), null);
      assert.equal(await page.evaluate(() => capturedStream.getTracks().every(track => track.readyState === "ended")), true);
      if (stage === "recording") {
        await page.waitForFunction(() => recordingUrl && saving === 0);
        assert.equal(await page.locator("#saved").isVisible(), true);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test("denied microphone permission has an actionable failure and supports retry", async () => {
  const { page, context, errors } = await openPage(() => {
    window.realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Test denial", "NotAllowedError"));
  });
  try {
    await page.locator("#enable").click();
    await waitState(page, "error");
    assert.match(await page.locator("#error-message").textContent(), /denied or blocked/);
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.realGetUserMedia; });
    await page.locator("#retry").click();
    await waitState(page, "idle");
    assert.equal(await page.locator("#error").isHidden(), true);
    assert.equal(await page.evaluate(() => microphoneStream), null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a late microphone permission grant after reset closes its tracks", async () => {
  const { page, context, errors } = await openPage();
  try {
    await prepare(page);
    await page.evaluate(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        const stream = await original(options);
        window.lateStream = stream;
        return new Promise(resolveStream => { window.grantLateMicrophone = () => resolveStream(stream); });
      };
    });
    await lift(page);
    await page.locator("#call").click();
    await page.waitForFunction(() => typeof grantLateMicrophone === "function");
    await page.keyboard.down("b");
    await waitState(page, "idle");
    await page.evaluate(() => grantLateMicrophone());
    await page.waitForFunction(() => lateStream.getTracks().every(track => track.readyState === "ended"));
    assert.equal(await page.locator("body").getAttribute("data-state"), "idle");
    assert.equal(await page.evaluate(() => microphoneStream), null);
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("a native microphone AbortError shows a failure instead of leaving setup stuck", async () => {
  const { page, context, errors } = await openPage(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Native microphone interruption", "AbortError"));
  });
  try {
    await page.locator("#enable").click();
    await waitState(page, "error");
    assert.match(await page.locator("#error-message").textContent(), /interrupted microphone access/);
    assert.equal(await page.evaluate(() => microphoneStream), null);
    assert.equal(await page.locator("#retry").isVisible(), true);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

for (const unsupported of ["insecure", "recorder", "microphone"]) {
  test(`a clear error is shown for ${unsupported} environments`, async () => {
    const { page, context, errors } = await openPage();
    try {
      await page.evaluate(value => {
        if (value === "insecure") Object.defineProperty(window, "isSecureContext", { value: false });
        if (value === "recorder") window.MediaRecorder = undefined;
        if (value === "microphone") Object.defineProperty(navigator, "mediaDevices", { value: undefined });
      }, unsupported);
      await page.locator("#enable").click();
      await waitState(page, "error");
      assert.equal(await page.locator("#error").isVisible(), true);
      assert.match(await page.locator("#error-message").textContent(), unsupported === "recorder" ? /cannot record/ : /HTTPS/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}

test("screen interruption stops capture and pickup cannot start a hidden recording", async () => {
  const { page, context, errors } = await openPage();
  try {
    await prepare(page);
    await lift(page);
    await page.locator("#call").click();
    await waitState(page, "ringing");
    await page.evaluate(() => {
      window.interruptedStream = microphoneStream;
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(4500);
    assert.equal(await page.locator("body").getAttribute("data-state"), "idle");
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    assert.equal(await page.evaluate(() => interruptedStream.getTracks().every(track => track.readyState === "ended")), true);
    assert.equal(await page.evaluate(() => session), null);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("audio interruption during ringing gives a recoverable error and stops the microphone", async () => {
  const { page, context, errors } = await openPage();
  try {
    await prepare(page);
    await lift(page);
    await page.locator("#call").click();
    await waitState(page, "ringing");
    await page.evaluate(async () => {
      window.interruptedStream = microphoneStream;
      await audioContext.suspend();
    });
    await waitState(page, "error");
    assert.match(await page.locator("#error-message").textContent(), /interrupted|paused/);
    assert.equal(await page.evaluate(() => soundNodes.size), 0);
    assert.equal(await page.evaluate(() => interruptedStream.getTracks().every(track => track.readyState === "ended")), true);
    await page.locator("#retry").click();
    await waitState(page, "ready");
    assert.equal(await page.evaluate(() => soundNodes.size), 2);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("the recording limit finalizes a real recording and releases microphone tracks", async () => {
  const { page, context, errors } = await openPage();
  try {
    await page.clock.install();
    await prepare(page);
    await lift(page);
    await page.locator("#call").click();
    await waitState(page, "recording");
    await page.waitForTimeout(500);
    await page.evaluate(() => { window.limitedStream = microphoneStream; });
    await page.clock.fastForward(5 * 60 * 1000 + 1000);
    await waitState(page, "complete");
    await page.waitForFunction(() => recordingUrl && saving === 0);
    assert.equal(await page.evaluate(() => limitedStream.getTracks().every(track => track.readyState === "ended")), true);
    assert.equal(await page.evaluate(() => session), null);
    assert.equal(await page.locator("#saved").isVisible(), true);
    assert.match(await page.locator("#hint").textContent(), /5-minute/);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});

test("iPad portrait, landscape and narrow-screen layouts fit the viewport", async () => {
  const { page, context, errors } = await openPage();
  try {
    for (const size of [{ width: 1024, height: 1366 }, { width: 1180, height: 820 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await page.setViewportSize({ width: 1024, height: 1366 });
    await prepare(page);
    await lift(page);
    await page.screenshot({ path: resolve(__dirname, "..", "sikka-ipad-preview.png"), fullPage: true });
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
