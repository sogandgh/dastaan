export type DeckItem = {
  img: string;
  word: string;
  key?: string;
};

export const BUILTIN_CATEGORIES = ['animals', 'face'] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export function isBuiltinCategory(cat: string): cat is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(cat);
}

const BUILTIN_WORDS: Record<string, Record<BuiltinCategory, DeckItem[]>> = {
  fa: {
    animals: [
      { img: 'pictures/animals/bird.png', word: 'پرنده' },
      { img: 'pictures/animals/cat.png', word: 'گربه' },
      { img: 'pictures/animals/cow.png', word: 'گاو' },
      { img: 'pictures/animals/dog.png', word: 'سگ' },
      { img: 'pictures/animals/fish.png', word: 'ماهی' },
      { img: 'pictures/animals/hourse.webp', word: 'اسب' },
      { img: 'pictures/animals/mouse.png', word: 'موش' },
      { img: 'pictures/animals/pig.png', word: 'خوک' },
      { img: 'pictures/animals/rabbit.png', word: 'خرگوش' },
    ],
    face: [
      { img: 'pictures/face/ear.png', word: 'گوش' },
      { img: 'pictures/face/eye.png', word: 'چشم' },
      { img: 'pictures/face/eyebrow.jpg', word: 'ابرو' },
      { img: 'pictures/face/hair.png', word: 'مو' },
      { img: 'pictures/face/hand.png', word: 'دست' },
      { img: 'pictures/face/leg.jpg', word: 'پا' },
      { img: 'pictures/face/lips.png', word: 'لب' },
      { img: 'pictures/face/neck.jpg', word: 'گردن' },
      { img: 'pictures/face/nose.jpg', word: 'بینی' },
      { img: 'pictures/face/tongue.jpg', word: 'زبان' },
      { img: 'pictures/face/tooth.png', word: 'دندان' },
    ],
  },
  sv: {
    animals: [
      { img: 'pictures/animals/bird.png', word: 'fågel' },
      { img: 'pictures/animals/cat.png', word: 'katt' },
      { img: 'pictures/animals/cow.png', word: 'ko' },
      { img: 'pictures/animals/dog.png', word: 'hund' },
      { img: 'pictures/animals/fish.png', word: 'fisk' },
      { img: 'pictures/animals/hourse.webp', word: 'häst' },
      { img: 'pictures/animals/mouse.png', word: 'mus' },
      { img: 'pictures/animals/pig.png', word: 'gris' },
      { img: 'pictures/animals/rabbit.png', word: 'kanin' },
    ],
    face: [
      { img: 'pictures/face/ear.png', word: 'öra' },
      { img: 'pictures/face/eye.png', word: 'öga' },
      { img: 'pictures/face/eyebrow.jpg', word: 'ögonbryn' },
      { img: 'pictures/face/hair.png', word: 'hår' },
      { img: 'pictures/face/hand.png', word: 'hand' },
      { img: 'pictures/face/leg.jpg', word: 'ben' },
      { img: 'pictures/face/lips.png', word: 'läppar' },
      { img: 'pictures/face/neck.jpg', word: 'hals' },
      { img: 'pictures/face/nose.jpg', word: 'näsa' },
      { img: 'pictures/face/tongue.jpg', word: 'tunga' },
      { img: 'pictures/face/tooth.png', word: 'tand' },
    ],
  },
};

export function builtinWordsFor(language: string): Record<BuiltinCategory, DeckItem[]> {
  return BUILTIN_WORDS[language] || BUILTIN_WORDS.fa;
}
