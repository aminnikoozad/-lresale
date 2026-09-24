const CODE39: Record<string, string> = {
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000", F: "001011000",
  G: "000001101", H: "100001100", I: "001001100", J: "000011100", K: "100000011", L: "001000011",
  M: "101000010", N: "000010011", O: "100010010", P: "001010010", Q: "000000111", R: "100000110",
  S: "001000110", T: "000010110", U: "110000001", V: "011000001", W: "111000000", X: "010010001",
  Y: "110010000", Z: "011010000", "0": "000110100", "1": "100100001", "2": "001100001", "3": "101100000",
  "4": "000110001", "5": "100110000", "6": "001110000", "7": "000100101", "8": "100100100", "9": "001100100",
  "-": "010000101", "*": "010010100",
};

export function ItemBarcode({ value, height = 54 }: { value: string; height?: number }) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const encoded = `*${clean}*`;
  const narrow = 2;
  const wide = 5;
  const gap = 2;
  let x = 0;
  const bars: Array<{ x: number; width: number }> = [];

  for (const char of encoded) {
    const pattern = CODE39[char];
    if (!pattern) continue;
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "1" ? wide : narrow;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    }
    x += gap;
  }

  return (
    <figure className="item-barcode" aria-label={`Barcode ${clean}`}>
      <svg viewBox={`0 0 ${Math.max(x, 1)} ${height}`} role="img" aria-label={clean} preserveAspectRatio="none">
        {bars.map((bar, index) => <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height={height} fill="currentColor" />)}
      </svg>
      <figcaption>{clean}</figcaption>
    </figure>
  );
}
