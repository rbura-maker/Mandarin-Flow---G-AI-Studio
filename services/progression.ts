import { Vocabulary, SRSState, StudentProfile } from '../types';
import { HSK_WORD_COUNTS, WORD_MASTERY_XP } from '../constants';

// A word is considered "Mastered" if the SRS interval is > 21 days
const MASTERY_THRESHOLD_DAYS = 21;

export const progressionService = {
  
  /**
   * Calculates the user's "Truth" Level (HSK Badge).
   * Logic: You are HSK X if you have mastered >= 80% of HSK X-1.
   * We start checking from Level 1. If you haven't mastered 80% of Level 1, you stay Level 1.
   */
  calculateEffectiveHSKLevel(vocab: Vocabulary[], srsState: SRSState[]): number {
    const maxLevel = 6;
    
    // We check levels sequentially. 
    // To be Level 2, you must pass Level 1. To be Level 3, you must pass Level 2.
    for (let levelToCheck = 1; levelToCheck < maxLevel; levelToCheck++) {
      const stats = this.getLevelStats(levelToCheck, vocab, srsState);
      
      // If coverage is less than 80%, this is the user's bottleneck level.
      // They cannot progress beyond this badge.
      if (stats.percentage < 80) {
        return levelToCheck;
      }
    }
    
    return maxLevel;
  },

  /**
   * Returns progress statistics for a specific HSK Level.
   * Used for the dashboard progress bar.
   */
  getLevelStats(level: number, vocab: Vocabulary[], srsState: SRSState[]) {
    // 1. Identify all User words in this level
    const userWordsInLevel = vocab.filter(v => v.level === level);
    
    // 2. Count how many are mastered (Interval > 21)
    const masteredCount = userWordsInLevel.reduce((count, word) => {
      const srsItem = srsState.find(s => s.id === word.id);
      if (srsItem && srsItem.interval > MASTERY_THRESHOLD_DAYS) {
        return count + 1;
      }
      return count;
    }, 0);

    // 3. Denominator: Official HSK Count
    // (We use the official count so a user with only 10 imported words isn't marked as 100% complete)
    const totalRequired = HSK_WORD_COUNTS[level] || 150;

    return {
      level,
      masteredCount,
      totalRequired,
      percentage: Math.min(100, Math.round((masteredCount / totalRequired) * 100))
    };
  },

  /**
   * Returns the Rank Title based on XP (Ego Metric)
   */
  getXPRank(xp: number): string {
    if (xp < 500) return "Novice";
    if (xp < 1500) return "Apprentice";
    if (xp < 3500) return "Scholar";
    if (xp < 7000) return "Master";
    if (xp < 15000) return "Grandmaster";
    return "Sage";
  },

  /**
   * Checks if a specific SRS update triggered a "Mastery Event"
   * (Crossing the 21 day threshold for the first time)
   */
  checkMasteryBonus(oldInterval: number, newInterval: number, wordId: string, vocab: Vocabulary[]): number {
    if (oldInterval <= MASTERY_THRESHOLD_DAYS && newInterval > MASTERY_THRESHOLD_DAYS) {
      const word = vocab.find(v => v.id === wordId);
      if (word) {
        const xp = WORD_MASTERY_XP[word.level] || 10;
        return xp;
      }
    }
    return 0;
  }
};