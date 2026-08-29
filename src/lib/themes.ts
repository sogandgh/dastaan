export type Theme = {
  id: string;
  label: string;
  color: string;
  focus: string;
  icon: string;
};

export const THEMES: Theme[] = [
  {
    id: 'potty', label: 'Potty time', color: '#5AA9E6',
    focus: 'using the potty on their own, staying dry, and feeling proud about it',
    icon: '<rect x="6.5" y="2.8" width="10.5" height="5.2" rx="1.2"/><path d="M4.2 9.6h15.6v1a6.6 6 0 0 1-6.6 6h-2.4a6.6 6 0 0 1-6.6-6z"/><path d="M10.2 16.8 9.6 21h4.8l-.6-4.2"/>',
  },
  {
    id: 'sleep', label: 'Going to sleep', color: '#7B7FD4',
    focus: 'settling down at bedtime, staying in their own bed, and falling asleep calmly',
    icon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/><path d="M16 4.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"/>',
  },
  {
    id: 'teeth', label: 'Brushing teeth', color: '#48B89F',
    focus: 'brushing their teeth morning and night without a fuss',
    icon: '<path d="M5 9c0-2 1.6-3.4 3.5-3.4 1.2 0 2.3.5 3.5.5s2.3-.5 3.5-.5C17.4 5.6 19 7 19 9c0 3-1.2 4-1.7 6.4-.4 1.8-.7 3.6-1.8 3.6-1.3 0-1.2-2.6-2-4.3-.3-.6-.7-1-1.5-1s-1.2.4-1.5 1c-.8 1.7-.7 4.3-2 4.3-1.1 0-1.4-1.8-1.8-3.6C6.2 13 5 12 5 9z"/>',
  },
  {
    id: 'food', label: 'Trying new food', color: '#E8964F',
    focus: 'being brave about tasting a new food at dinner',
    icon: '<path d="M12 8.8c-1-1.2-2.4-1.7-3.7-1.2C6.5 8.3 5.5 10.2 6 12.5c.5 2.5 2.3 5.6 3.9 6.4 1 .5 1.5 0 2.1 0s1.1.5 2.1 0c1.6-.8 3.4-3.9 3.9-6.4.5-2.3-.5-4.2-2.3-4.9-1.3-.5-2.7 0-3.7 1.2z"/><path d="M12 8.8V5.6"/><path d="M12 5.6c1.6 0 2.6-1 2.6-2.6-1.6 0-2.6 1-2.6 2.6z"/>',
  },
  {
    id: 'sharing', label: 'Sharing with friends', color: '#E4779B',
    focus: 'taking turns and sharing toys with a friend, even when it is hard',
    icon: '<path d="M12 20s-6.5-4-6.5-9A3.5 3.5 0 0 1 12 9.4 3.5 3.5 0 0 1 18.5 11c0 5-6.5 9-6.5 9z"/>',
  },
  {
    id: 'feelings', label: 'Big feelings', color: '#C77DD4',
    focus: 'noticing a big feeling like anger or frustration and finding a way to calm down',
    icon: '<circle cx="12" cy="12" r="8.2"/><path d="M9 10.2h.01M15 10.2h.01"/><path d="M8.8 15.2c.9-1 2-1.5 3.2-1.5s2.3.5 3.2 1.5"/>',
  },
];

export const LENGTHS = [
  { minutes: 1, label: '1 min' },
  { minutes: 2, label: '2 min' },
  { minutes: 3, label: '3 min' },
] as const;
