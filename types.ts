
export interface Vocabulary {
  id: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
  level: number; // HSK Level
  tags: string[];
}

export interface SRSState {
  id: string; // matches Vocabulary.id
  easeFactor: number; // Default 2.5
  interval: number; // Days until next review
  dueDate: number; // Timestamp
  reviews: number; // Total review count
  lapses: number; // Times forgotten
  lastReview?: number; // Timestamp of the most recent review
}

export interface DailyProgress {
  date: number; // Timestamp of the day tracking started
  flashcards: boolean;
  reading: boolean;
  speaking: boolean;
  reviewsDoneToday: number;
}

export interface StudentProfile {
  hskLevel: number;
  xp: number;
  streakDays: number;
  lastStudyDate: number; // Timestamp
  dailyProgress?: DailyProgress;
}

export interface ReadingPassage {
  title: string;
  content: string; // The Hanzi text
  pinyin: string;
  translation: string;
  lines?: { 
    hanzi: string; 
    pinyin: string;
    words?: { hanzi: string; pinyin: string }[]; // New: Word-level segmentation
  }[]; 
  targetWordIds: string[];
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
}

export interface PronunciationFeedback {
  score: number; // 0-100
  accuracy: number; // 0-100
  feedbackText: string;
  mispronouncedWords: string[];
  missingWords: string[];
  bestWords: string[]; // New: Words pronounced correctly
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  FLASHCARDS = 'FLASHCARDS',
  READING = 'READING',
  SPEAKING = 'SPEAKING',
  TEACHER = 'TEACHER',
  IMPORT = 'IMPORT',
}