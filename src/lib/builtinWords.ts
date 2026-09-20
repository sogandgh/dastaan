export type DeckItem = {
  img: string;
  word: string;
  key?: string;
};

export const BUILTIN_CATEGORIES = ['animals', 'face', 'colors', 'numbers', 'shapes', 'food', 'family', 'vehicles'] as const;
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number];

export function isBuiltinCategory(cat: string): cat is BuiltinCategory {
  return (BUILTIN_CATEGORIES as readonly string[]).includes(cat);
}

export const BUILTIN_CATEGORY_LABELS: Record<BuiltinCategory, string> = {
  animals: 'Animals',
  face: 'Face & body',
  colors: 'Colors',
  numbers: 'Numbers',
  shapes: 'Shapes',
  food: 'Food',
  family: 'Family',
  vehicles: 'Vehicles',
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
    shapes: [
      { img: 'pictures/shapes/circle.svg', word: 'دایره' },
      { img: 'pictures/shapes/square.svg', word: 'مربع' },
      { img: 'pictures/shapes/triangle.svg', word: 'مثلث' },
      { img: 'pictures/shapes/rectangle.svg', word: 'مستطیل' },
      { img: 'pictures/shapes/star.svg', word: 'ستاره' },
      { img: 'pictures/shapes/heart.svg', word: 'قلب' },
      { img: 'pictures/shapes/diamond.svg', word: 'لوزی' },
      { img: 'pictures/shapes/oval.svg', word: 'بیضی' },
    ],
    food: [
      { img: 'pictures/food/apple.png', word: 'سیب' },
      { img: 'pictures/food/banana.png', word: 'موز' },
      { img: 'pictures/food/bread.png', word: 'نان' },
      { img: 'pictures/food/milk.png', word: 'شیر' },
      { img: 'pictures/food/egg.png', word: 'تخم‌مرغ' },
      { img: 'pictures/food/cheese.png', word: 'پنیر' },
      { img: 'pictures/food/cookie.png', word: 'بیسکویت' },
      { img: 'pictures/food/carrot.png', word: 'هویج' },
    ],
    family: [
      { img: 'pictures/family/mom.png', word: 'مامان' },
      { img: 'pictures/family/dad.png', word: 'بابا' },
      { img: 'pictures/family/sister.png', word: 'خواهر' },
      { img: 'pictures/family/brother.png', word: 'برادر' },
      { img: 'pictures/family/grandma.png', word: 'مامان‌بزرگ' },
      { img: 'pictures/family/grandpa.png', word: 'بابابزرگ' },
      { img: 'pictures/family/baby.png', word: 'بچه' },
    ],
    vehicles: [
      { img: 'pictures/vehicles/car.png', word: 'ماشین' },
      { img: 'pictures/vehicles/bus.png', word: 'اتوبوس' },
      { img: 'pictures/vehicles/train.png', word: 'قطار' },
      { img: 'pictures/vehicles/airplane.png', word: 'هواپیما' },
      { img: 'pictures/vehicles/bicycle.png', word: 'دوچرخه' },
      { img: 'pictures/vehicles/boat.png', word: 'قایق' },
      { img: 'pictures/vehicles/truck.png', word: 'کامیون' },
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
    shapes: [
      { img: 'pictures/shapes/circle.svg', word: 'cirkel' },
      { img: 'pictures/shapes/square.svg', word: 'fyrkant' },
      { img: 'pictures/shapes/triangle.svg', word: 'triangel' },
      { img: 'pictures/shapes/rectangle.svg', word: 'rektangel' },
      { img: 'pictures/shapes/star.svg', word: 'stjärna' },
      { img: 'pictures/shapes/heart.svg', word: 'hjärta' },
      { img: 'pictures/shapes/diamond.svg', word: 'diamant' },
      { img: 'pictures/shapes/oval.svg', word: 'oval' },
    ],
    food: [
      { img: 'pictures/food/apple.png', word: 'äpple' },
      { img: 'pictures/food/banana.png', word: 'banan' },
      { img: 'pictures/food/bread.png', word: 'bröd' },
      { img: 'pictures/food/milk.png', word: 'mjölk' },
      { img: 'pictures/food/egg.png', word: 'ägg' },
      { img: 'pictures/food/cheese.png', word: 'ost' },
      { img: 'pictures/food/cookie.png', word: 'kaka' },
      { img: 'pictures/food/carrot.png', word: 'morot' },
    ],
    family: [
      { img: 'pictures/family/mom.png', word: 'mamma' },
      { img: 'pictures/family/dad.png', word: 'pappa' },
      { img: 'pictures/family/sister.png', word: 'syster' },
      { img: 'pictures/family/brother.png', word: 'bror' },
      { img: 'pictures/family/grandma.png', word: 'mormor' },
      { img: 'pictures/family/grandpa.png', word: 'morfar' },
      { img: 'pictures/family/baby.png', word: 'bebis' },
    ],
    vehicles: [
      { img: 'pictures/vehicles/car.png', word: 'bil' },
      { img: 'pictures/vehicles/bus.png', word: 'buss' },
      { img: 'pictures/vehicles/train.png', word: 'tåg' },
      { img: 'pictures/vehicles/airplane.png', word: 'flygplan' },
      { img: 'pictures/vehicles/bicycle.png', word: 'cykel' },
      { img: 'pictures/vehicles/boat.png', word: 'båt' },
      { img: 'pictures/vehicles/truck.png', word: 'lastbil' },
    ],
  },
};

export function builtinWordsFor(language: string): Record<BuiltinCategory, DeckItem[]> {
  return BUILTIN_WORDS[language] || BUILTIN_WORDS.fa;
}
