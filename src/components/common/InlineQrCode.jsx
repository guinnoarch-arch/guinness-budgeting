import { useMemo } from "react";

const QR_ECC_L = {
  1: { totalCodewords: 26, dataCodewords: 19, eccCodewords: 7, blocks: 1 },
  2: { totalCodewords: 44, dataCodewords: 34, eccCodewords: 10, blocks: 1 },
  3: { totalCodewords: 70, dataCodewords: 55, eccCodewords: 15, blocks: 1 },
  4: { totalCodewords: 100, dataCodewords: 80, eccCodewords: 20, blocks: 1 },
  5: { totalCodewords: 134, dataCodewords: 108, eccCodewords: 26, blocks: 1 },
  6: { totalCodewords: 172, dataCodewords: 136, eccCodewords: 18, blocks: 2 },
  7: { totalCodewords: 196, dataCodewords: 156, eccCodewords: 20, blocks: 2 },
  8: { totalCodewords: 242, dataCodewords: 194, eccCodewords: 24, blocks: 2 },
  9: { totalCodewords: 292, dataCodewords: 232, eccCodewords: 30, blocks: 2 }
};

const ALIGNMENT_POSITIONS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46]
};

const GF_EXP = new Array(512);
const GF_LOG = new Array(256);
(function initGaloisTables() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function reedSolomonGenerator(degree) {
  const result = [1];
  for (let i = 0; i < degree; i += 1) {
    result.push(0);
    for (let j = 0; j < result.length - 1; j += 1) {
      result[j] = gfMultiply(result[j], GF_EXP[i]);
      result[j] ^= result[j + 1];
    }
  }
  return result.slice(0, degree);
}

function reedSolomonRemainder(data, degree) {
  const generator = reedSolomonGenerator(degree);
  const result = new Array(degree).fill(0);
  data.forEach(byte => {
    const factor = byte ^ result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= gfMultiply(generator[i], factor);
    }
  });
  return result;
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push(((value >>> i) & 1) !== 0);
  }
}

function encodeDataCodewords(text, version, dataCodewords) {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bits = [];
  appendBits(bits, 0b0100, 4); // Byte mode.
  appendBits(bits, bytes.length, version <= 9 ? 8 : 16);
  bytes.forEach(byte => appendBits(bits, byte, 8));

  const capacityBits = dataCodewords * 8;
  if (bits.length > capacityBits) {
    throw new Error("QR value is too long for the built-in QR generator.");
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(false);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    codewords.push(byte);
  }

  for (let pad = 0xec; codewords.length < dataCodewords; pad ^= 0xec ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

function interleaveBlocks(dataCodewords, versionInfo) {
  const { dataCodewords: totalData, eccCodewords, blocks } = versionInfo;
  const blockDataLength = totalData / blocks;
  if (!Number.isInteger(blockDataLength)) throw new Error("Unsupported QR block layout.");

  const dataBlocks = [];
  const eccBlocks = [];
  for (let i = 0; i < blocks; i += 1) {
    const start = i * blockDataLength;
    const block = dataCodewords.slice(start, start + blockDataLength);
    dataBlocks.push(block);
    eccBlocks.push(reedSolomonRemainder(block, eccCodewords));
  }

  const result = [];
  for (let i = 0; i < blockDataLength; i += 1) {
    dataBlocks.forEach(block => result.push(block[i]));
  }
  for (let i = 0; i < eccCodewords; i += 1) {
    eccBlocks.forEach(block => result.push(block[i]));
  }
  return result;
}

function createMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false));
}

function setFunctionModule(modules, isFunction, x, y, black) {
  const size = modules.length;
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  modules[y][x] = Boolean(black);
  isFunction[y][x] = true;
}

function drawFinderPattern(modules, isFunction, x, y) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const black = inPattern && (
        dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
        (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
      );
      setFunctionModule(modules, isFunction, xx, yy, black);
    }
  }
}

function drawAlignmentPattern(modules, isFunction, cx, cy) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, isFunction, cx + dx, cy + dy, distance === 0 || distance === 2);
    }
  }
}

function drawFunctionPatterns(modules, isFunction, version) {
  const size = modules.length;
  drawFinderPattern(modules, isFunction, 0, 0);
  drawFinderPattern(modules, isFunction, size - 7, 0);
  drawFinderPattern(modules, isFunction, 0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    setFunctionModule(modules, isFunction, i, 6, i % 2 === 0);
    setFunctionModule(modules, isFunction, 6, i, i % 2 === 0);
  }

  const alignments = ALIGNMENT_POSITIONS[version] || [];
  alignments.forEach(cx => {
    alignments.forEach(cy => {
      const overlapsFinder = (cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
      if (!overlapsFinder) drawAlignmentPattern(modules, isFunction, cx, cy);
    });
  });

  // Reserve and clear format information areas.
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      setFunctionModule(modules, isFunction, 8, i, false);
      setFunctionModule(modules, isFunction, i, 8, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setFunctionModule(modules, isFunction, size - 1 - i, 8, false);
    setFunctionModule(modules, isFunction, 8, size - 1 - i, false);
  }

  setFunctionModule(modules, isFunction, 8, size - 8, true); // Dark module.
}

function getFormatBits(mask) {
  const data = (1 << 3) | mask; // Error correction level L = 01.
  let value = data << 10;
  const generator = 0x537;
  for (let i = 14; i >= 10; i -= 1) {
    if (((value >>> i) & 1) !== 0) value ^= generator << (i - 10);
  }
  return ((data << 10) | value) ^ 0x5412;
}

function drawFormatBits(modules, isFunction, mask) {
  const size = modules.length;
  const bits = getFormatBits(mask);
  for (let i = 0; i <= 5; i += 1) setFunctionModule(modules, isFunction, 8, i, ((bits >>> i) & 1) !== 0);
  setFunctionModule(modules, isFunction, 8, 7, ((bits >>> 6) & 1) !== 0);
  setFunctionModule(modules, isFunction, 8, 8, ((bits >>> 7) & 1) !== 0);
  setFunctionModule(modules, isFunction, 7, 8, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i += 1) setFunctionModule(modules, isFunction, 14 - i, 8, ((bits >>> i) & 1) !== 0);

  for (let i = 0; i < 8; i += 1) setFunctionModule(modules, isFunction, size - 1 - i, 8, ((bits >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i += 1) setFunctionModule(modules, isFunction, 8, size - 15 + i, ((bits >>> i) & 1) !== 0);
  setFunctionModule(modules, isFunction, 8, size - 8, true);
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
}

function placeDataBits(baseModules, baseFunction, dataBits, mask) {
  const size = baseModules.length;
  const modules = baseModules.map(row => [...row]);
  const isFunction = baseFunction.map(row => [...row]);
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let vert = 0; vert < size; vert += 1) {
      const y = upward ? size - 1 - vert : vert;
      for (let dx = 0; dx < 2; dx += 1) {
        const x = right - dx;
        if (isFunction[y][x]) continue;
        const rawBit = bitIndex < dataBits.length ? dataBits[bitIndex] : false;
        modules[y][x] = rawBit !== maskBit(mask, x, y);
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  drawFormatBits(modules, isFunction, mask);
  return modules;
}

function scorePenalty(modules) {
  const size = modules.length;
  let score = 0;

  // Adjacent runs in rows and columns.
  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y][0];
    let runLength = 1;
    for (let x = 1; x < size; x += 1) {
      if (modules[y][x] === runColor) runLength += 1;
      else {
        if (runLength >= 5) score += 3 + (runLength - 5);
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + (runLength - 5);
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0][x];
    let runLength = 1;
    for (let y = 1; y < size; y += 1) {
      if (modules[y][x] === runColor) runLength += 1;
      else {
        if (runLength >= 5) score += 3 + (runLength - 5);
        runColor = modules[y][x];
        runLength = 1;
      }
    }
    if (runLength >= 5) score += 3 + (runLength - 5);
  }

  // 2x2 blocks.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
    }
  }

  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const reversePattern = [...pattern].reverse();
  function matchesPattern(line, start, target) {
    for (let i = 0; i < target.length; i += 1) if (line[start + i] !== target[i]) return false;
    return true;
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x <= size - 11; x += 1) {
      if (matchesPattern(modules[y], x, pattern) || matchesPattern(modules[y], x, reversePattern)) score += 40;
    }
  }
  for (let x = 0; x < size; x += 1) {
    const col = modules.map(row => row[x]);
    for (let y = 0; y <= size - 11; y += 1) {
      if (matchesPattern(col, y, pattern) || matchesPattern(col, y, reversePattern)) score += 40;
    }
  }

  let black = 0;
  modules.forEach(row => row.forEach(value => { if (value) black += 1; }));
  const percent = black * 100 / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

function makeQrMatrix(value) {
  const bytes = Array.from(new TextEncoder().encode(value));
  const version = Number(Object.keys(QR_ECC_L).find(v => {
    const info = QR_ECC_L[v];
    return 4 + 8 + bytes.length * 8 <= info.dataCodewords * 8;
  }));
  if (!version) throw new Error("The app link is too long to encode as a built-in QR code.");

  const info = QR_ECC_L[version];
  const dataCodewords = encodeDataCodewords(value, version, info.dataCodewords);
  const codewords = interleaveBlocks(dataCodewords, info);
  const dataBits = [];
  codewords.forEach(byte => appendBits(dataBits, byte, 8));

  const size = 17 + version * 4;
  const baseModules = createMatrix(size);
  const baseFunction = createMatrix(size);
  drawFunctionPatterns(baseModules, baseFunction, version);

  let bestModules = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = placeDataBits(baseModules, baseFunction, dataBits, mask);
    const score = scorePenalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestModules = candidate;
    }
  }
  return bestModules;
}

function matrixToPath(matrix, margin) {
  const parts = [];
  matrix.forEach((row, y) => {
    row.forEach((black, x) => {
      if (black) parts.push(`M${x + margin},${y + margin}h1v1h-1z`);
    });
  });
  return parts.join("");
}

export default function InlineQrCode({ value, size = 220, className = "" }) {
  const qr = useMemo(() => {
    if (!value) return { error: "No app link available." };
    try {
      const matrix = makeQrMatrix(value);
      return { matrix, viewBoxSize: matrix.length + 8, path: matrixToPath(matrix, 4) };
    } catch (error) {
      return { error: error.message || "QR code could not be generated." };
    }
  }, [value]);

  if (qr.error) {
    return <div className={`inline-qr-error ${className}`.trim()}>{qr.error}</div>;
  }

  return (
    <svg
      className={`inline-qr-code ${className}`.trim()}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.viewBoxSize} ${qr.viewBoxSize}`}
      role="img"
      aria-label="QR code to open this app on another device"
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={qr.path} fill="#000000" />
    </svg>
  );
}
