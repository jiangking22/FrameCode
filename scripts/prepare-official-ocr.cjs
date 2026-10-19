const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { verifyRuntime } = require('../src/main/ocr.cjs');

const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[2] || path.join(process.env.LOCALAPPDATA || '',
  'com.administrator.fps-vantix', 'LivePlayerHost', 'runtime', 'ocr'));
const resources = path.join(root, 'resources');
const destination = path.join(resources, 'ocr-runtime');
const manifestName = 'manifest.sha256.json';

async function collect(directory, relative = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await collect(directory, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported official runtime entry: ${name}`);
  }
  return files.sort();
}

async function main() {
  const sourceKey = source.toLowerCase();
  const destinationKey = destination.toLowerCase();
  if (sourceKey === destinationKey || sourceKey.startsWith(destinationKey + path.sep) || destinationKey.startsWith(sourceKey + path.sep)) {
    throw new Error('The source runtime and output runtime must be separate directories.');
  }
  await fs.mkdir(resources, { recursive: true });
  const stagingRoot = await fs.mkdtemp(path.join(resources, '.ocr-runtime-'));
  const staging = path.join(stagingRoot, 'resources', 'ocr-runtime');
  const backup = path.join(stagingRoot, 'previous');
  let previousSaved = false;
  let installed = false;
  let preserveBackup = false;
  try {
    await fs.mkdir(staging, { recursive: true });
    const files = [];
    for (const relative of await collect(source)) {
      if (relative === manifestName) throw new Error('The source must be the original installed OCR directory.');
      const data = await fs.readFile(path.join(source, relative));
      const target = path.join(staging, relative);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data, { flag: 'wx' });
      files.push({ path: relative, size: data.length, sha256: createHash('sha256').update(data).digest('hex') });
    }
    await fs.writeFile(path.join(staging, manifestName), JSON.stringify({
      format: 1,
      files,
    }, null, 2) + '\n');
    await verifyRuntime(stagingRoot);
    try { await fs.rename(destination, backup); previousSaved = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await fs.rename(staging, destination);
    installed = true;
    await verifyRuntime(root);
    console.log(`Official OCR runtime copied unchanged: ${files.length} files, SHA-256 manifest verified.`);
  } catch (error) {
    try {
      if (installed) await fs.rm(destination, { recursive: true, force: true });
      if (previousSaved) await fs.rename(backup, destination);
    } catch (restoreError) {
      preserveBackup = true;
      throw new AggregateError([error, restoreError], `OCR runtime preparation failed; previous runtime preserved at ${backup}`);
    }
    throw error;
  } finally {
    if (!preserveBackup) await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
