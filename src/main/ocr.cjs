const path = require('node:path');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const childProcess = require('node:child_process');

const WORKER = 'room-code-assistant-worker.exe';
const WORKER_SHA256 = '84b1f83c225331431f2fc19c7e6569f637d92076636bb1e3a16697b9a90598c5';
const MANIFEST = 'manifest.sha256.json';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function runtimeFiles(directory, relative = '') {
  const files = [];
  for (const entry of await fs.promises.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await runtimeFiles(directory, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`OCR 目录包含不支持的文件：${name}`);
  }
  return files.sort();
}

async function verifyRuntime(root) {
  const directory = path.join(root, 'resources', 'ocr-runtime');
  let manifest;
  try {
    manifest = JSON.parse(await fs.promises.readFile(path.join(directory, MANIFEST), 'utf8'));
  } catch {
    throw new Error('OCR 组件缺失，请重新解压完整程序包；源码运行请先执行 npm run resources');
  }
  if (manifest.format !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('OCR 组件清单无效，请重新准备资源');
  }
  const names = new Set();
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string' || /[\\:\x00-\x1f]/.test(file.path) ||
        file.path.split('/').some(part => !part || part === '.' || part === '..') ||
        path.isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.size) || file.size < 0 || names.has(file.path)) {
      throw new Error('OCR 组件清单无效，请重新准备资源');
    }
    names.add(file.path);
  }
  if (!manifest.files.some(file => file.path === WORKER && file.sha256 === WORKER_SHA256) ||
      !names.has('libtesseract-5.dll') || !names.has('tessdata/eng.traineddata')) {
    throw new Error('OCR 组件版本不匹配，请重新准备资源');
  }
  const actualFiles = (await runtimeFiles(directory)).filter(name => name !== MANIFEST);
  if (actualFiles.length !== names.size || actualFiles.some(name => !names.has(name))) {
    throw new Error('OCR 组件目录与清单不一致，请重新准备资源');
  }
  for (const file of manifest.files) {
    const filename = path.join(directory, file.path);
    const stat = await fs.promises.stat(filename);
    if (stat.size !== file.size || await sha256(filename) !== file.sha256) {
      throw new Error(`OCR 组件校验失败：${file.path}`);
    }
  }
  return directory;
}

// Transport raw frames only; the worker returns recognition observations.
class OcrEngine {
  constructor(root, options = {}) {
    this.root = root;
    this.directory = path.join(root, 'resources', 'ocr-runtime');
    this.spawn = options.spawn || childProcess.spawn;
    this.verifyRuntime = options.verifyRuntime || verifyRuntime;
    this.timeoutMs = options.timeoutMs || 10000;
    this.worker = null;
    this.initializing = null;
    this.closing = null;
    this.generation = 0;
    this.sequence = 0;
    this.queue = [];
    this.active = null;
    this.draining = false;
    this.received = Buffer.alloc(0);
    this.stderr = '';
  }

  async ready() {
    if (this.closing) await this.closing;
    if (this.initializing) return this.initializing;
    if (this.worker && this.worker.exitCode === null && !this.worker.killed) return this.worker;
    const generation = this.generation;
    const initializing = (async () => {
      await this.verifyRuntime(this.root);
      if (generation !== this.generation) throw new Error('OCR 已停止');
      const worker = this.spawn(path.join(this.directory, WORKER), ['ipc'], {
        cwd: this.directory,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          TESSDATA_PREFIX: path.join(this.directory, 'tessdata'),
          TESSERACT_LANG: 'eng',
          TESSERACT_WHITELIST: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
          TESSERACT_DLL: path.join(this.directory, 'libtesseract-5.dll'),
        },
      });
      this.worker = worker;
      this.received = Buffer.alloc(0);
      this.stderr = '';
      worker.stdout.on('data', chunk => this._receive(worker, chunk));
      worker.stdout.on('error', error => this._fail(worker, error));
      worker.stdin.on('error', error => this._fail(worker, error));
      worker.stderr.on('data', chunk => {
        if (this.worker === worker) this.stderr = (this.stderr + chunk.toString('utf8')).slice(-4096);
      });
      worker.stderr.on('error', () => {});
      worker.on('error', error => this._fail(worker, error));
      worker.on('exit', (code, signal) => {
        this._fail(worker, new Error(`OCR 进程已退出（${signal || code}）${this.stderr ? `：${this.stderr.trim()}` : ''}`));
      });
      await new Promise((resolve, reject) => {
        const onSpawn = () => { worker.off('error', onError); resolve(); };
        const onError = error => { worker.off('spawn', onSpawn); reject(error); };
        worker.once('spawn', onSpawn);
        worker.once('error', onError);
      });
      if (generation !== this.generation || this.worker !== worker) throw new Error('OCR 已停止');
      return worker;
    })();
    this.initializing = initializing;
    try { return await initializing; }
    finally { if (this.initializing === initializing) this.initializing = null; }
  }

  recognize({ width, height, rgba } = {}, pattern) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        width > 32768 || height > 32768 || width * height > MAX_PIXELS) {
      return Promise.reject(new Error('OCR 原始帧尺寸无效或过大'));
    }
    if (typeof pattern !== 'string' || !pattern.length || Buffer.byteLength(pattern, 'utf8') > 16384) {
      return Promise.reject(new Error('OCR 识别规则无效'));
    }
    const bytes = rgba instanceof ArrayBuffer ? new Uint8Array(rgba) :
      ArrayBuffer.isView(rgba) ? new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength) : null;
    if (!bytes || bytes.byteLength !== width * height * 4) {
      return Promise.reject(new Error('OCR 原始帧必须包含完整 RGBA 数据'));
    }
    if (this.queue.length + (this.active ? 1 : 0) >= 8) {
      return Promise.reject(new Error('OCR 请求过多，请等待当前帧处理完成'));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ width, height, rgba: Buffer.from(bytes), pattern, resolve, reject });
      void this._drain();
    });
  }

  async _drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const item = this.queue.shift();
        this.active = item;
        try {
          const worker = await this.ready();
          if (item.cancelled) continue;
          item.sequence = ++this.sequence;
          const result = await new Promise((resolve, reject) => {
            item.response = { resolve, reject };
            item.timer = setTimeout(() => this._fail(worker, new Error('OCR 处理超时，请重新开始识别')), this.timeoutMs);
            const header = Buffer.from(JSON.stringify({
              sequence: item.sequence,
              width: item.width,
              height: item.height,
              pattern: item.pattern,
              required_frames: 1,
              rgba_len: item.rgba.length,
            }), 'utf8');
            const length = Buffer.alloc(4);
            length.writeUInt32LE(header.length);
            try {
              worker.stdin.write(length);
              worker.stdin.write(header);
              worker.stdin.write(item.rgba, error => { if (error) this._fail(worker, error); });
            } catch (error) { this._fail(worker, error); }
          });
          item.resolve(result);
        } catch (error) { item.reject(error); }
        finally {
          clearTimeout(item.timer);
          if (this.active === item) this.active = null;
        }
      }
    } finally {
      this.draining = false;
      if (this.queue.length) void this._drain();
    }
  }

  _receive(worker, chunk) {
    if (this.worker !== worker) return;
    this.received = this.received.length ? Buffer.concat([this.received, chunk]) : chunk;
    while (this.received.length >= 4) {
      const length = this.received.readUInt32LE(0);
      if (!length || length > MAX_RESPONSE_BYTES) {
        this._fail(worker, new Error('OCR 返回的数据长度无效'));
        return;
      }
      if (this.received.length < length + 4) return;
      const payload = this.received.subarray(4, length + 4);
      this.received = this.received.subarray(length + 4);
      let result;
      try { result = JSON.parse(payload.toString('utf8')); }
      catch { this._fail(worker, new Error('OCR 返回了无效 JSON')); return; }
      const active = this.active;
      if (!active?.response || active.replied || !result || typeof result !== 'object' || Array.isArray(result) || result.sequence !== active.sequence) {
        this._fail(worker, new Error('OCR 响应序号不匹配'));
        return;
      }
      active.replied = true;
      clearTimeout(active.timer);
      active.response.resolve(result);
    }
  }

  _cancelAll(error) {
    if (this.active) {
      this.active.cancelled = true;
      clearTimeout(this.active.timer);
      this.active.response?.reject(error);
      this.active.reject(error);
    }
    for (const item of this.queue.splice(0)) item.reject(error);
  }

  _fail(worker, error) {
    if (this.worker !== worker) return;
    this.worker = null;
    this.received = Buffer.alloc(0);
    this._cancelAll(error);
    worker.stdin.destroy();
    if (worker.exitCode === null && !worker.killed) worker.kill();
  }

  async close() {
    if (this.closing) return this.closing;
    this.generation++;
    this.initializing = null;
    const worker = this.worker;
    this.worker = null;
    this.received = Buffer.alloc(0);
    this._cancelAll(new Error('OCR 已停止'));
    if (!worker) return;
    const closing = new Promise(resolve => {
      const timer = setTimeout(resolve, 2000);
      worker.once('exit', () => { clearTimeout(timer); resolve(); });
      worker.stdin.destroy();
      if (worker.exitCode !== null) { clearTimeout(timer); resolve(); }
      else if (!worker.killed) worker.kill();
    });
    this.closing = closing;
    try { await closing; }
    finally { if (this.closing === closing) this.closing = null; }
  }
}

module.exports = { OcrEngine, verifyRuntime };
