import { describe, expect, it } from 'vitest';
import CDGFrameBuffer from '../CDGFrameBuffer';
import CDGParser from '../CDGParser';
import CDGRenderer from '../CDGRenderer';
import {
  CDG_COMMAND,
  CDG_DATA,
  CDG_LOAD_CLUT_LOW,
  CDG_MEMORY_PRESET,
  CDG_TILE_BLOCK,
  PACKET_SIZE,
  WIDTH,
  HEIGHT,
} from '../constants';

class StubCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ctx = {
      imageSmoothingEnabled: false,
      createImageData: (w, h) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      putImageData: (imageData) => {
        this.lastImageData = imageData;
      },
    };
  }

  getContext() {
    return this.ctx;
  }
}

const buildPacket = (opcode, payload = []) => {
  const packet = new Uint8Array(PACKET_SIZE);
  packet[0] = CDG_COMMAND;
  packet[1] = opcode;
  payload.forEach((value, idx) => {
    packet[CDG_DATA + idx] = value;
  });
  return packet;
};

const buildClutPacket = (entries) => {
  const packet = buildPacket(CDG_LOAD_CLUT_LOW);
  for (let i = 0; i < 8; i += 1) {
    const [r, g, b] = entries[i] ?? [0, 0, 0];
    const packed = (r << 8) | (g << 4) | b;
    packet[CDG_DATA + 2 * i] = (packed >> 6) & 0x3f;
    packet[CDG_DATA + 2 * i + 1] = packed & 0x3f;
  }
  return packet;
};

const buildTileBlock = ({ colors, row, column, rows }) => {
  const packet = buildPacket(CDG_TILE_BLOCK);
  packet[CDG_DATA] = colors[0];
  packet[CDG_DATA + 1] = colors[1];
  packet[CDG_DATA + 2] = row;
  packet[CDG_DATA + 3] = column;
  rows.forEach((value, idx) => {
    packet[CDG_DATA + 4 + idx] = value;
  });
  return packet;
};

describe('CDG pipeline', () => {
  it('parses packets into executable instructions', () => {
    const parser = new CDGParser();
    const packets = new Uint8Array([
      ...buildPacket(CDG_MEMORY_PRESET, [0x05, 0x00]),
      ...buildPacket(0x7f), // unknown opcode becomes no-op
    ]);

    const instructions = parser.parse(packets);
    expect(instructions).toHaveLength(2);

    const frameBuffer = new CDGFrameBuffer();
    instructions[0].apply(frameBuffer);
    expect(frameBuffer.getBackgroundIndex()).toBe(5);
    // Unknown opcode should not mutate the buffer
    instructions[1].apply(frameBuffer);
    expect(frameBuffer.getBackgroundIndex()).toBe(5);
  });

  it('renders tiles with the provided palette', () => {
    const parser = new CDGParser();
    const packets = new Uint8Array([
      ...buildClutPacket({
        1: [0x00, 0x00, 0x0f], // blue
        2: [0x0f, 0x00, 0x00], // red
        3: [0x00, 0x0f, 0x00], // green
      }),
      ...buildPacket(CDG_MEMORY_PRESET, [0x01, 0x00]),
      ...buildTileBlock({
        colors: [2, 3],
        row: 0,
        column: 0,
        rows: new Array(12).fill(0b111111),
      }),
    ]);

    const instructions = parser.parse(packets);
    const frameBuffer = new CDGFrameBuffer();
    instructions.forEach((instruction) => instruction.apply(frameBuffer));

    const canvas = new StubCanvas(WIDTH, HEIGHT);
    const renderer = new CDGRenderer({ canvas, width: WIDTH, height: HEIGHT });
    renderer.render(frameBuffer);

    const imageData = canvas.ctx.lastImageData.data;
    const pixelAt = (x, y) => {
      const offset = 4 * (x + y * WIDTH);
      return Array.from(imageData.slice(offset, offset + 4));
    };

    expect(pixelAt(0, 0)).toEqual([0, 255, 0, 255]); // tile block fills green
    expect(pixelAt(10, 20)).toEqual([0, 0, 255, 255]); // background stays blue
  });
});
