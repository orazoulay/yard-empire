// Money formatting: full digits while small, then K, M, B, T (trillion), Qa (quadrillion), Qi (quintillion).
const UNITS = [[1e18, 'Qi'], [1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

export function fmt(n) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString('en-US');
  for (const [v, s] of UNITS) {
    if (n >= v) {
      const x = n / v;
      const str = x >= 100 ? Math.floor(x).toString() : (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
      return str + s;
    }
  }
  return String(n);
}

/** An amount of money with its sign in front: $1.2K, −$340. `plus` puts a + before a gain, for figures that are changes. */
export function money(n, { plus = false } = {}) {
  n = Math.round(n);
  if (n < 0) return '−$' + fmt(-n);
  return (plus && n > 0 ? '+$' : '$') + fmt(n);
}
