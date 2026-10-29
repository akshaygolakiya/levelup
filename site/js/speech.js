// Text-to-speech helper (pronunciation + shadowing).
let voices = [];
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  voices = speechSynthesis.getVoices();
  return voices.find((v) => /^en[-_](US|GB)/i.test(v.lang) && /samantha|daniel|google|natural|premium/i.test(v.name))
    || voices.find((v) => /^en[-_]/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;

export const canSpeak = () => 'speechSynthesis' in window;
export function speak(text, rate = 0.95) {
  if (!canSpeak()) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
  u.rate = rate;
  speechSynthesis.speak(u);
  return true;
}
export const stopSpeaking = () => { if (canSpeak()) speechSynthesis.cancel(); };
