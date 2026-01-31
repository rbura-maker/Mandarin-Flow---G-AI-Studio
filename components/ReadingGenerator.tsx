import React, { useState, useEffect } from 'react';
import { Vocabulary, ReadingPassage, SRSState } from '../types';
import { generateReadingPassage } from '../services/geminiService';

interface Props {
  vocab: Vocabulary[];
  srsState: SRSState[];
  dueWordIds: string[];
  userLevel: number;
  onComplete: () => void;
  onStartSpeaking: (passage: ReadingPassage) => void;
  onTaskComplete?: () => void;
}

const ReadingGenerator: React.FC<Props> = ({ vocab, srsState, dueWordIds, userLevel, onComplete, onStartSpeaking, onTaskComplete }) => {
  const [passage, setPassage] = useState<ReadingPassage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'setup' | 'generating' | 'reading'>('setup');
  
  // Display Toggles
  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  const [revealedWordKeys, setRevealedWordKeys] = useState<Set<string>>(new Set());

  // Quiz State
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerStatus, setAnswerStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [quizCompleted, setQuizCompleted] = useState(false);

  const startGeneration = () => {
    setError(null);
    setStep('generating');
  };

  useEffect(() => {
    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      setRevealedWordKeys(new Set());
      try {
        // --- Word Selection Strategy ---
        // 1. Identify Words Reviewed Today (Reinforcement)
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const todayStartTs = startOfDay.getTime();
        
        const reviewedTodayIds = new Set(
            srsState
                .filter(s => s.lastReview && s.lastReview >= todayStartTs)
                .map(s => s.id)
        );

        // 2. Identify Words Currently Due (Study)
        const dueIds = new Set(dueWordIds);

        // 3. Separate Vocab into buckets
        const reviewedWords = vocab.filter(v => reviewedTodayIds.has(v.id));
        const dueWords = vocab.filter(v => dueIds.has(v.id) && !reviewedTodayIds.has(v.id));
        const otherWords = vocab.filter(v => !reviewedTodayIds.has(v.id) && !dueIds.has(v.id));

        // Helper to shuffle array
        const shuffle = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

        // 4. Construct Target List (Max 10)
        // Priority: Reviewed Today (Randomized) -> Due (Randomized) -> Random Fillers
        const targetWords = [...shuffle(reviewedWords)];
        
        if (targetWords.length < 10) {
            targetWords.push(...shuffle(dueWords).slice(0, 10 - targetWords.length));
        }
        if (targetWords.length < 10) {
            targetWords.push(...shuffle(otherWords).slice(0, 10 - targetWords.length));
        }

        const finalTargetWords = targetWords.slice(0, 10);

        // --- Generate Story (Single Shot) ---
        const generatedPassage = await generateReadingPassage(finalTargetWords, [], userLevel);
        
        setPassage(generatedPassage);
        setStep('reading');
        setCurrentQIndex(0);
        setQuizCompleted(false);

      } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to generate story. Please try again.");
        setStep('setup');
      } finally {
        setLoading(false);
      }
    };

    if (step === 'generating') {
      fetchContent();
    }
  }, [step, dueWordIds, vocab, userLevel, srsState]);

  const handleOptionSelect = (optionIndex: number) => {
    if (answerStatus !== 'idle' || !passage) return;

    const currentQuestion = passage.questions[currentQIndex];
    const isCorrect = optionIndex === currentQuestion.correctIndex;
    
    setSelectedOption(optionIndex);
    setAnswerStatus(isCorrect ? 'correct' : 'incorrect');
  };

  const handleNextQuestion = () => {
    if (!passage) return;

    if (currentQIndex < passage.questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setSelectedOption(null);
      setAnswerStatus('idle');
    } else {
      setQuizCompleted(true);
      if (onTaskComplete) onTaskComplete();
    }
  };

  const toggleWordReveal = (lineIdx: number, wordIdx: number) => {
      const key = `${lineIdx}-${wordIdx}`;
      setRevealedWordKeys(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
      });
  };

  const isTargetWord = (hanzi: string) => {
      if (!passage) return false;
      return vocab.some(v => v.hanzi === hanzi && passage.targetWordIds.includes(v.id));
  };

  const isChineseText = (text: string) => /[\u4e00-\u9fa5]/.test(text);

  const renderFallbackContent = (content: string, targetIds: string[]) => {
    if (!content || !targetIds) return content;

    const targetWords = vocab
        .filter(v => targetIds.includes(v.id))
        .map(v => v.hanzi)
        .filter(h => h && h.trim().length > 0)
        .sort((a, b) => b.length - a.length);

    if (targetWords.length === 0) return content;

    const escapedWords = targetWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedWords.join('|')})`, 'g');
    
    const parts = content.split(regex);
    
    return parts.map((part, index) => {
        if (targetWords.includes(part)) {
            return (
                <span key={index} className="text-china-red font-bold border-b-2 border-red-200 bg-red-50/50 px-1 rounded-sm mx-0.5 inline-block">
                    {part}
                </span>
            );
        }
        return <span key={index}>{part}</span>;
    });
  };

  const Toggle = ({ label, active, onToggle }: { label: string, active: boolean, onToggle: () => void }) => (
    <button 
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold transition-all ${
        active ? 'bg-ink-black text-white shadow-md' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      <div className={`w-3 h-3 rounded-full ${active ? 'bg-bamboo-green' : 'bg-gray-400'}`}></div>
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-china-red mb-4"></div>
        <p className="text-gray-500 animate-pulse">
            Generating custom story...
        </p>
      </div>
    );
  }

  // Initial Setup Screen
  if (step === 'setup') {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in relative">
            <button 
                onClick={onComplete}
                className="absolute top-8 left-6 text-gray-400 hover:text-ink-black transition p-2"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <div className="w-16 h-16 bg-bamboo-green rounded-full flex items-center justify-center mb-6 text-white">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
            </div>
            <h2 className="text-2xl font-serif font-bold text-ink-black mb-2">Daily Reading</h2>
            <p className="text-gray-500 mb-8 max-w-xs">
                Generate a story for <span className="font-bold text-ink-black">HSK {userLevel}</span> based on your progress.
            </p>
            
            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm max-w-xs mx-auto border border-red-100">
                    {error}
                </div>
            )}

            <button 
                onClick={startGeneration}
                className="w-full max-w-xs bg-china-red text-white py-4 rounded-full font-bold shadow-lg hover:bg-red-700 transition transform active:scale-95"
            >
                Start Session
            </button>
        </div>
      );
  }

  if (!passage) return <div>Failed to load.</div>;

  const currentQuestion = passage.questions && passage.questions.length > 0 
    ? passage.questions[currentQIndex] 
    : null;

  return (
    <div className="max-w-2xl mx-auto p-6 h-full overflow-y-auto no-scrollbar pb-24">
      
      {/* Header & Controls */}
      <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div className="flex items-center gap-3">
             <button onClick={onComplete} className="text-gray-400 hover:text-ink-black transition mr-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
             </button>
             <div>
                <h2 className="text-2xl font-bold font-serif leading-tight">{passage.title}</h2>
                <span className="bg-bamboo-green text-white text-xs px-2 py-0.5 rounded inline-block">HSK {userLevel}</span>
             </div>
        </div>
        
        {/* View Controls */}
        <div className="flex items-center gap-3">
            <button 
                onClick={startGeneration} 
                className="p-2 text-gray-400 hover:text-china-red hover:bg-red-50 rounded-full transition"
                title="Generate New Story"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            </button>
            <div className="w-px h-6 bg-gray-200 mx-1"></div>
            <Toggle label="Pinyin" active={showPinyin} onToggle={() => setShowPinyin(!showPinyin)} />
            <Toggle label="Translation" active={showTranslation} onToggle={() => setShowTranslation(!showTranslation)} />
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8 transition-all">
        {/* If we have segmented lines */}
        {passage.lines && passage.lines.length > 0 ? (
            <div className="space-y-6">
                {passage.lines.map((line, lineIdx) => (
                    <div key={lineIdx} className="flex flex-wrap items-end gap-x-1 gap-y-2">
                        {!line.words || line.words.length === 0 ? (
                            <div className="relative w-full">
                                {showPinyin && (
                                    <div className="text-sm text-gray-500 font-medium mb-1 leading-none">
                                        {line.pinyin}
                                    </div>
                                )}
                                <div className="text-xl leading-relaxed font-serif text-ink-black">
                                    {renderFallbackContent(line.hanzi, passage.targetWordIds)}
                                </div>
                            </div>
                        ) : (
                            // Render Interactive Words
                            line.words.map((word, wordIdx) => {
                                const isRevealed = showPinyin || revealedWordKeys.has(`${lineIdx}-${wordIdx}`);
                                const highlighted = isTargetWord(word.hanzi);
                                
                                return (
                                    <div 
                                        key={wordIdx} 
                                        onClick={() => !showPinyin && toggleWordReveal(lineIdx, wordIdx)}
                                        className={`flex flex-col items-center justify-end cursor-pointer transition-colors rounded hover:bg-gray-50 px-0.5 ${highlighted ? 'bg-red-50/30' : ''}`}
                                    >
                                        {isRevealed && word.pinyin && (
                                            <div className="text-xs text-gray-500 font-medium text-center h-5 mb-0.5 animate-fade-in flex items-end">
                                                {word.pinyin}
                                            </div>
                                        )}
                                        <div className={`text-xl font-serif leading-none ${highlighted ? 'text-china-red font-bold border-b-2 border-red-200' : 'text-ink-black'}`}>
                                            {word.hanzi}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                ))}
            </div>
        ) : (
            <div className="relative">
                 {showPinyin && (
                     <div className="text-sm text-gray-500 font-medium mb-4 leading-relaxed animate-fade-in border-b border-gray-100 pb-4">
                         {passage.pinyin || "Loading Pinyin..."}
                     </div>
                 )}
                 <div className="text-xl leading-relaxed font-serif text-ink-black">
                    {renderFallbackContent(passage.content, passage.targetWordIds)}
                 </div>
            </div>
        )}

        {/* Translation Box */}
        {showTranslation && (
             <div className="mt-6 pt-6 border-t border-gray-100 animate-fade-in">
                <p className="text-gray-700 italic leading-relaxed">{passage.translation}</p>
            </div>
        )}
      </div>

      {/* Action Area (Quiz) */}
      <div className="space-y-8">
        <div>
            <div className="flex justify-between items-end mb-4">
                <h3 className="font-bold text-gray-700">Comprehension</h3>
                {!quizCompleted && passage.questions && passage.questions.length > 0 && (
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Question {currentQIndex + 1} / {passage.questions.length}
                    </span>
                )}
            </div>
            
            {quizCompleted ? (
                 <div className="animate-fade-in text-center p-8 bg-green-50 rounded-xl border border-green-100 shadow-sm transition-all">
                    <h3 className="text-bamboo-green font-bold text-xl mb-2">Reading Completed!</h3>
                    <p className="text-green-800 mb-6 text-sm">You answered {passage.questions.length} questions.</p>
                    
                    <div className="flex flex-col gap-3">
                        <button 
                            onClick={() => onStartSpeaking(passage)}
                            className="w-full bg-china-red text-white py-4 rounded-xl font-bold hover:bg-red-700 transition shadow-lg flex items-center justify-center gap-2 transform active:scale-95"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                            Practice Speaking this Story
                        </button>
                        <button 
                            onClick={onComplete}
                            className="w-full bg-white border-2 border-gray-200 text-gray-700 py-4 rounded-xl font-bold hover:bg-gray-50 transition"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            ) : !currentQuestion ? (
                <div className="bg-gray-50 p-6 rounded-xl text-center text-gray-500">
                    No questions available for this story.
                </div>
            ) : (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all duration-300 animate-fade-in">
                    <p className={`text-lg font-medium text-gray-800 mb-6 ${isChineseText(currentQuestion.question) ? 'font-serif text-xl' : ''}`}>
                        {currentQuestion.question}
                    </p>
                    
                    <div className="space-y-3 mb-6">
                        {currentQuestion.options?.map((opt, idx) => {
                            let buttonStyle = "bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-100";
                            if (answerStatus !== 'idle') {
                                if (idx === currentQuestion.correctIndex) {
                                    buttonStyle = "bg-green-100 text-green-800 border-green-200 ring-1 ring-green-200";
                                } else if (idx === selectedOption) {
                                    buttonStyle = "bg-red-100 text-red-800 border-red-200 ring-1 ring-red-200 opacity-60";
                                } else {
                                    buttonStyle = "bg-gray-50 text-gray-400 opacity-50";
                                }
                            } else if (selectedOption === idx) {
                                buttonStyle = "bg-ink-black text-white";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleOptionSelect(idx)}
                                    disabled={answerStatus !== 'idle'}
                                    className={`w-full text-left px-5 py-4 rounded-xl text-base transition-all border ${buttonStyle}`}
                                >
                                    <div className="flex justify-between items-center">
                                        <span className={isChineseText(opt) ? 'font-serif text-lg' : ''}>{opt}</span>
                                        {answerStatus !== 'idle' && idx === currentQuestion.correctIndex && (
                                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        )}
                                        {answerStatus === 'incorrect' && idx === selectedOption && (
                                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className={`transition-all duration-300 overflow-hidden ${answerStatus !== 'idle' ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                             <div className="text-sm font-bold">
                                {answerStatus === 'correct' ? (
                                    <span className="text-bamboo-green flex items-center gap-1">
                                        Excellent! Correct answer.
                                    </span>
                                ) : (
                                    <span className="text-china-red">
                                        Not quite right.
                                    </span>
                                )}
                             </div>
                             
                             <button
                                onClick={handleNextQuestion}
                                className="bg-ink-black text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-gray-800 transition shadow-md"
                             >
                                {currentQIndex < (passage.questions?.length || 0) - 1 ? 'Next Question' : 'Finish Quiz'}
                             </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ReadingGenerator;