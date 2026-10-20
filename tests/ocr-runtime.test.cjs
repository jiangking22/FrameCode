const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { OcrEngine } = require('../src/main/ocr.cjs');

test('bundled OCR initializes and recognizes frames from a Chinese installation path',
  { skip: process.platform !== 'win32' }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'FrameCode 中文 独立测试-'));
    const runtime = path.join(root, 'resources', 'ocr-runtime');
    fs.cpSync(path.join(__dirname, '../resources/ocr-runtime'), runtime, { recursive: true });
    const engine = new OcrEngine(root, { spawn: (file, args, options) => spawn(file, args, {
      ...options,
      // No developer tools or external installation paths in the child's search path.
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
        PATH: path.join(process.env.SystemRoot, 'System32'),
        ...Object.fromEntries(Object.entries(options.env).filter(([key]) => key.startsWith('TESS'))) },
    }) });
    t.after(async () => { await engine.close(); fs.rmSync(root, { recursive: true, force: true }); });
    const result = await engine.recognize({ width: 300, height: 100,
      rgba: Buffer.alloc(300 * 100 * 4, 255) }, '[A-Z]{3}[0-9]{3}');
    assert.equal(result.type, 'observation');
    assert.equal(result.error, null);
    assert.equal(result.sequence, 1);
  });

function workerError(payload) {
  const worker = new EventEmitter();
  Object.assign(worker, { stdout: new PassThrough(), stderr: new PassThrough(),
    stdin: new PassThrough(), exitCode: null, killed: false,
    kill() { this.killed = true; this.exitCode = 1; this.emit('exit', 1); } });
  setImmediate(() => {
    worker.emit('spawn');
    setImmediate(() => {
      const body = Buffer.from(JSON.stringify(payload));
      const header = Buffer.alloc(4);
      header.writeUInt32LE(body.length);
      worker.stdout.write(Buffer.concat([header, body]));
    });
  });
  return worker;
}

test('worker initialization errors preserve the actual cause', async t => {
  const engine = new OcrEngine(__dirname, { verifyRuntime: async () => {},
    spawn: () => workerError({ type: 'error', sequence: 0, error: 'TessBaseAPIInit3 failed: eng.traineddata' }) });
  t.after(() => engine.close());
  await assert.rejects(engine.recognize({ width: 1, height: 1, rgba: Buffer.alloc(4) }, '.+'),
    /OCR 初始化失败.*eng\.traineddata/);
});

test('ordinary responses still require a matching sequence', async t => {
  const engine = new OcrEngine(__dirname, { verifyRuntime: async () => {},
    spawn: () => workerError({ type: 'observation', sequence: 99, error: null }) });
  t.after(() => engine.close());
  await assert.rejects(engine.recognize({ width: 1, height: 1, rgba: Buffer.alloc(4) }, '.+'),
    /OCR 响应序号不匹配/);
});
