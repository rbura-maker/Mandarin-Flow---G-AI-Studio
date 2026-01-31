import React, { useState, useEffect } from 'react';
import { Vocabulary, SRSState } from '../types';
import { calculateReview, getDueItems } from '../services/srsService';

interface Props {
  vocab: Vocabulary[];
  srsState: SRSState[];
  onUpdateSRS: (updated: SRSState) => void;
  onComplete: () => void;
  onStartReading?: () => void;
  sessionLimit: number;
}

const Flashcards: React.FC<Props> = ({ vocab, srsState, onUpdateSRS, onComplete, onStartReading, sessionLimit }) => {
  const [currentCard, setCurrentCard] = useState<SRSState | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Track cards reviewed in this specific session instance
  const [sessionReviewsCompleted, setSessionReviewsCompleted] = useState(0);

  useEffect(() => {
    // If user has hit the session limit (e.g. 20 cards), stop serving new ones
    if (sessionReviewsCompleted >= sessionLimit) {
        setCurrentCard(null);
        return;
    }

    // Use a conservative new card limit (e.g. 15) to prevent pulling the entire database
    // The session limit (20) will act as the hard stop anyway.
    const allDue = getDueItems(srsState || [], 15);
    
    if (allDue.length > 0) {
        setCurrentCard(allDue[0]);
    } else {
        setCurrentCard(null);
    }
  }, [srsState, sessionLimit, sessionReviewsCompleted]);

  const handleGrade = (rating: number) => {
    if (!currentCard || isAnimating) return;

    setIsAnimating(true);
    setIsFlipped(false); // Start flip back animation

    // Delay the data update to allow the card to flip past 90 degrees (hiding the back)
    // before swapping the content to the next card.
    setTimeout(() => {
        const updatedItem = calculateReview(currentCard, rating);
        onUpdateSRS(updatedItem);
        setSessionReviewsCompleted(prev => prev + 1);
        setIsAnimating(false);
    }, 300);
  };

  const isChinese = (text: string) => /[\u4e00-\u9fa5]/.test(text);
  const isPinyin = (text: string) => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(text);
  
  // Robust parser to break unstructured blobs into lines without losing content
  const parseMeaning = (text: string) => {
    if (!text) return [];

    // 1. Basic Cleanup: Convert literal newlines or <br> to real \n
    let processed = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\\n/g, '\n');

    // 2. Intelligent Segmentation
    //    We separate script boundaries to ensure clean formatting lines.
    
    // Insert newline BEFORE Chinese block if preceded by non-Chinese (and not newline)
    // e.g. "want 他们" -> "want\n他们"
    // Updated to include opening punctuation in "Chinese block"
    processed = processed.replace(/([^\u4e00-\u9fa5\n])\s*([\u4e00-\u9fa5“‘《（【])/g, '$1\n$2');
    
    // Insert newline AFTER Chinese block if followed by non-Chinese
    // e.g. "这里。They" -> "这里。\nThey"
    // Updated to include closing punctuation in "Chinese block" and EXCLUDE it from "non-Chinese" lookahead
    // to prevent orphaned punctuation like "草\n。"
    processed = processed.replace(/([\u4e00-\u9fa5。！？，、：；”’》）】])\s*([^\u4e00-\u9fa5\n。！？，、：；”’》）】])/g, '$1\n$2');
    
    // Insert double newline BEFORE numbered headers (e.g. "1. Wish" or "2. Be")
    // e.g. "verb 1. Wish" -> "verb\n\n1. Wish"
    processed = processed.replace(/(\s|^)(\d+[\.\)\、])/g, '$1\n\n$2');
    
    // Split Pinyin from English if they are on the same line.
    // Look for: Pinyin-tone-char ... punctuation ... space ... Uppercase Letter
    // e.g. "zhèlǐ. They" -> "zhèlǐ.\nThey"
    processed = processed.replace(/([āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü][^。！？\.\?!]*[\.\?!])\s+([A-Z])/g, '$1\n$2');

    return processed.split(/\r?\n/);
  };

  const renderMeaning = (text: string) => {
    const lines = parseMeaning(text);

    return (
        <div className="w-full text-left overflow-y-auto flex-1 min-h-0 pr-2 no-scrollbar mt-4 mb-4">
            {lines.map((line, index) => {
                const trimmed = line.trim();
                
                // 1. Handle Empty Lines (Spacers)
                if (!trimmed) {
                    return <div key={index} className="h-4" />; 
                }

                // 2. Detect Numbered Header (e.g. "1. Wish..." or "2. Be willing...")
                if (/^\d+[\.\)\、]/.test(trimmed)) {
                    return (
                        <div key={index} className="mt-4 first:mt-0 mb-1">
                             <h4 className="font-bold text-gray-900 text-base">
                                {trimmed}
                             </h4>
                        </div>
                    );
                }

                // 3. Detect Chinese (Large Serif)
                if (isChinese(trimmed)) {
                    return <p key={index} className="font-serif text-2xl text-ink-black leading-snug mt-1">{trimmed}</p>;
                } 
                
                // 4. Detect Pinyin with Tones (Medium Sans-Serif Grey)
                // Used for examples like "Tāmen yuànyi..."
                if (isPinyin(trimmed)) {
                    return <p key={index} className="text-base text-gray-600 font-sans tracking-wide font-medium mt-1">{trimmed}</p>;
                }

                // 5. Default / English / Definitions (Italic Grey)
                // e.g. "verb 1 wish; like; want"
                return <p key={index} className="text-sm text-gray-700 italic leading-relaxed mt-1">{trimmed}</p>;
            })}
        </div>
    );
  };

  // Completion / Empty State Logic
  if (!currentCard) {
    const isSessionComplete = sessionReviewsCompleted >= sessionLimit;
    // Check total backlog count without limit to show user if they can do more
    const totalBacklogCount = getDueItems(srsState || []).length;
    
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in relative">
         <button 
          onClick={onComplete}
          className="absolute top-8 left-6 text-gray-400 hover:text-ink-black transition p-2"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>

        <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm ${isSessionComplete ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
             {isSessionComplete ? (
                 <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
             ) : (
                 <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
             )}
        </div>

        <h2 className="text-2xl font-bold mb-4 font-serif text-ink-black">
            {isSessionComplete ? "Session Complete!" : "All Caught Up!"}
        </h2>
        
        <p className="text-gray-500 mb-8 max-w-xs mx-auto">
            {isSessionComplete 
                ? `You've reviewed ${sessionReviewsCompleted} cards. Take a break or continue if you wish.` 
                : "No more cards due right now. Great job!"}
        </p>
        
        <div className="flex flex-col gap-3 w-full max-w-xs">
            {/* Main Action - Continue to Reading */}
            {onStartReading && (
                <button 
                    onClick={onStartReading}
                    className="bg-bamboo-green text-white px-6 py-3 rounded-xl shadow-lg hover:bg-green-700 transition font-bold flex items-center justify-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    Start Reading
                </button>
            )}

            <button 
                onClick={onComplete}
                className="bg-ink-black text-white px-6 py-3 rounded-xl shadow-lg hover:bg-gray-800 transition font-bold"
            >
                Return to Dashboard
            </button>
            
            {/* Show "Review More" if there are still cards due in the backlog */}
            {isSessionComplete && totalBacklogCount > 0 && (
                <button 
                    onClick={() => setSessionReviewsCompleted(0)}
                    className="bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-xl hover:bg-gray-50 transition font-bold"
                >
                    Review More ({Math.min(totalBacklogCount, sessionLimit)})
                </button>
            )}
        </div>
      </div>
    );
  }

  const wordData = vocab.find(v => v.id === currentCard.id);
  if (!wordData) return <div>Error loading card</div>;

  return (
    <div className="max-w-md mx-auto h-full flex flex-col justify-center py-8 px-6">
      {/* Header with Back + Progress */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={onComplete} className="text-gray-400 hover:text-ink-black transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
            className="bg-bamboo-green h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, (sessionReviewsCompleted / sessionLimit) * 100)}%` }}
            />
        </div>
        <div className="text-xs font-bold text-gray-400 w-12 text-right">
            {sessionReviewsCompleted}/{sessionLimit}
        </div>
      </div>

      {/* Card Container */}
      <div 
        className="relative w-full aspect-[3/4] perspective-1000 cursor-pointer group"
        onClick={() => !isAnimating && !isFlipped && setIsFlipped(true)}
      >
        <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
          
          {/* Front */}
          <div className="absolute w-full h-full backface-hidden bg-white border border-gray-100 rounded-3xl shadow-xl flex flex-col items-center justify-center p-12 hover:shadow-2xl transition-shadow z-20">
            <h2 className="text-7xl font-serif text-ink-black text-center leading-tight">
              {wordData.hanzi}
            </h2>
            <p className="text-gray-300 mt-12 text-sm font-medium tracking-wide absolute bottom-12 uppercase group-hover:text-china-red transition-colors">
                Tap to reveal
            </p>
          </div>

          {/* Back */}
          <div className="absolute w-full h-full backface-hidden bg-white border border-gray-100 rounded-3xl shadow-xl flex flex-col items-center p-6 rotate-y-180 z-10 overflow-hidden">
            <div className="flex-shrink-0 flex flex-col items-center justify-center w-full border-b border-gray-50 pb-4 mb-2">
                <h2 className="text-5xl font-serif text-ink-black mb-2 text-center">{wordData.hanzi}</h2>
                <p className="text-2xl text-china-red font-serif text-center font-medium">{wordData.pinyin}</p>
            </div>

            {/* Content Area - Scrollable if too long */}
            {renderMeaning(wordData.meaning)}
            
            <div className="mt-auto pt-2 flex gap-2 flex-wrap justify-center flex-shrink-0">
                {wordData.tags?.map(tag => (
                <span key={tag} className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-bold uppercase tracking-wider rounded-lg">
                    {tag}
                </span>
                ))}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={`mt-8 grid grid-cols-4 gap-3 transition-all duration-300 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <button disabled={isAnimating} onClick={(e) => { e.stopPropagation(); handleGrade(0); }} className="flex flex-col items-center p-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition active:scale-95 disabled:opacity-50">
          <span className="font-bold text-sm">Again</span>
          <span className="text-xs opacity-70">1m</span>
        </button>
        <button disabled={isAnimating} onClick={(e) => { e.stopPropagation(); handleGrade(1); }} className="flex flex-col items-center p-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 transition active:scale-95 disabled:opacity-50">
          <span className="font-bold text-sm">Hard</span>
          <span className="text-xs opacity-70">2d</span>
        </button>
        <button disabled={isAnimating} onClick={(e) => { e.stopPropagation(); handleGrade(2); }} className="flex flex-col items-center p-3 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 transition active:scale-95 disabled:opacity-50">
          <span className="font-bold text-sm">Good</span>
          <span className="text-xs opacity-70">4d</span>
        </button>
        <button disabled={isAnimating} onClick={(e) => { e.stopPropagation(); handleGrade(3); }} className="flex flex-col items-center p-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition active:scale-95 disabled:opacity-50">
          <span className="font-bold text-sm">Easy</span>
          <span className="text-xs opacity-70">7d</span>
        </button>
      </div>
    </div>
  );
};

export default Flashcards;