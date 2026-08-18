export const LANGUAGES = {
  fa: {
    code: 'fa',
    name: 'Farsi',
    native: 'فارسی',
    dir: 'rtl',
    font: "'Vazirmatn', sans-serif",
    connectives: 'و، چون، بعد، تا این‌که',
    typingNote: 'Use the zero-width non-joiner correctly (می‌کرد, برگ‌ها).',
    cultureNote: 'Iran or Iranian',
  },
  sv: {
    code: 'sv',
    name: 'Swedish',
    native: 'Svenska',
    dir: 'ltr',
    font: "'Baloo 2', system-ui, sans-serif",
    connectives: 'och, för att, sedan, tills',
    typingNote: '',
    cultureNote: 'Sweden or Swedish',
  },
};

export const DEFAULT_LANGUAGE = 'fa';

export function languageOf(code) {
  return LANGUAGES[code] || LANGUAGES[DEFAULT_LANGUAGE];
}
