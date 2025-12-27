import {
  CDG_COMMAND,
  COMMAND_MASK,
  PACKET_SIZE,
  CDG_DATA,
  CDG_NOOP,
  CDG_MEMORY_PRESET,
  CDG_BORDER_PRESET,
  CDG_TILE_BLOCK,
  CDG_TILE_BLOCK_XOR,
  CDG_SCROLL_PRESET,
  CDG_SCROLL_COPY,
  CDG_SET_KEY_COLOR,
  CDG_LOAD_CLUT_LOW,
  CDG_LOAD_CLUT_HI,
} from './constants';

const EMPTY_INSTRUCTION = {
  opcode: CDG_NOOP,
  apply: () => {},
};

const clampOffsets = (value, max) => Math.min(value, max);

function parseTileBlock(bytes, offset, xor) {
  const color0 = bytes[offset + CDG_DATA] & 0x0f;
  const color1 = bytes[offset + CDG_DATA + 1] & 0x0f;
  const row = bytes[offset + CDG_DATA + 2] & 0x1f;
  const column = bytes[offset + CDG_DATA + 3] & 0x3f;
  const pixelRows = [];
  for (let i = 0; i < 12; i += 1) {
    pixelRows.push(bytes[offset + CDG_DATA + 4 + i] & 0x3f);
  }
  return {
    opcode: xor ? CDG_TILE_BLOCK_XOR : CDG_TILE_BLOCK,
    apply: (frameBuffer) =>
      frameBuffer.drawTile({
        row,
        column,
        colors: [color0, color1],
        pixelRows,
        xor,
      }),
  };
}

function parseScroll(bytes, offset, copy) {
  const color = bytes[offset + CDG_DATA] & 0x0f;
  const hCmd = (bytes[offset + CDG_DATA + 1] & 0x30) >> 4;
  const hOffset = clampOffsets(bytes[offset + CDG_DATA + 1] & 0x07, 0x07);
  const vCmd = (bytes[offset + CDG_DATA + 2] & 0x30) >> 4;
  const vOffset = clampOffsets(bytes[offset + CDG_DATA + 2] & 0x0f, 0x0f);

  return {
    opcode: copy ? CDG_SCROLL_COPY : CDG_SCROLL_PRESET,
    apply: (frameBuffer) =>
      frameBuffer.scroll({
        hCmd,
        vCmd,
        fillColor: color,
        hOffset,
        vOffset,
        copy,
      }),
  };
}

function parseClut(bytes, offset, startIndex) {
  const colors = [];
  for (let i = 0; i < 8; i += 1) {
    const pointer = offset + CDG_DATA + 2 * i;
    const packed = ((bytes[pointer] & 0x3f) << 6) + (bytes[pointer + 1] & 0x3f);
    colors.push({
      index: startIndex + i,
      r: packed >> 8,
      g: (packed & 0xf0) >> 4,
      b: packed & 0x0f,
    });
  }
  return {
    opcode: startIndex === 0 ? CDG_LOAD_CLUT_LOW : CDG_LOAD_CLUT_HI,
    apply: (frameBuffer) => {
      colors.forEach(({ index, r, g, b }) => frameBuffer.setCLUTEntry(index, r, g, b));
    },
  };
}

const PARSERS = {
  [CDG_MEMORY_PRESET]: (bytes, offset) => {
    const color = bytes[offset + CDG_DATA] & 0x0f;
    return {
      opcode: CDG_MEMORY_PRESET,
      apply: (frameBuffer) => frameBuffer.presetMemory(color),
    };
  },
  [CDG_BORDER_PRESET]: (bytes, offset) => {
    const color = bytes[offset + CDG_DATA] & 0x0f;
    return {
      opcode: CDG_BORDER_PRESET,
      apply: (frameBuffer) => frameBuffer.presetBorder(color),
    };
  },
  [CDG_TILE_BLOCK]: (bytes, offset) => parseTileBlock(bytes, offset, false),
  [CDG_TILE_BLOCK_XOR]: (bytes, offset) => parseTileBlock(bytes, offset, true),
  [CDG_SCROLL_PRESET]: (bytes, offset) => parseScroll(bytes, offset, false),
  [CDG_SCROLL_COPY]: (bytes, offset) => parseScroll(bytes, offset, true),
  [CDG_SET_KEY_COLOR]: (bytes, offset) => {
    const color = bytes[offset + CDG_DATA] & 0x0f;
    return {
      opcode: CDG_SET_KEY_COLOR,
      apply: (frameBuffer) => {
        frameBuffer.keyColor = color;
      },
    };
  },
  [CDG_LOAD_CLUT_LOW]: (bytes, offset) => parseClut(bytes, offset, 0),
  [CDG_LOAD_CLUT_HI]: (bytes, offset) => parseClut(bytes, offset, 8),
};

export default class CDGParser {
  constructor({ onUnknownOpcode } = {}) {
    this.onUnknownOpcode = onUnknownOpcode;
  }

  parseInstruction(bytes, offset) {
    const command = bytes[offset] & COMMAND_MASK;
    if (command !== CDG_COMMAND) {
      return EMPTY_INSTRUCTION;
    }
    const opcode = bytes[offset + 1] & COMMAND_MASK;
    if (PARSERS[opcode]) {
      return PARSERS[opcode](bytes, offset);
    }
    this.onUnknownOpcode?.(opcode);
    return EMPTY_INSTRUCTION;
  }

  parse(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const instructions = [];
    for (let offset = 0; offset < view.length; offset += PACKET_SIZE) {
      instructions.push(this.parseInstruction(view, offset));
    }
    return instructions;
  }
}
