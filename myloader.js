// Runtime header offsets
const ID_OFFSET = -8;
const SIZE_OFFSET = -4;

// Runtime ids
const ARRAYBUFFER_ID = 0;
const STRING_ID = 1;
const ARRAYBUFFERVIEW_ID = 2;

// Runtime type information
const ARRAYBUFFERVIEW = 1 << 0;
const ARRAY = 1 << 1;
const SET = 1 << 2;
const MAP = 1 << 3;
const VAL_ALIGN = 1 << 5;
const VAL_SIGNED = 1 << 10;
const VAL_FLOAT = 1 << 11;
const VAL_NULLABLE = 1 << 12;
const VAL_MANAGED = 1 << 13;
const KEY_ALIGN = 1 << 14;
const KEY_SIGNED = 1 << 19;
const KEY_FLOAT = 1 << 20;
const KEY_NULLABLE = 1 << 21;
const KEY_MANAGED = 1 << 22;
// Array(BufferView) layout
const ARRAYBUFFERVIEW_BUFFER_OFFSET = 0;
const ARRAYBUFFERVIEW_DATASTART_OFFSET = 4;
const ARRAYBUFFERVIEW_DATALENGTH_OFFSET = 8;
const ARRAYBUFFERVIEW_SIZE = 12;
const ARRAY_LENGTH_OFFSET = 12;
const ARRAY_SIZE = 16;

function getView(align, signed, float) {
  if (float) {
    switch (align) {
      case 2:
        return Float32Array;
      case 3:
        return Float64Array;
    }
  } else {
    switch (align) {
      case 0:
        return signed ? Int8Array : Uint8Array;
      case 1:
        return signed ? Int16Array : Uint16Array;
      case 2:
        return signed ? Int32Array : Uint32Array;
      case 3: {
        throw new Error('cannot handle alignment of 3');
      }
    }
  }
  throw Error('unsupported align: ' + align);
}

function getInfo(id, mem, rttiBase) {
  let U32 = new Uint32Array(mem.buffer);
  const count = U32[rttiBase >>> 2];
  if ((id >>>= 0) >= count) throw Error('invalid id: ' + id);
  return U32[((rttiBase + 4) >>> 2) + id * 2];
}

function getAlign(which, info) {
  return 31 - Math.clz32((info / which) & 31); // -1 if none
}

function getArrayView(arr, mem, rttiBase) {
  let U32 = new Uint32Array(mem.buffer);
  const id = U32[(arr + ID_OFFSET) >>> 2];
  const info = getInfo(id, mem, rttiBase);
  if (!(info & ARRAYBUFFERVIEW)) throw Error('not an array: ' + id);
  const align = getAlign(VAL_ALIGN, info);
  var buf = U32[(arr + ARRAYBUFFERVIEW_DATASTART_OFFSET) >>> 2];
  const length =
    info & ARRAY
      ? U32[(arr + ARRAY_LENGTH_OFFSET) >>> 2]
      : U32[(buf + SIZE_OFFSET) >>> 2] >>> align;
  let viewCtor = getView(align, info & VAL_SIGNED, info & VAL_FLOAT);
  return new viewCtor(mem.buffer).slice((buf >>>= align), buf + length);
}
