// The entry file of your WebAssembly module.
const fullAlpha = 0xff000000;

var width: u32;
var height: u32;
const bytesPerPixel: u32 = 4; // r, g, b and a
var pixelOffset: u32;
var energyOffset: u32;
var costOffset: u32;
const MAX_COST: u32 = 255 * 255 * 3 * 2; // 255^2 per channel * 3 channels * 2 axes (x and y)
export function init(w: u32, h: u32): u32 {
  width = w;
  height = h;

  let byteSize = width * height * bytesPerPixel;

  pixelOffset = __alloc(byteSize, idof<Uint8Array>());
  energyOffset = pixelOffset + __alloc(byteSize, idof<Uint8Array>());
  costOffset =
    pixelOffset + energyOffset + __alloc(byteSize, idof<Uint8Array>());
  trace('offsets:', 3, pixelOffset, energyOffset, costOffset);
  return pixelOffset;
}

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

// @inline
function _pixelIdx(x: u32, y: u32): u32 {
  return pixelOffset + (y * width + x) * bytesPerPixel;
}

function getPixel(x: u32, y: u32): u32 {
  return load<u32>(_pixelIdx(x, y));
}

function setPixel(x: u32, y: u32, value: u32): void {
  store<u32>(_pixelIdx(x, y), value);
}

function _energyIdx(x: u32, y: u32): u32 {
  return energyOffset + (y * width + x) * bytesPerPixel;
}

function setEnergy(x: u32, y: u32, value: u32): void {
  store<u32>(_energyIdx(x, y), value);
}

function getEnergy(x: u32, y: u32): u32 {
  return load<u32>(_energyIdx(x, y));
}

function _costIdx(x: u32, y: u32): u32 {
  return costOffset + (y * width + x) * bytesPerPixel;
}

function setCost(x: u32, y: u32, value: u32): void {
  store<u32>(_costIdx(x, y), value);
}

function getCost(x: u32, y: u32): u32 {
  return load<u32>(_costIdx(x, y));
}

function energyDiff(a: u32, b: u32): u32 {
  // pixel data is little-endian: ABGR
  let diffR = (a & 0xff) - (b & 0xff); // rightmost byte
  let diffG = ((a >> 8) & 0xff) - ((b >> 8) & 0xff); // 2nd-rightmost byte
  let diffB = ((a >> 16) & 0xff) - ((b >> 16) & 0xff); // 3rd-rightmost byte

  return diffR * diffR + diffG * diffG + diffB * diffB;
}

export function calculateEnergyMap(): void {
  trace('calculateEnergyMap');
  assert(width > 0, 'Cannot calculate energy map before calling init');
  assert(height > 0, 'Cannot calculate energy map before calling init');

  for (let x: u32 = 0; x < width; x++) {
    for (let y: u32 = 0; y < height; y++) {
      let leftX = x === 0 ? width - 1 : x - 1;
      let rightX = x === width - 1 ? 0 : x + 1;
      let upY = y === 0 ? height - 1 : y - 1;
      let downY = y === height - 1 ? 0 : y + 1;

      let xEnergy = energyDiff(getPixel(leftX, y), getPixel(rightX, y));
      let yEnergy = energyDiff(getPixel(x, upY), getPixel(x, downY));
      let energy = xEnergy + yEnergy;
      setEnergy(x, y, energy);
    }
  }
}

/**
 * This step is implemented with dynamic programming. The value of each pixel
 * is equal to its corresponding value in the energy map added to the minimum
 * new neighbor energy introduced by removing one of its three top neighbors
 * (top-left, top-center, and top-right)
 */
export function calculateCostMap(): void {
  trace('calculateCostMap');
  assert(width > 0, 'Cannot calculate energy map before calling init');
  assert(height > 0, 'Cannot calculate energy map before calling init');

  for (let x: u32 = 0; x < width; x++) {
    for (let y: u32 = 0; y < height; y++) {
      let energy = getEnergy(x, y);
      if (y === 0) {
        setCost(x, y, energy);
      } else {
        let minPrevEnergy = getEnergy(x, y - 1);
        if (x > 0) {
          minPrevEnergy = min(minPrevEnergy, getEnergy(x - 1, y - 1));
        }
        if (x < width - 1) {
          minPrevEnergy = min(minPrevEnergy, getEnergy(x + 1, y - 1));
        }
        setCost(x, y, energy + minPrevEnergy);
      }
    }
  }
}

export function findSeam(): u32[] {
  trace('findSeam');
  calculateEnergyMap();
  calculateCostMap();
  let seam = Array.create<u32>(height);
  let minCost: u32 = MAX_COST;
  let curMinX: u32 = 0;

  for (let y: isize = height - 1; y >= 0; y--) {
    // last row, work upwards from here
    if (y === height - 1) {
      for (let x: u32 = 0; x < width; x++) {
        let cost = getCost(x, y);
        if (cost < minCost) {
          minCost = cost;
          curMinX = x;
        }
      }
    } else {
      let neighborCount =
        1 + (curMinX > 0 ? 1 : 0) + (curMinX < width - 1 ? 1 : 0);
      let neighborXs = Array.create<u32>(neighborCount);
      let neighborCosts = Array.create<u32>(neighborCount);
      let neighborIdx = 0;
      if (curMinX > 0) {
        neighborXs[neighborIdx] = curMinX - 1;
        neighborCosts[neighborIdx] = getCost(curMinX - 1, y);
        neighborIdx++;
      }
      neighborXs[neighborIdx] = curMinX;
      neighborCosts[neighborIdx] = getCost(curMinX, y);
      neighborIdx++;

      if (curMinX < width - 1) {
        neighborXs[neighborIdx] = curMinX + 1;
        neighborCosts[neighborIdx] = getCost(curMinX + 1, y);
        neighborIdx++;
      }

      minCost = MAX_COST;
      for (let i = 0; i < neighborXs.length; i++) {
        let cost = neighborCosts[i];
        if (cost < minCost) {
          minCost = cost;
          curMinX = neighborXs[i];
        }
      }
    }

    trace('curMinX, y, cost', 3, curMinX, y, minCost);
    // if (y < height - 1) {
    //   assert(
    //     abs(max(seam[y + 1], curMinX) - min(seam[y + 1], curMinX)) <= 1,
    //     'curMinX should not change by more than 1'
    //   );
    // }
    seam[y] = curMinX;
  }
  return seam;
}
