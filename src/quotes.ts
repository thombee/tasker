// One quiet line a day about starting small. Rotates deterministically so
// the quote stays the same all day — no slot-machine effect.

interface Quote {
  text: string;
  author?: string;
}

const QUOTES: Quote[] = [
  {
    text: "You don't have to see the whole staircase, just take the first step.",
    author: 'Martin Luther King Jr.',
  },
  { text: 'The secret of getting ahead is getting started.', author: 'attributed to Mark Twain' },
  { text: 'A journey of a thousand miles begins with a single step.', author: 'Lao Tzu' },
  {
    text: 'Nothing is particularly hard if you divide it into small jobs.',
    author: 'Henry Ford',
  },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  {
    text: 'It does not matter how slowly you go as long as you do not stop.',
    author: 'Confucius',
  },
  {
    text: 'Great things are done by a series of small things brought together.',
    author: 'Vincent van Gogh',
  },
  { text: 'Well begun is half done.', author: 'Aristotle' },
  { text: 'The scariest moment is always just before you start.', author: 'Stephen King' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
  { text: 'Little by little, one travels far.', author: 'Spanish proverb' },
  { text: 'Action is the antidote to despair.', author: 'Joan Baez' },
  {
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    author: 'James Clear',
  },
  {
    text: 'The best time to plant a tree was twenty years ago. The second best time is now.',
    author: 'proverb',
  },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Motivation follows action — start tiny, and it catches up.' },
];

export function quoteOfTheDay(now = Date.now()): Quote {
  const daysSinceEpoch = Math.floor(
    (now - new Date(now).getTimezoneOffset() * 60000) / 86400000,
  );
  return QUOTES[daysSinceEpoch % QUOTES.length];
}
