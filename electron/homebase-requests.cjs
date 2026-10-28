const path = require('node:path');
const fs = require('node:fs/promises');

class HomebaseRequests {
  constructor(notify = () => {}) {
    this.queue = [];
    this.notify = notify;
  }
  enqueue(argv) {
    const index = argv.indexOf('--open-homebase');
    if (index < 0) return;
    const file = argv[index + 1];
    if (
      typeof file !== 'string' ||
      !path.isAbsolute(file) ||
      file.startsWith('\\\\') ||
      !file.toLowerCase().endsWith('.sav')
    )
      return;
    if (this.queue.length >= 8) return;
    this.queue.push(file);
    this.notify();
  }
  async take() {
    const file = this.queue.shift();
    if (!file) return null;
    const name = path.basename(file);
    let handle;
    try {
      if ((await fs.lstat(file)).isSymbolicLink())
        throw new Error('Linked saves are not supported.');
      handle = await fs.open(file, 'r');
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size < 4 || stat.size > 128 * 1024 * 1024)
        throw new Error('Homebase files must be 128 MiB or smaller.');
      const bytes = Buffer.alloc(stat.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!read.bytesRead) throw new Error('The homebase changed while opening. Try again.');
        offset += read.bytesRead;
      }
      if ((await handle.stat()).size !== stat.size || bytes.toString('ascii', 0, 4) !== 'GVAS')
        throw new Error('Not a supported homebase save.');
      return { name, bytes: new Uint8Array(bytes) };
    } catch {
      return {
        name,
        error: 'Could not read this homebase. Choose a valid local .sav file and try again.',
      };
    } finally {
      await handle?.close();
    }
  }
}
module.exports = { HomebaseRequests };
