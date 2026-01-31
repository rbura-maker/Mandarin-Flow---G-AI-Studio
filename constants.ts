import { Vocabulary, SRSState } from './types';

export const INITIAL_VOCABULARY: Vocabulary[] = [
  { id: '6', hanzi: '困难', pinyin: 'kùn nan', meaning: 'Difficult', level: 3, tags: ['adjective'] },
  { id: '7', hanzi: '坚持', pinyin: 'jiān chí', meaning: 'To persist / persevere', level: 3, tags: ['verb'] },
  { id: '10', hanzi: '喜欢', pinyin: 'xǐ huan', meaning: 'To like', level: 1, tags: ['verb'] },
];

// Initial state for testing if local storage is empty
export const INITIAL_SRS_STATE: SRSState[] = INITIAL_VOCABULARY.map(word => ({
  id: word.id,
  easeFactor: 2.5,
  interval: 0,
  dueDate: Date.now(), // Due immediately
  reviews: 0,
  lapses: 0,
  lastReview: 0,
}));

export const STROKE_COLOR = "#2C2C2C";
export const HIGHLIGHT_COLOR = "#D32F2F";

// --- PROGRESSION CONSTANTS ---

// Official HSK 2.0 Word Counts (Cumulative logic is handled in service)
// Using specific "New Words per Level" counts
export const HSK_WORD_COUNTS: Record<number, number> = {
  1: 150,
  2: 150, // 150 new (300 total)
  3: 300, // 300 new (600 total)
  4: 600, // 600 new (1200 total)
  5: 1300,
  6: 2500
};

// XP Reward for mastering a word of this level (Interval > 21 days)
export const WORD_MASTERY_XP: Record<number, number> = {
  1: 10,
  2: 20,
  3: 40,
  4: 80,
  5: 160,
  6: 320
};

export const ACTIVITY_XP = {
  REVIEW_CARD: 1,
  COMPLETE_READING: 50,
  DAILY_STREAK: 100,
  // Speaking is calculated dynamically based on accuracy %
};