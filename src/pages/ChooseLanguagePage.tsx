import { LANGUAGES } from '../../languages.js';
import { setLanguage } from '../lib/preferences';
import './ChooseLanguagePage.css';

type ChooseLanguagePageProps = {
  onChoose: () => void;
};

export function ChooseLanguagePage({ onChoose }: ChooseLanguagePageProps) {
  function choose(code: string) {
    setLanguage(code);
    onChoose();
  }

  return (
    <main className="choose-language-stage">
      <div className="choose-language-hero">
        <h1 className="choose-language-title">Which language today?</h1>
        <p className="choose-language-subtitle">Pick one to get started</p>
      </div>

      <div className="choose-language-grid">
        {Object.values(LANGUAGES).map(lang => (
          <button
            type="button"
            key={lang.code}
            className="choose-language-card"
            dir={lang.dir}
            style={{ fontFamily: lang.font }}
            onClick={() => choose(lang.code)}
          >
            <span className="choose-language-native">{lang.native}</span>
            <span className="choose-language-name">{lang.name}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
