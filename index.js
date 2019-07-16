'use strict';

const IMAGE_URL = 'pic.png';

function setupCanvas(width, height) {
  let cnv = document.getElementById('canvas');
  let ctx = cnv.getContext('2d');
  cnv.width = width;
  cnv.height = height;
  ctx.imageSmoothingEnabled = false;
}

function getMemory() {
  if (!_module) {
    throw new Error('Cannot get memory, no module');
  }
  return _module.instance.exports.memory;
}
let _module = null;
function setModule(m) {
  _module = m;
}

async function loadModule(memory) {
  // Fetch and instantiate the module
  return await fetch('build/untouched.wasm')
    .then(response => response.arrayBuffer())
    .then(buffer =>
      WebAssembly.instantiate(buffer, {
        env: {
          memory,
          abort: (msg, file, line, col) => {
            console.log(
              'ABORT',
              getString(msg),
              ` at ${getString(file)}:${line}:${col}`
            );
          },
          trace: function(msg, n, ...args) {
            console.log(
              'trace: ' + getString(msg) + ' ' + args.slice(0, n).join(' ')
            );
          }
        },
        config: {},
        Math
      })
    )
    .then(m => {
      setModule(m);
      return m;
    })
    .catch(err => {
      alert('Failed to load WASM: ' + err.message + ' (ad blocker, maybe?)');
      console.log(err.stack);
    });
}

function getStringImpl(U32, U16, ref) {
  const SIZE_OFFSET = -4;
  const CHUNKSIZE = 1024;
  var length = U32[(ref + SIZE_OFFSET) >>> 2] >>> 1;
  var offset = ref >>> 1;
  if (length <= CHUNKSIZE)
    return String.fromCharCode.apply(
      String,
      U16.subarray(offset, offset + length)
    );
  const parts = [];
  do {
    const last = U16[offset + CHUNKSIZE - 1];
    const size = last >= 0xd800 && last < 0xdc00 ? CHUNKSIZE - 1 : CHUNKSIZE;
    parts.push(
      String.fromCharCode.apply(String, U16.subarray(offset, (offset += size)))
    );
    length -= size;
  } while (length > CHUNKSIZE);
  return (
    parts.join('') +
    String.fromCharCode.apply(String, U16.subarray(offset, offset + length))
  );
}

// See:https://github.com/AssemblyScript/assemblyscript/blob/678593d7bd8ee9573eadbd43e3635e0bc0b8e15e/lib/loader/index.js#L41-L53
function getString(ptr) {
  if (!ptr) return 'null';

  let mem = getMemory();
  let u16 = new Uint16Array(mem.buffer);
  let u32 = new Uint32Array(mem.buffer);
  return getStringImpl(u32, u16, ptr);
}

(async function run() {
  await testFindSeamWithWasm(IMAGE_URL);
  // await testEnergizingImageWithWasm(IMAGE_URL); // loads image on left, draws energy values on right
  // await testInvertingImageWithWasm(IMAGE_URL); // loads the image on left, then inverts it on right
  // await testDrawingPixelDataToCanvasWasm(0xff0000ff, 100, 100); // draws a red square
  // await testImageDataLocally(0xffff0000, 100, 100); // draws a blue square
})();

async function testFindSeamWithWasm(imageUrl) {
  let loadedImageData = await loadImage(IMAGE_URL);
  let { width, height } = loadedImageData;
  let imageBytes = width * height * 4;
  let module = await loadModule(createWasmMemory(4 * imageBytes));
  let pixelsOffset = module.instance.exports.init(width, height);
  putImageDataIntoMemory(loadedImageData.data, getMemory(), pixelsOffset);
  let results = module.instance.exports.findSeam();
  debugger;
}

async function testEnergizingImageWithWasm(imageUrl) {
  let loadedImageData = await loadImage(IMAGE_URL);
  let { width, height } = loadedImageData;
  let doubleMemory = true;
  let memory = createWasmMemory(width * height * 4, doubleMemory);
  let module = await loadModule(memory);
  putImageDataIntoMemory(loadedImageData.data, memory);
  module.instance.exports.energize(width, height);
  let size = width * height;
  let mem = new Uint32Array(memory.buffer);
  mem.copyWithin(0, size, size + size);
  let imageData = getImageDataFromWasmMemory(
    module.instance.exports.memory,
    width,
    height
  );
  drawImageDataIntoCanvas(imageData, width, height);
}

// 1. Loads the image from the given URL,
// 2. gets the pixel data from the image
// 3. load the pixel data into the WebAssembly.Memory
// 4. call the wasm `invert` method which inverts the data in the memory
// 5. draw the memory into a canvas
async function testInvertingImageWithWasm(imageUrl) {
  let loadedImageData = await loadImage(IMAGE_URL);
  let { width, height } = loadedImageData;
  let memory = createWasmMemory(width * height * 4);
  let module = await loadModule(memory);
  putImageDataIntoMemory(loadedImageData.data, memory);
  module.instance.exports.invert(width * height);
  let imageData = getImageDataFromWasmMemory(
    module.instance.exports.memory,
    width,
    height
  );
  drawImageDataIntoCanvas(imageData, width, height);
}

function drawImageDataIntoCanvas(imageData, width, height) {
  let canvas = document.getElementById('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx = canvas.getContext('2d');
  ctx.putImageData(imageData, 0, 0);
}

function getImageDataFromWasmMemory(memory, width, height) {
  return new ImageData(
    new Uint8ClampedArray(memory.buffer, 0, width * height * 4),
    width,
    height
  );
}

function createWasmMemory(bytes, double = false) {
  // TODO: For some reason, just doubling by multiplying by 2 is resulting in memory
  // access out of bounds issues. But multiplying by 3 gives enough room... :/
  let mem = new WebAssembly.Memory({
    initial: (double ? 3 : 1) * Math.ceil(bytes / (1 << 16))
  });
  return mem;
}

// pixelColor should be little-endian 32-bit integer, ABGR
async function testDrawingPixelDataToCanvasWasm(
  pixelColor = 0xff00cccc,
  width = 100,
  height = 100
) {
  let module = await loadModule(createWasmMemory(width * height * 4));
  module.instance.exports.writeImageData(width * height, pixelColor);
  drawImageDataIntoCanvas(
    getImageDataFromWasmMemory(module.instance.exports.memory, width, height),
    width,
    height
  );
}

function testImageDataLocally(
  pixelColor = 0xff00ff00,
  width = 100,
  height = 100
) {
  drawImageDataIntoCanvas(
    generateImageData(pixelColor, width, height),
    width,
    height
  );
}

function generateImageData(pixelColor, width, height) {
  let imageData = new ImageData(width, height);
  let dataUint32 = new Uint32Array(imageData.data.buffer);

  for (let i = 0; i < dataUint32.length; i++) {
    dataUint32[i] = pixelColor;
  }

  return imageData;
}

function viewMemory(memory) {
  let view = new Uint32Array(memory.buffer);
  for (let i = 0; i < 10; i++) {
    console.log(`memory@${i}: ${view[i]}`);
  }
}

function putImageDataIntoMemory(imageData, memory, offset = 0) {
  let mem = new Uint8Array(memory.buffer, offset);
  mem.set(imageData.data);
}

function drawImageFromMemory(width, height, memory) {
  let size = width * height;
  let mem = new Uint32Array(memory.buffer);
  let ctx = document.getElementById('canvas').getContext('2d');
  let imageData = ctx.createImageData(width, height);
  let argb = new Uint32Array(imageData.data.buffer);
  argb.set(mem.subarray(0, size));
  ctx.putImageData(imageData, 0, 0);
}

async function loadImage(url) {
  let image = document.createElement('img');
  image.setAttribute('src', url);
  image.style = 'display: none';
  let result = new Promise((resolve, reject) => {
    image.onload = e => {
      resolve(image);
    };
    image.onerror = e => reject(e);
  })
    .then(image => {
      let { width, height } = image;
      let loaderCanvas = document.getElementById('image-loader');
      let ctx = loaderCanvas.getContext('2d');
      loaderCanvas.width = width;
      loaderCanvas.height = height;
      ctx.drawImage(image, 0, 0, width, height);
      return {
        width,
        height,
        data: ctx.getImageData(0, 0, width, height)
      };
    })
    .finally(() => {
      document.body.removeChild(image);
    });
  document.body.appendChild(image);
  return result;
}
