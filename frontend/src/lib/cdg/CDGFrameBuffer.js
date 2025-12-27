import {
  WIDTH,
  HEIGHT,
  TILE_WIDTH,
  TILE_HEIGHT,
  DISPLAY_BOUNDS,
} from './constants';

/**
 * CDGFrameBuffer
 * Maintains palette + pixel data independent of any canvas so it can be reused in tests.
 */
export default class CDGFrameBuffer {
  constructor({ width = WIDTH, height = HEIGHT } = {}) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height);
    this.buffer = new Uint8Array(width * height);
    this.clut = Array.from({ length: 16 }, () => [0, 0, 0]);
    this.reset();
  }

  reset() {
    this.hOffset = 0;
    this.vOffset = 0;
    this.keyColor = null;
    this.backgroundColor = null;
    this.borderColor = null;
    this.memoryColor = null;
    this.pixels.fill(0);
    this.buffer.fill(0);
    this.clut.forEach((entry) => {
      entry[0] = 0;
      entry[1] = 0;
      entry[2] = 0;
    });
  }

  setCLUTEntry(index, r, g, b) {
    const entry = this.clut[index];
    entry[0] = r * 17;
    entry[1] = g * 17;
    entry[2] = b * 17;
  }

  setPixel(x, y, colorIndex) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    this.pixels[x + y * this.width] = colorIndex;
  }

  getPixel(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.pixels[x + y * this.width];
  }

  getBackgroundIndex() {
    if (this.keyColor != null) return this.keyColor;
    if (this.backgroundColor != null) return this.backgroundColor;
    if (this.memoryColor != null) return this.memoryColor;
    if (this.borderColor != null) return this.borderColor;
    return 0;
  }

  /**
   * Fill every pixel with a single color index.
   */
  presetMemory(colorIndex) {
    this.memoryColor = colorIndex;
    this.backgroundColor = colorIndex;
    this.pixels.fill(colorIndex);
  }

  /**
   * Paints the border area with the provided color index.
   */
  presetBorder(colorIndex) {
    this.borderColor = colorIndex;
    this.backgroundColor = colorIndex;
    const [left, top, right, bottom] = DISPLAY_BOUNDS;
    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < top; y += 1) {
        this.setPixel(x, y, colorIndex);
      }
      for (let y = bottom + 1; y < this.height; y += 1) {
        this.setPixel(x, y, colorIndex);
      }
    }
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < left; x += 1) {
        this.setPixel(x, y, colorIndex);
      }
      for (let x = right + 1; x < this.width; x += 1) {
        this.setPixel(x, y, colorIndex);
      }
    }
  }

  /**
   * Draws a 12x6 tile using the provided palette indexes.
   */
  drawTile({ row, column, colors, pixelRows, xor = false }) {
    const x = column * TILE_WIDTH;
    const y = row * TILE_HEIGHT;
    if (x + TILE_WIDTH > this.width || y + TILE_HEIGHT > this.height) {
      return;
    }
    for (let i = 0; i < TILE_HEIGHT; i += 1) {
      const rowBits = pixelRows[i] & 0x3f;
      for (let j = 0; j < TILE_WIDTH; j += 1) {
        const color =
          colors[((rowBits >> (TILE_WIDTH - 1 - j)) & 0x01) === 1 ? 1 : 0];
        if (xor) {
          this.setPixel(x + j, y + i, this.getPixel(x + j, y + i) ^ color);
        } else {
          this.setPixel(x + j, y + i, color);
        }
      }
    }
  }

  /**
   * Scrolls the pixels, filling voids with a color or wrapping based on `copy`.
   */
  scroll({ hCmd, vCmd, fillColor, hOffset, vOffset, copy = false }) {
    this.backgroundColor = fillColor;
    this.hOffset = Math.min(hOffset, TILE_WIDTH - 1);
    this.vOffset = Math.min(vOffset, TILE_HEIGHT - 1);

    const hScroll =
      hCmd === 2 ? TILE_WIDTH : hCmd === 1 ? -TILE_WIDTH : 0; // right/left
    const vScroll =
      vCmd === 2 ? TILE_HEIGHT : vCmd === 1 ? -TILE_HEIGHT : 0; // down/up

    if (!hScroll && !vScroll) {
      return;
    }

    for (let x = 0; x < this.width; x += 1) {
      for (let y = 0; y < this.height; y += 1) {
        const sourceX = x + hScroll;
        const sourceY = y + vScroll;
        const outOfBounds =
          sourceX < 0 ||
          sourceX >= this.width ||
          sourceY < 0 ||
          sourceY >= this.height;
        const sourceIndex = copy
          ? this.getPixel(
              (sourceX + this.width) % this.width,
              (sourceY + this.height) % this.height
            )
          : this.getPixel(sourceX, sourceY);
        this.buffer[x + y * this.width] = copy
          ? sourceIndex
          : outOfBounds
            ? fillColor
            : sourceIndex;
      }
    }

    [this.pixels, this.buffer] = [this.buffer, this.pixels];
  }

  /**
   * Applies palette + offsets to the provided RGBA buffer.
   */
  writeImageData(target) {
    for (let y = 0; y < this.height; y += 1) {
      const py = (y - this.vOffset + this.height) % this.height;
      for (let x = 0; x < this.width; x += 1) {
        const px = (x - this.hOffset + this.width) % this.width;
        const pixelIndex = this.pixels[px + py * this.width];
        const [r, g, b] = this.clut[pixelIndex];
        const offset = 4 * (x + y * this.width);
        target[offset] = r;
        target[offset + 1] = g;
        target[offset + 2] = b;
        target[offset + 3] = pixelIndex === this.keyColor ? 0 : 255;
      }
    }
  }

  /**
   * Used in tests for asserting specific pixels.
   */
  getColorIndex(x, y) {
    return this.getPixel(x, y);
  }
}
