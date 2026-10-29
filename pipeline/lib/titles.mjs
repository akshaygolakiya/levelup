// Same-story detection for titles: normalised equality or high word overlap.
export const normTitle = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'how', 'why', 'what', 'is', 'with', 'at', 'by']);
const words = t => new Set(normTitle(t).split(' ').filter(w => w && !STOP.has(w)));

export function similarTitle(a, b) {
  const na = normTitle(a), nb = normTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const wa = words(a), wb = words(b);
  if (wa.size < 4 || wb.size < 4) return false;
  let both = 0;
  for (const w of wa) if (wb.has(w)) both++;
  return both / (wa.size + wb.size - both) >= 0.75;
}
