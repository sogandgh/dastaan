export type LanguageCode = 'fa' | 'sv';

export type Language = {
  code: LanguageCode;
  name: string;
  native: string;
  dir: 'ltr' | 'rtl';
  font: string;
  connectives: string;
  typingNote: string;
  cultureNote: string;
  celebrationLine: string;
  tryAgainLine: string;
};

export const LANGUAGES: Record<LanguageCode, Language>;
export const DEFAULT_LANGUAGE: LanguageCode;
export function languageOf(code: string): Language;
