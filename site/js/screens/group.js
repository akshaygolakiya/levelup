// Dispatches a day group (#/g/<date>/<key>) to the right screen.
import { clear, put } from '../util.js';
import { loadDay, findGroup } from '../data.js';
import { errorState, emptyState, loadingState } from '../ui.js';
import { readerScreen } from './reader.js';
import { cardsScreen } from './cards.js';
import { wordDayScreen } from './words.js';
import { grammarScreen } from './grammar.js';
import { speakScreen, writeScreen } from './speaking.js';

export async function groupScreen(root, { date, key }) {
  put(root, loadingState());
  let model;
  try { model = await loadDay(date); } catch (e) { return put(root, errorState(e, () => groupScreen(root, { date, key }))); }
  const g = findGroup(model, key);
  if (!g) return put(root, emptyState('Nothing here', 'That item is not part of this day.'));
  switch (g.kind) {
    case 'deep': case 'concept': case 'paper': return readerScreen(root, model, g);
    case 'quick': case 'ai': return cardsScreen(root, model, g);
    case 'word': return wordDayScreen(root, model, g);
    case 'grammar': return grammarScreen(root, model, g);
    case 'speak': return speakScreen(root, model, g);
    case 'write': return writeScreen(root, model, g);
    default: return put(root, emptyState('Unsupported item', g.kind));
  }
}
