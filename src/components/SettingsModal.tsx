import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { LANGUAGES } from '../../languages.js';
import { listVoices, ensureAllowedVoice, type Voice } from '../lib/voices';
import { getVoice, setVoice } from '../lib/preferences';
import { getLimits, type Limits } from '../lib/limits';
import { signOut } from '../lib/supabase';
import './SettingsModal.css';

type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  language: string;
  onLanguageChange: (code: string) => void;
};

export function SettingsModal({ open, onClose, language, onLanguageChange }: SettingsModalProps) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState(getVoice());
  const [status, setStatus] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setStatus('Loading voices…');
    setStatusIsError(false);

    listVoices()
      .then(list => {
        if (!active) return;
        setVoices(list);
        setSelectedVoice(ensureAllowedVoice(list));
        setStatus(`${list.length} voices.`);
      })
      .catch((err: Error) => {
        if (!active) return;
        setStatus(err.message);
        setStatusIsError(true);
      });

    getLimits()
      .then(data => { if (active) setLimits(data); })
      .catch(() => { if (active) setLimits(null); });

    return () => { active = false; };
  }, [open]);

  function handleVoiceChange(voiceId: string) {
    setSelectedVoice(voiceId);
    setVoice(voiceId);
  }

  return (
    <Modal open={open} onClose={onClose}>
      <h2>Settings</h2>

      <label className="field">
        <span className="field-label">Language</span>
        <select value={language} onChange={e => onLanguageChange(e.target.value)}>
          {Object.values(LANGUAGES).map(lang => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">Narrator voice</span>
        <select value={selectedVoice} onChange={e => handleVoiceChange(e.target.value)}>
          {voices.map(v => {
            const name = v.name.split(' - ')[0].trim();
            const traits = [v.labels.age, v.labels.gender, v.labels.accent].filter(Boolean).join(', ');
            return (
              <option key={v.voice_id} value={v.voice_id}>
                {traits ? `${name} (${traits})` : name}
              </option>
            );
          })}
        </select>
      </label>

      <p className={`note${statusIsError ? ' error' : ''}`}>{status}</p>

      {limits && (
        <div className="limits-list">
          <span className="field-label">Today's limits</span>
          {Object.values(limits).map(limit => (
            <div className="limit-row" key={limit.label}>
              <span className="limit-label">{limit.label}</span>
              <span className="limit-count">{limit.used} / {limit.max}</span>
              <div className="limit-bar">
                <div className="limit-bar-fill" style={{ width: `${Math.min(100, (limit.used / limit.max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sheet-actions">
        <button type="button" className="ghost-btn" onClick={() => signOut()}>Sign out</button>
        <button type="button" className="start-btn" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
