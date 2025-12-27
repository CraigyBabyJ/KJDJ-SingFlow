import { WIDTH, HEIGHT } from './constants';

const NOOP_CTX = {
  createImageData: (width, height) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }),
  putImageData: () => {},
  imageSmoothingEnabled: false,
};

function createCanvas(width, height) {
  if (typeof document === 'undefined') {
    return {
      width,
      height,
      getContext: () => NOOP_CTX,
    };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createCanvasContext(canvas) {
  const ctx = canvas.getContext?.('2d') ?? NOOP_CTX;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;
  ctx.msImageSmoothingEnabled = false;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export default class CDGRenderer {
  constructor({ canvas, width = WIDTH, height = HEIGHT } = {}) {
    this.canvas = canvas ?? createCanvas(width, height);
    this.ctx = createCanvasContext(this.canvas);
    this.imageData = this.ctx.createImageData(width, height);
  }

  render(frameBuffer) {
    frameBuffer.writeImageData(this.imageData.data);
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
