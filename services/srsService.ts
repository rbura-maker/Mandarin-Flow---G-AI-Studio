import { SRSState } from '../types';

// Ratings: 0 = Again, 1 = Hard, 2 = Good, 3 = Easy
export const calculateReview = (
  item: SRSState,
  rating: number
): SRSState => {
  const now = Date.now();
  let { easeFactor, interval, reviews, lapses } = item;

  if (rating === 0) {
    // Again: Reset interval, decrease ease slightly (optional), increment lapses
    interval = 0; // Minutes? For MVP, let's say 0 means "Review again today"
    lapses += 1;
    // Ease factor can drop if forgotten often
    easeFactor = Math.max(1.3, easeFactor - 0.2);
  } else {
    // Standard SM-2 inspired logic
    if (rating === 1) { // Hard
      interval = Math.max(1, interval * 1.2);
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else if (rating === 2) { // Good
      if (interval === 0) interval = 1;
      else if (interval === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
    } else if (rating === 3) { // Easy
      if (interval === 0) interval = 4;
      else if (interval === 1) interval = 10; // Jump faster
      else interval = Math.round(interval * easeFactor * 1.3); // Bonus
      easeFactor += 0.15;
    }
  }

  const oneDay = 24 * 60 * 60 * 1000;
  const newDueDate = interval === 0 ? now + 60000 : now + (interval * oneDay);

  return {
    ...item,
    easeFactor,
    interval,
    dueDate: newDueDate,
    reviews: reviews + 1,
    lapses,
    lastReview: now, // Record when this review happened
  };
};

/**
 * Returns a prioritized list of cards to review.
 * @param items The full SRS state
 * @param newCardLimit Optional limit on how many "New" (unseen) cards to include. 
 *                     This prevents overwhelming the user if they import 1000 words.
 */
export const getDueItems = (items: SRSState[], newCardLimit: number = -1): SRSState[] => {
  const now = Date.now();
  
  // 1. Filter for items that are technically due
  const dueItems = items.filter(item => item.dueDate <= now);

  // 2. Sort Logic:
  //    Priority 1: Weak words (High Lapses) -> Descending
  //    Priority 2: Overdue (Oldest Due Date) -> Ascending (Preserves Import Order for New Cards)
  const sorted = dueItems.sort((a, b) => {
    if (b.lapses !== a.lapses) {
      return b.lapses - a.lapses; // Higher lapses first (Struggling words)
    }
    return a.dueDate - b.dueDate; // FIFO (First In First Out)
  });

  // 3. Apply Limits (Drip Feed)
  // If no limit specified, return everything (e.g. for "Review More" button)
  if (newCardLimit === -1) return sorted;

  const reviewsDue = sorted.filter(item => item.reviews > 0);
  const newCards = sorted.filter(item => item.reviews === 0);

  // Return ALL due reviews (mandatory) + a limited subset of NEW cards
  return [...reviewsDue, ...newCards.slice(0, newCardLimit)];
};