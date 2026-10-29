// Word difficulty ramps up with the number of days already served (state.runs).
// Anchors by day number (state.runs); fractions are interpolated linearly between them.
const RAMP = [
  [0, 0.70, 0.30, 0.00], [6, 0.70, 0.30, 0.00],   // week 1: everyday and workplace words
  [7, 0.30, 0.70, 0.00], [27, 0.15, 0.85, 0.00],  // weeks 2-4: mostly intermediate
  [28, 0.15, 0.80, 0.05], [60, 0.10, 0.50, 0.40], // from week 5 advanced creeps in, ~40% by day 60
];
export function wordMix(runs, total) {
  let f = RAMP[RAMP.length - 1].slice(1);
  for (let i = 1; i < RAMP.length; i++) {
    if (runs <= RAMP[i][0]) {
      const [d0, ...a] = RAMP[i - 1], [d1, ...b] = RAMP[i];
      const t = d1 === d0 ? 1 : (runs - d0) / (d1 - d0);
      f = a.map((x, k) => x + (b[k] - x) * t);
      break;
    }
  }
  const raw = f.map(x => x * total), counts = raw.map(Math.floor);
  const order = raw.map((x, i) => [x - counts[i], i]).sort((p, q) => q[0] - p[0]);
  for (let k = 0; counts.reduce((s, c) => s + c, 0) < total; k++) counts[order[k][1]]++;
  return { basic: counts[0], intermediate: counts[1], advanced: counts[2] };
}
