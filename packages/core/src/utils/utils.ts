export function normalize(n: number) {
  if (n < 0) {
    return 0;
  }
  if (n > 1) {
    return 1;
  }
  return n;
}

export function computeFromRange(from: number, to: number, fraction: number) {
  return from + (to - from) * fraction;
}

export function computeValuesFromRange(from: number[], to: number[], fraction: number) {
  const valueArr: number[] = [];
  for (let i = 0; i < from.length; i++) {
    valueArr[i] = computeFromRange(from[i], to[i], fraction);
  }
  return valueArr;
}
