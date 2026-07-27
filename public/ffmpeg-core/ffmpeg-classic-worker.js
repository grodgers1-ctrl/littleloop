// Custom FFmpeg sub-worker for @ffmpeg/ffmpeg 0.12.10.
//
// Why this exists: the FFmpeg library's built-in worker uses ESM
// import syntax, which forces the spawning code to use a module
// worker. Module workers cannot call importScripts() — that throws
// a TypeError on every browser, which is the "failed to import
// ffmpeg-core.js" failure we hit on iOS Safari 26.5 (and would hit
// anywhere else too — Chromium silently dropped the error).
//
// We give the FFmpeg orchestrator this URL via classWorkerURL. The
// library spawns it as a CLASSIC worker (because we patched
// classes.js to drop type:"module"). Classic workers fully support
// importScripts() so the FFmpeg core loads correctly from the
// same-origin /ffmpeg-core/ path.
//
// This is a near-verbatim copy of @ffmpeg/ffmpeg/dist/esm/worker.js
// with all the ESM `import` lines replaced with inline consts. It
// must stay in sync with the library's worker.js, but the library
// only exposes 5 message constants and 3 errors — easy to verify.

// Message types (must match @ffmpeg/ffmpeg's FFMessageType).
const FFMessageType = {
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
  LOG: "LOG",
  PROGRESS: "PROGRESS",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
};

// Errors (must match @ffmpeg/ffmpeg's errors.ts).
const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error(
  "ffmpeg is not loaded, call `await ffmpeg.load()` first",
);
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

let ffmpeg;

const load = async ({ coreURL: _coreURL, wasmURL: _wasmURL, workerURL: _workerURL }) => {
  const first = !ffmpeg;
  try {
    // Classic worker: importScripts is allowed. The core URL was
    // resolved relative to the FFmpeg orchestrator's URL by the
    // library before being passed in here.
    importScripts(_coreURL);
  } catch {
    throw ERROR_IMPORT_FAILURE;
  }
  const coreURL = _coreURL;
  const wasmURL = _wasmURL ? _wasmURL : _coreURL.replace(/\.js$/g, ".wasm");
  const workerURL = _workerURL
    ? _workerURL
    : _coreURL.replace(/\.js$/g, ".worker.js");
  ffmpeg = await self.createFFmpegCore({
    mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
  });
  ffmpeg.setLogger((data) => self.postMessage({ type: FFMessageType.LOG, data }));
  ffmpeg.setProgress((data) =>
    self.postMessage({ type: FFMessageType.PROGRESS, data }),
  );
  return first;
};

const exec = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }) => ffmpeg.FS.readFile(path, { encoding });

const deleteFile = ({ path }) => {
  ffmpeg.FS.unlink(path);
  return true;
};

const rename = ({ oldPath, newPath }) => {
  ffmpeg.FS.rename(oldPath, newPath);
  return true;
};

const createDir = ({ path }) => {
  ffmpeg.FS.mkdir(path);
  return true;
};

const listDir = ({ path }) => {
  const names = ffmpeg.FS.readdir(path);
  const nodes = [];
  for (const name of names) {
    const stat = ffmpeg.FS.stat(`${path}/${name}`);
    nodes.push({ name, isDir: ffmpeg.FS.isDir(stat.mode) });
  }
  return nodes;
};

const deleteDir = ({ path }) => {
  ffmpeg.FS.rmdir(path);
  return true;
};

const mount = ({ fsType, options, mountPoint }) => {
  ffmpeg.FS.filesystems[fsType].mount(options, mountPoint);
  return true;
};

const unmount = ({ mountPoint }) => {
  ffmpeg.FS.unmount(mountPoint);
  return true;
};

self.onmessage = async ({ data: { id, type, data: _data } }) => {
  const trans = [];
  let data;
  try {
    if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;
    switch (type) {
      case FFMessageType.LOAD:
        data = await load(_data);
        break;
      case FFMessageType.EXEC:
        data = exec(_data);
        break;
      case FFMessageType.WRITE_FILE:
        data = writeFile(_data);
        break;
      case FFMessageType.READ_FILE:
        data = readFile(_data);
        break;
      case FFMessageType.DELETE_FILE:
        data = deleteFile(_data);
        break;
      case FFMessageType.RENAME:
        data = rename(_data);
        break;
      case FFMessageType.CREATE_DIR:
        data = createDir(_data);
        break;
      case FFMessageType.LIST_DIR:
        data = listDir(_data);
        break;
      case FFMessageType.DELETE_DIR:
        data = deleteDir(_data);
        break;
      case FFMessageType.MOUNT:
        data = mount(_data);
        break;
      case FFMessageType.UNMOUNT:
        data = unmount(_data);
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }
  } catch (e) {
    self.postMessage({ id, type: FFMessageType.ERROR, data: e.toString() });
    return;
  }
  if (data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({ id, type, data }, trans);
};