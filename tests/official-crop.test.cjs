const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Verbatim dimensions() fixture from official LivePlayerHost/Web/ocr-frame-bridge.js:41-52.
// Keep this independent of RegionSelection so changes are checked against the
// shipped host's ROI geometry without requiring its installation on test machines.
function dimensions(s) {
  const left = Math.max(0, Math.min(s.width, Math.floor(s.region.x * s.width)));
  const top = Math.max(0, Math.min(s.height, Math.floor(s.region.y * s.height)));
  const right = Math.max(left, Math.min(s.width,
    Math.ceil((s.region.x + s.region.width) * s.width)));
  const bottom = Math.max(top, Math.min(s.height,
    Math.ceil((s.region.y + s.region.height) * s.height)));
  const sw = right - left, sh = bottom - top;
  const scale = Math.min(1, 1280 / sw);
  return { left, top, sw, sh, width: Math.max(1, Math.round(sw * scale)),
    height: Math.max(1, Math.round(sh * scale)) };
}

const selectionSource = fs.readFileSync(path.join(__dirname, '../src/ui/selection.js'), 'utf8');
const loadSelection = () => import('data:text/javascript;base64,' + Buffer.from(selectionSource).toString('base64'));

test('canvas and video ROI crops match official geometry for 1000 selections', async () => {
  const { RegionSelection } = await loadSelection();
  for (const [width, height] of [[1920, 1080], [3840, 2160], [640, 360], [17, 13]]) {
    for (let index = 0; index < 250; index++) {
      const region = {
        x: (index * 37 % 1000) / 1000,
        y: (index * 53 % 1000) / 1000,
        width: ((index * 17 % 1000) + 1) / 1000,
        height: ((index * 23 % 1000) + 1) / 1000,
      };
      const expected = dimensions({ width, height, region });
      const calls = [];
      const target = {
        getContext(type, options) {
          assert.equal(type, '2d');
          // This app uses the official synchronous encoded-image path,
          // where sharedPreferred is false and no getImageData call is needed.
          assert.deepEqual(options, { alpha: false, willReadFrequently: false });
          return { drawImage(...args) { calls.push(args); } };
        },
      };
      const surface = { width, height };
      const state = { surface, region: { x: region.x, y: region.y, w: region.width, h: region.height } };
      for (const source of [surface, { videoWidth: width, videoHeight: height, width: 1, height: 1 }]) {
        calls.length = 0;
        assert.equal(RegionSelection.prototype.crop.call(state, target, source), true);
        assert.equal(target.width, expected.width);
        assert.equal(target.height, expected.height);
        assert.deepEqual(calls, [[source, expected.left, expected.top, expected.sw,
          expected.sh, 0, 0, expected.width, expected.height]]);
      }
    }
  }
});

test('empty or out-of-bounds selections do not submit a crop', async () => {
  const { RegionSelection } = await loadSelection();
  const surface = { width: 1920, height: 1080 };
  const target = { getContext() { assert.fail('empty ROI must not create a drawing context'); } };
  for (const region of [null, { x: 0, y: 0, w: 0, h: .2 }, { x: 1, y: .5, w: .2, h: .2 },
    { x: .5, y: 1, w: .2, h: .2 }]) {
    assert.equal(RegionSelection.prototype.crop.call({ surface, region }, target), false);
  }
});

function queueHarness() {
  const appSource = fs.readFileSync(path.join(__dirname, '../src/ui/app.js'), 'utf8');
  const start = appSource.indexOf('function createOcrFrameQueue(');
  const end = appSource.indexOf('\nconst frameQueue=', start);
  assert.ok(start >= 0 && end > start, 'the renderer must use the official latest-frame queue');
  let now = 100, timerSequence = 0, surface = 'first';
  const timers = new Map(), requests = [], results = [], errors = [], copies = [];
  const state = { active: true, sessionId: 7, ready: true, region: { x: 0, y: 0, w: 1, h: 1 },
    width: 1920, height: 1080, visible: true, codec: true, paused: false, seeking: false };
  const create = new Function('performance', 'setTimeout', 'clearTimeout',
    `return (${appSource.slice(start, end)});`)(
    { now: () => now },
    callback => { const id = ++timerSequence; timers.set(id, callback); return id; },
    id => timers.delete(id),
  );
  const queue = create({
    readState: () => state,
    copy: () => { copies.push(surface); return { image: surface, wide: false }; },
    send: payload => new Promise((resolve, reject) => requests.push({ payload, resolve, reject })),
    onResult: result => results.push(result),
    onError: error => errors.push(error.message),
  });
  return { queue, state, timers, requests, results, errors, copies,
    setSurface: value => { surface = value; },
    setTime: value => { now = value; },
    runTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
  };
}

const settleQueue = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

test('an OCR ACK drains only the latest frame retained while the native slot is busy', async () => {
  const h = queueHarness();
  h.queue.schedule(1, 1, true);
  assert.equal(h.requests.length, 0, 'Canvas encoding stays outside the presentation callback');
  h.runTimers();
  assert.equal(h.requests.length, 1);
  h.setSurface('second'); h.queue.schedule(2, 2, true);
  h.setSurface('third'); h.queue.schedule(3, 3, true);
  assert.deepEqual(h.copies, ['first'], 'busy frames must not create a bitmap backlog');
  h.requests[0].resolve({ code: 'ABC123' }); await settleQueue();
  assert.equal(h.timers.size, 1, 'the native ACK must resume the queued latest frame');
  h.runTimers();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].payload.image, 'first', 'the in-flight encoded snapshot stays unchanged');
  assert.equal(h.requests[1].payload.image, 'third');
  assert.equal(h.requests[1].payload.frame, h.requests[0].payload.frame + 1);
  h.requests[1].resolve({ code: 'ABC123' }); await settleQueue();
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.errors, []);
});

test('ROI and session changes discard stale work while an old ACK releases only its own slot', async () => {
  const h = queueHarness();
  h.queue.schedule(1, 1, true); h.runTimers();
  h.queue.changed(); h.state.sessionId = 8;
  h.setSurface('new-session'); h.queue.schedule(2, 2, true); h.runTimers();
  assert.equal(h.requests.length, 1, 'the old native slot remains owned until its reply');
  h.requests[0].resolve({ code: 'STALE1' }); await settleQueue(); h.runTimers();
  assert.deepEqual(h.results, []);
  assert.equal(h.requests[1].payload.session, 8);
  assert.equal(h.requests[1].payload.image, 'new-session');
  h.requests[1].resolve({ code: 'NEW123' }); await settleQueue();
  assert.deepEqual(h.results, [{ code: 'NEW123' }]);
  h.queue.schedule(3, 3, true); assert.equal(h.timers.size, 1);
  h.queue.changed(); h.state.active = false; h.runTimers();
  assert.equal(h.requests.length, 2, 'stopping cancels a deferred capture');
});

test('queue uses official media/frame deduplication and 0/16 ms sampling intervals', async () => {
  const h = queueHarness();
  h.queue.schedule(1, 1, false); h.runTimers();
  h.requests[0].resolve({}); await settleQueue();
  h.setTime(108); h.queue.schedule(2, 2, false); h.runTimers();
  assert.equal(h.requests.length, 1);
  h.setTime(116); h.queue.schedule(3, 3, false); h.runTimers();
  assert.equal(h.requests.length, 2);
  h.requests[1].resolve({}); await settleQueue();
  h.queue.schedule(3, 4, true); h.runTimers();
  h.queue.schedule(4, 3, true); h.runTimers();
  assert.equal(h.requests.length, 2, 'duplicate media time or presented-frame ID must not be read twice');
  h.setTime(117); h.queue.schedule(4, 4, true); h.runTimers();
  assert.equal(h.requests.length, 3, 'presented-frame mode has no extra sampling delay');
  h.requests[2].resolve({}); await settleQueue();
  h.state.codec = false; h.state.paused = true;
  h.queue.schedule(5, 5, false); h.runTimers();
  assert.equal(h.requests.length, 3, 'paused standard video cannot submit another frame');
  h.state.paused = false; h.state.visible = false; h.setTime(133);
  h.queue.schedule(5, 5, false); h.runTimers();
  assert.equal(h.requests.length, 4, 'the Electron host keeps capture running behind the game');
  h.requests[3].resolve({}); await settleQueue();
});
