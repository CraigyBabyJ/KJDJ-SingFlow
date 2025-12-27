import { PACKETS_PER_SECTOR, SECTORS_PER_SECOND } from './constants';
import CDGFrameBuffer from './CDGFrameBuffer';
import CDGParser from './CDGParser';
import CDGRenderer from './CDGRenderer';

const FRAME_INTERVAL_MS = 1000 / (PACKETS_PER_SECTOR * SECTORS_PER_SECOND);

const now = () =>
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

const requestFrame = (cb) =>
  typeof requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(cb)
    : setTimeout(cb, FRAME_INTERVAL_MS);

const cancelFrame = (id) =>
  typeof cancelAnimationFrame === 'function'
    ? window.cancelAnimationFrame(id)
    : clearTimeout(id);

/**
 * CDGPlayer coordinates parsing, buffering, and rendering of CDG packets.
 * Public API is intentionally compatible with the previous implementation so the
 * React KaraokePlayer can remain a drop-in consumer:
 *  - new CDGPlayer({ contextOptions: { canvas, width, height } })
 *  - load(cdgBytes)
 *  - play() / stop()
 *  - reset()
 *  - sync(milliseconds)
 */
export default class CDGPlayer {
  constructor({
    contextOptions = {},
    parser = new CDGParser({}),
    frameBuffer = new CDGFrameBuffer(contextOptions),
    renderer = new CDGRenderer(contextOptions),
    afterRender,
  } = {}) {
    this.parser = parser;
    this.frameBuffer = frameBuffer;
    this.renderer = renderer;
    this.afterRender = afterRender;

    this.instructions = [];
    this.pc = -1;
    this.frameId = null;
    this.pos = 0;
    this.lastSyncPos = null;
    this.lastTimestamp = null;
  }

  load(bytes) {
    this.instructions = this.parser.parse(bytes);
    this.reset();
    return this;
  }

  reset() {
    this.stop();
    this.pc = 0;
    this.pos = 0;
    this.lastSyncPos = null;
    this.lastTimestamp = null;
    this.frameBuffer.reset();
    this.renderer.render(this.frameBuffer);
    return this;
  }

  play() {
    if (!this.frameId) {
      this.frameId = requestFrame(this.update);
      this.lastTimestamp = now();
    }
    return this;
  }

  stop() {
    if (this.frameId) {
      cancelFrame(this.frameId);
    }
    this.frameId = null;
    this.lastSyncPos = null;
    return this;
  }

  sync(ms) {
    this.lastSyncPos = ms;
    this.lastTimestamp = now();
    return this;
  }

  step() {
    if (this.pc >= 0 && this.pc < this.instructions.length) {
      this.instructions[this.pc]?.apply(this.frameBuffer);
      this.pc += 1;
    } else {
      this.pc = -1;
      this.stop();
    }
  }

  fastForward(count = 1) {
    const target = this.pc + count;
    while (this.pc >= 0 && this.pc < target) {
      this.step();
    }
  }

  render() {
    this.renderer.render(this.frameBuffer);
    this.afterRender?.(this.frameBuffer);
  }

  update = (timestamp = now()) => {
    if (this.pc === -1) {
      return this;
    }

    this.frameId = requestFrame(this.update);

    const lastTimestamp = this.lastTimestamp ?? timestamp;
    if (this.lastSyncPos != null) {
      this.pos = this.lastSyncPos + (timestamp - lastTimestamp);
    } else {
      this.pos += timestamp - lastTimestamp;
    }
    this.lastTimestamp = timestamp;

    const newPc = Math.floor(
      SECTORS_PER_SECOND * PACKETS_PER_SECTOR * (this.pos / 1000)
    );

    if (newPc < this.pc) {
      this.pc = 0;
      this.frameBuffer.reset();
    }

    const ffAmt = newPc - this.pc;
    if (ffAmt > 0) {
      this.fastForward(ffAmt);
      this.render();
    }

    return this;
  };
}
