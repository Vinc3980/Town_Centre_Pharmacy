export function toCents(n: number): number {
  return Math.round(n * 100);
}

export function fromCents(c: number): number {
  return c / 100;
}

export function addMoney(...values: number[]): number {
  return fromCents(values.reduce((sum, v) => sum + toCents(v), 0));
}

export function subtractMoney(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

export function multiplyMoney(rate: number, quantity: number): number {
  return fromCents(toCents(rate) * quantity);
}

export function roundMoney(n: number): number {
  return fromCents(toCents(n));
}
