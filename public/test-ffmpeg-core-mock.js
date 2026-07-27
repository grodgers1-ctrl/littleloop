// Mock for FFmpeg's UMD core. Defines `self.FFmpegCore` with a
// minimal shape so @ffmpeg/ffmpeg's bootstrap doesn't crash. The
// real core loads from unpkg.com in production; this file exists
// only to let our e2e tests drive the canvas/bitmap pipeline
// without hitting the CDN.
self.FFmpegCore = {
  version: () => "0.0.0-mock",
  FS: {
    writeFile: () => {},
    readFile: () => new Uint8Array(),
    unlink: () => {},
  },
  ccall: () => 0,
  cwrap: () => () => 0,
};