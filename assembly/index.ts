// The entry file of your WebAssembly module.
const fullAlpha = 0xff000000;

export function writeImageData(size: u32, color: u32): void {
  for (let i: u32 = 0; i < size; i++) {
    store<u32>(i << 2, color);
  }
}

export function invert(size: u32): void {
  for (let i: u32 = 0; i < size; i++) {
    let val = load<u32>(i << 2);
    let inverted = 0xffffffff - val;
    inverted = fullAlpha | inverted; // ensure 0xff full alpha
    store<u32>(i << 2, inverted);
  }
}

// @inline
function pixelIdx(x: u32, y: u32, width: u32): u32 {
  return (y * width + x) << 2;
}

function outPixelIdx(x: u32, y: u32, width: u32, offset: u32): u32 {
  return (offset + y * width + x) << 2;
}

// @inline
function pixelVal(x: u32, y: u32, width: u32): u32 {
  return load<u32>(pixelIdx(x, y, width));
}

function energyDiff(left: u32, right: u32, up: u32, down: u32): u32 {
  // pixel data is little-endian: ABGR
  let xDiffR = (left & 0xff) - (right & 0xff); // rightmost byte
  let xDiffG = ((left >> 8) & 0xff) - ((right >> 8) & 0xff); // 2nd-rightmost byte
  let xDiffB = ((left >> 16) & 0xff) - ((right >> 16) & 0xff); // 3rd-rightmost byte

  let yDiffR = (up & 0xff) - (down & 0xff);
  let yDiffG = ((up >> 8) & 0xff) - ((down >> 8) & 0xff);
  let yDiffB = ((up >> 16) & 0xff) - ((down >> 16) & 0xff);

  return (
    xDiffR * xDiffR +
    xDiffG * xDiffG +
    xDiffB * xDiffB +
    yDiffR * yDiffR +
    yDiffG * yDiffG +
    yDiffB * yDiffB
  );
}

export function energize(width: u32, height: u32): void {
  let maxEnergy = 255 * 255 * 3 * 2; // 255^2 max diff per color channel * 3 channels * two directions (left-right, up-down)
  let size = width * height;

  for (let x: u32 = 0; x < width; x++) {
    for (let y: u32 = 0; y < width; y++) {
      let leftX = x === 0 ? width - 1 : x - 1;
      let rightX = x === width - 1 ? 0 : x + 1;
      let upY = y === 0 ? height - 1 : y - 1;
      let downY = y === height - 1 ? 0 : y + 1;

      let leftVal = pixelVal(leftX, y, width);
      let rightVal = pixelVal(rightX, y, width);
      let upVal = pixelVal(x, upY, width);
      let downVal = pixelVal(x, downY, width);

      let energy = energyDiff(leftVal, rightVal, upVal, downVal);
      let normalizedEnergy = (255 * energy) / maxEnergy; // single-channel, 0-255 value
      let pixelColor =
        fullAlpha | // A
        (normalizedEnergy << 8) | // B
        (normalizedEnergy << 16) | // G
        (normalizedEnergy << 24); // R
      store<u32>(outPixelIdx(x, y, width, size), pixelColor);
    }
  }
}
