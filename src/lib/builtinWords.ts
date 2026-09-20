export type DeckItem = {
  img: string;
  word: string;
  key?: string;
};

export const BUILTIN_CATEGORIES = ['animals', 'face', 'colors', 'numbers'] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export function isBuiltinCategory(cat: string): cat is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(cat);
}

export const BUILTIN_CATEGORY_LABELS: Record<BuiltinCategory, string> = {
  animals: 'Animals',
  face: 'Face & body',
  colors: 'Colors',
  numbers: 'Numbers',
};

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
    colors: [
      { img: 'pictures/colors/red.svg', word: 'قرمز' },
      { img: 'pictures/colors/orange.svg', word: 'نارنجی' },
      { img: 'pictures/colors/yellow.svg', word: 'زرد' },
      { img: 'pictures/colors/green.svg', word: 'سبز' },
      { img: 'pictures/colors/blue.svg', word: 'آبی' },
      { img: 'pictures/colors/purple.svg', word: 'بنفش' },
      { img: 'pictures/colors/pink.svg', word: 'صورتی' },
      { img: 'pictures/colors/brown.svg', word: 'قهوه‌ای' },
    ],
    numbers: [
      { img: 'pictures/numbers/1.svg', word: 'یک' },
      { img: 'pictures/numbers/2.svg', word: 'دو' },
      { img: 'pictures/numbers/3.svg', word: 'سه' },
      { img: 'pictures/numbers/4.svg', word: 'چهار' },
      { img: 'pictures/numbers/5.svg', word: 'پنج' },
      { img: 'pictures/numbers/6.svg', word: 'شش' },
      { img: 'pictures/numbers/7.svg', word: 'هفت' },
      { img: 'pictures/numbers/8.svg', word: 'هشت' },
      { img: 'pictures/numbers/9.svg', word: 'نه' },
      { img: 'pictures/numbers/10.svg', word: 'ده' },
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
    colors: [
      { img: 'pictures/colors/red.svg', word: 'röd' },
      { img: 'pictures/colors/orange.svg', word: 'orange' },
      { img: 'pictures/colors/yellow.svg', word: 'gul' },
      { img: 'pictures/colors/green.svg', word: 'grön' },
      { img: 'pictures/colors/blue.svg', word: 'blå' },
      { img: 'pictures/colors/purple.svg', word: 'lila' },
      { img: 'pictures/colors/pink.svg', word: 'rosa' },
      { img: 'pictures/colors/brown.svg', word: 'brun' },
    ],
    numbers: [
      { img: 'pictures/numbers/1.svg', word: 'ett' },
      { img: 'pictures/numbers/2.svg', word: 'två' },
      { img: 'pictures/numbers/3.svg', word: 'tre' },
      { img: 'pictures/numbers/4.svg', word: 'fyra' },
      { img: 'pictures/numbers/5.svg', word: 'fem' },
      { img: 'pictures/numbers/6.svg', word: 'sex' },
      { img: 'pictures/numbers/7.svg', word: 'sju' },
      { img: 'pictures/numbers/8.svg', word: 'åtta' },
      { img: 'pictures/numbers/9.svg', word: 'nio' },
      { img: 'pictures/numbers/10.svg', word: 'tio' },
    ],
  },
};

export function builtinWordsFor(language: string): Record<BuiltinCategory, DeckItem[]> {
  return BUILTIN_WORDS[language] || BUILTIN_WORDS.fa;
}
