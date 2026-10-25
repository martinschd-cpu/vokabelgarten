// Sprachausgabe (speechSynthesis) und Spracherkennung (SpeechRecognition), wo verfügbar.

const synth = 'speechSynthesis' in self ? self.speechSynthesis : null;
const Recognition = self.SpeechRecognition || self.webkitSpeechRecognition || null;

let settings = { voiceURI: '', speechRate: 0.9 };
let voicesCache = [];

function loadVoices() {
  voicesCache = synth ? synth.getVoices() : [];
  return voicesCache;
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export const tts = {
  get supported() {
    return !!synth && typeof SpeechSynthesisUtterance !== 'undefined';
  },
  configure(s) {
    settings = { ...settings, ...s };
  },
  /** Englische Stimmen, britische zuerst. */
  englishVoices() {
    const list = (voicesCache.length ? voicesCache : loadVoices()).filter((v) => v.lang?.toLowerCase().startsWith('en'));
    return list.sort((a, b) => Number(b.lang === 'en-GB') - Number(a.lang === 'en-GB') || a.name.localeCompare(b.name));
  },
  pickVoice() {
    const voices = this.englishVoices();
    return voices.find((v) => v.voiceURI === settings.voiceURI) ?? voices.find((v) => v.lang === 'en-GB') ?? voices[0] ?? null;
  },
  speak(text, { rate, lang = 'en-GB' } = {}) {
    if (!this.supported || !text) return Promise.resolve(false);
    synth.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const voice = lang.startsWith('en') ? this.pickVoice() : null;
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? lang;
      u.rate = rate ?? settings.speechRate ?? 0.9;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      synth.speak(u);
      // Manche Browser melden das Ende nie; dann nicht ewig warten.
      setTimeout(() => resolve(true), 8000);
    });
  },
  cancel() {
    synth?.cancel();
  },
};

export const stt = {
  get supported() {
    return !!Recognition;
  },
  /** Hört einmal zu und liefert die erkannten Varianten (klein geschrieben). */
  listen({ lang = 'en-GB', timeoutMs = 7000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!Recognition) {
        reject(new Error('Spracherkennung wird von diesem Browser nicht unterstützt.'));
        return;
      }
      const rec = new Recognition();
      rec.lang = lang;
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      let done = false;
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          rec.abort();
        } catch {
          // schon beendet
        }
        fn(value);
      };
      const timer = setTimeout(() => finish(resolve, []), timeoutMs);
      rec.onresult = (e) => {
        const alts = [...e.results[0]].map((a) => a.transcript.toLowerCase().trim());
        finish(resolve, alts);
      };
      rec.onerror = (e) => {
        const msg =
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? 'Das Mikrofon ist nicht erlaubt. Eltern können es in den Browser-Einstellungen freigeben.'
            : e.error === 'network'
              ? 'Für die Spracherkennung braucht dieser Browser Internet.'
              : null;
        if (msg) finish(reject, new Error(msg));
        else finish(resolve, []);
      };
      rec.onend = () => finish(resolve, []);
      try {
        rec.start();
      } catch (err) {
        finish(reject, err);
      }
    });
  },
};
