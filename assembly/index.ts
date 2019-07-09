// The entry file of your WebAssembly module.

export function writeImageData(size: u32, color: u32): void {
  for (let i: u32 = 0; i < size; i++) {
    store<u32>(i << 2, color);
  }
}

export function invert(size: u32): void {
  for (let i: u32 = 0; i < size; i++) {
    let val = load<u32>(i << 2);
    let inverted = 0xffffffff - val;
    inverted = 0xff000000 | inverted; // ensure 0xff full alpha
    store<u32>(i << 2, inverted);
  }
}
