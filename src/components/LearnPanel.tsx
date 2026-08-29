import { useEffect, useState } from 'react';
import { useAppShell } from '../context/AppShellContext';
import { useVocabulary } from '../lib/useVocabulary';
import { isBuiltinCategory } from '../lib/builtinWords';
import { narrator } from '../lib/narrator';
import { useToast } from '../context/ToastContext';
import { languageOf } from '../../languages.js';
import { getVoice } from '../lib/preferences';
import { prefetch } from '../lib/speech';
import { deleteCard, type Collection } from '../lib/vocabulary';
import { DeckTabs } from './DeckTabs';
import { Flashcard } from './Flashcard';
import { ConfirmDialog } from './ConfirmDialog';
import { NewCollectionModal } from './NewCollectionModal';
import { AddWordModal } from './AddWordModal';
import './LearnPanel.css';

type ConfirmState =
  | { open: false }
  | { open: true; title: string; message: string; onConfirm: () => void };

export function LearnPanel() {
  const { language } = useAppShell();
  const { categories, collections, addCollection, removeCollection, reload } = useVocabulary(language);
  const { showToast } = useToast();

  const [currentCategory, setCurrentCategory] = useState('animals');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false });
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [addWordOpen, setAddWordOpen] = useState(false);

  useEffect(() => {
    setCurrentCategory('animals');
    setCurrentIndex(0);
  }, [language]);

  const lang = languageOf(language);
  const items = categories[currentCategory] || [];
  const isCustomDeck = !isBuiltinCategory(currentCategory);

  function selectCategory(cat: string) {
    setCurrentCategory(cat);
    setCurrentIndex(0);
    sayWordIn(cat, 0);
  }

  function navigate(direction: 1 | -1) {
    if (items.length === 0) return;
    const nextIndex = (currentIndex + direction + items.length) % items.length;
    setCurrentIndex(nextIndex);
    sayWordIn(currentCategory, nextIndex);
  }

  function sayWordIn(cat: string, index: number) {
    const deck = categories[cat] || [];
    if (deck.length === 0) return;
    const word = deck[index].word;
    narrator.speakText(word, () => showToast('Pick a narrator voice in Settings first.'));

    const voiceId = getVoice();
    if (voiceId && deck.length > 1) {
      prefetch(deck[(index + 1) % deck.length].word, voiceId);
      prefetch(deck[(index - 1 + deck.length) % deck.length].word, voiceId);
    }
  }

  function sayWord() {
    sayWordIn(currentCategory, currentIndex);
  }

  function requestDeleteCollection(collection: Collection) {
    setConfirmState({
      open: true,
      title: 'Delete this collection?',
      message: `"${collection.name}" and every word in it will be gone for good.`,
      onConfirm: async () => {
        setConfirmState({ open: false });
        await removeCollection(collection._key);
        if (currentCategory === collection._key) {
          setCurrentCategory('animals');
          setCurrentIndex(0);
        }
      },
    });
  }

  function requestDeleteCard() {
    if (isBuiltinCategory(currentCategory)) return;
    const item = items[currentIndex];
    if (!item?.key) return;
    setConfirmState({
      open: true,
      title: 'Delete this word?',
      message: `"${item.word}" will be gone for good.`,
      onConfirm: async () => {
        setConfirmState({ open: false });
        await deleteCard(item.key!);
        const fresh = await reload();
        const newLength = fresh[currentCategory]?.length || 0;
        setCurrentIndex(i => Math.min(i, Math.max(0, newLength - 1)));
      },
    });
  }

  function openAddWord() {
    if (isBuiltinCategory(currentCategory)) return;
    setAddWordOpen(true);
  }

  async function handleCreateCollection(name: string) {
    const coll = await addCollection(name);
    setNewCollectionOpen(false);
    setCurrentCategory(coll._key);
    setCurrentIndex(0);
  }

  async function handleWordSaved() {
    setAddWordOpen(false);
    const fresh = await reload();
    const lastIndex = Math.max(0, (fresh[currentCategory]?.length || 1) - 1);
    setCurrentIndex(lastIndex);
    sayWordIn(currentCategory, lastIndex);
  }

  const currentCollection = collections.find(c => c._key === currentCategory);

  return (
    <section className="panel panel-learn">
      <div className="learn-head">
        <h1>Learn {lang.name}</h1>
        <p>Tap a card to hear the word in {lang.name}.</p>
      </div>

      <DeckTabs
        currentCategory={currentCategory}
        collections={collections}
        onSelect={selectCategory}
        onDeleteCollection={requestDeleteCollection}
        onAddCollection={() => setNewCollectionOpen(true)}
      />

      <Flashcard
        items={items}
        currentIndex={currentIndex}
        isCustomDeck={isCustomDeck}
        onNavigate={navigate}
        onSay={sayWord}
        onDelete={requestDeleteCard}
        onAddWord={openAddWord}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.open ? confirmState.title : ''}
        message={confirmState.open ? confirmState.message : ''}
        onCancel={() => setConfirmState({ open: false })}
        onConfirm={() => confirmState.open && confirmState.onConfirm()}
      />

      <NewCollectionModal
        open={newCollectionOpen}
        onClose={() => setNewCollectionOpen(false)}
        onCreate={handleCreateCollection}
      />

      <AddWordModal
        open={addWordOpen}
        collectionId={isCustomDeck ? currentCategory : null}
        collectionName={currentCollection?.name || 'this collection'}
        onClose={() => setAddWordOpen(false)}
        onSaved={handleWordSaved}
      />
    </section>
  );
}

