export const LANGUAGES = {
  fa: {
    code: 'fa',
    name: 'Farsi',
    native: 'فارسی',
    dir: 'rtl',
    font: "'Vazirmatn', sans-serif",
    connectives: 'و، چون، بعد، تا این‌که',
    typingNote: 'Use the zero-width non-joiner correctly (می‌کرد, برگ‌ها).',
    diacriticsNote: "Include full vowel diacritics (اعراب): the short-vowel marks (فتحه، کسره، ضمه), sukun (ْ, as in دَرْد) on any consonant with no vowel, and shadda where a consonant doubles, the way an early-reader children's book does, so a child just learning to read can sound out every word.",
    cultureNote: 'Iran or Iranian',
    celebrationLines: ['آفَرینْ، آفَرینْ!', 'بَهْ بَهْ، عَالِی!', 'دُرُسْتْ کَرْدِی!', 'هُورَا هُورَا!', 'پِیدا کَرْدِی!', 'چِهْ قَشَنْگْ!'],
    tryAgainLines: ['یِه بَارِ دِیگِه!', 'بَازَمْ مِی‌شِه!', 'نَزْدیکْ بُودْ!', 'بِیا دُوبَارِه!', 'بَازْ پِیداشْ کُنْ!', 'بَازْ مِی‌تُونِیمْ!'],
  },
  sv: {
    code: 'sv',
    name: 'Swedish',
    native: 'Svenska',
    dir: 'ltr',
    font: "'Baloo 2', system-ui, sans-serif",
    connectives: 'och, för att, sedan, tills',
    typingNote: '',
    diacriticsNote: '',
    cultureNote: 'Sweden or Swedish',
    celebrationLines: ['Hurra, rätt bild!', 'Du klarade det!', 'Så duktig du är!', 'Helt rätt!', 'Bra jobbat, kompis!', 'Toppen jobbat!'],
    tryAgainLines: ['Nästan! Prova igen!', 'Inte den, kompis! Försök igen!', 'Hoppsan, vi testar igen!', 'Oj, inte den! Försök!', 'Inte riktigt, prova igen!', 'Vi letar vidare!'],
  },
};

export const DEFAULT_LANGUAGE = 'fa';

export function languageOf(code) {
  return LANGUAGES[code] || LANGUAGES[DEFAULT_LANGUAGE];
}
