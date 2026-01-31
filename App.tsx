import React, { useState, useEffect } from 'react';
import { dbService } from './services/db';
import { ViewState, SRSState, Vocabulary, StudentProfile, ReadingPassage } from './types';
import Flashcards from './components/Flashcards';
import ReadingGenerator from './components/ReadingGenerator';
import SpeakingPractice from './components/SpeakingPractice';
import TeacherDashboard from './components/TeacherDashboard';
import FileImporter from './components/FileImporter';
import { getDueItems } from './services/srsService';
import { progressionService } from './services/progression';
import { ACTIVITY_XP } from './constants';

const INITIAL_STUDENT_PROFILE: StudentProfile = {
  hskLevel: 1,
  xp: 0,
  streakDays: 0,
  lastStudyDate: 0,
  dailyProgress: {
    date: Date.now(),
    flashcards: false,
    reading: false,
    speaking: false,
    reviewsDoneToday: 0
  }
};

const DAILY_GOAL = 20;
const SESSION_BATCH_SIZE = 20;
const DAILY_NEW_CARD_LIMIT = 15;

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // Data States
  const [vocab, setVocab] = useState<Vocabulary[]>([]);
  const [srsState, setSrsState] = useState<SRSState[]>([]);
  const [student, setStudent] = useState<StudentProfile>(INITIAL_STUDENT_PROFILE);

  // Shared state
  const [currentReadingPassage, setCurrentReadingPassage] = useState<ReadingPassage | null>(null);

  // Load Data on Mount
  useEffect(() => {
    loadData();
  }, []);

  const getStartOfDay = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  };

  const loadData = async () => {
    setLoading(true);
    try {
        const [profile, userData] = await Promise.all([
            dbService.fetchProfile(),
            dbService.fetchUserData()
        ]);

        if (profile) {
            // Check for daily reset
            const todayStart = getStartOfDay();
            let finalProfile = profile;
            
            // Streak Logic Check on Load
            const lastDate = new Date(profile.lastStudyDate);
            const lastDayStart = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
            const diffDays = (todayStart - lastDayStart) / (1000 * 3600 * 24);
            
            // If they missed yesterday (diff > 1), streak resets to 0. 
            // If diff == 1 (yesterday), streak is preserved (and will increment on first action).
            // If diff == 0 (today), streak is preserved.
            if (diffDays > 1) {
                finalProfile = { ...finalProfile, streakDays: 0 };
            }

            if (!profile.dailyProgress || profile.dailyProgress.date < todayStart) {
                finalProfile = {
                    ...finalProfile,
                    dailyProgress: {
                        date: Date.now(),
                        flashcards: false,
                        reading: false,
                        speaking: false,
                        reviewsDoneToday: 0
                    }
                };
            }
            // Sync reset to DB immediately
            if (finalProfile !== profile) {
                dbService.updateProfile(undefined, finalProfile);
            }
            setStudent(finalProfile);
        }
        
        if (userData) {
            setVocab(userData.vocab);
            setSrsState(userData.srsState);
        }
    } catch (e) {
        console.error("Error loading data", e);
    } finally {
        setLoading(false);
    }
  };

  const handleTaskCompletion = (task: 'flashcards' | 'reading' | 'speaking', score?: number) => {
      setStudent(prev => {
          // Calculate XP
          let xpGain = 0;
          if (task === 'reading') xpGain = ACTIVITY_XP.COMPLETE_READING;
          if (task === 'speaking') xpGain = score ? Math.round(score) : 20; // XP = Accuracy Score
          
          // Daily Streak Bonus (First action of the day)
          const todayStart = getStartOfDay();
          const lastDate = new Date(prev.lastStudyDate);
          const lastDayStart = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
          const isFirstActionToday = todayStart > lastDayStart;

          let newStreak = prev.streakDays;
          if (isFirstActionToday) {
            // If we are here, it means we haven't done an action today.
            // If the last action was yesterday (diff == 1) OR today is day 1 (streak 0)
            const diffDays = (todayStart - lastDayStart) / (1000 * 3600 * 24);
            if (diffDays <= 1 || prev.streakDays === 0) {
               newStreak += 1;
               xpGain += ACTIVITY_XP.DAILY_STREAK;
            } else {
               newStreak = 1; // Restart
               xpGain += ACTIVITY_XP.DAILY_STREAK;
            }
          }

          // Update Progress Flags
          const currentFlags = prev.dailyProgress || {
              date: Date.now(),
              flashcards: false,
              reading: false,
              speaking: false,
              reviewsDoneToday: 0
          };
          
          // Don't award task XP twice for the same flag if it's a one-off (like reading daily)
          // But allow multiple speaking sessions
          if (task === 'reading' && currentFlags.reading) xpGain = 0;
          
          const newProfile = {
              ...prev,
              xp: prev.xp + xpGain,
              streakDays: newStreak,
              lastStudyDate: Date.now(),
              dailyProgress: {
                  ...currentFlags,
                  [task]: true
              }
          };
          
          dbService.updateProfile(undefined, newProfile);
          return newProfile;
      });
  };

  const handleSRSUpdate = async (updatedItem: SRSState) => {
    // 1. Identify previous state to check for Mastery Bonus
    const oldItem = srsState.find(s => s.id === updatedItem.id);
    const oldInterval = oldItem ? oldItem.interval : 0;
    
    // 2. Optimistic State Update
    const updatedSRS = srsState.map(item => item.id === updatedItem.id ? updatedItem : item);
    setSrsState(updatedSRS);
    dbService.updateSRSItem(undefined, updatedItem);

    // 3. Calculate Progression Updates
    const masteryXP = progressionService.checkMasteryBonus(oldInterval, updatedItem.interval, updatedItem.id, vocab);
    const activityXP = ACTIVITY_XP.REVIEW_CARD;
    
    // 4. Update Profile
    setStudent(prev => {
        const todayStart = getStartOfDay();
        const lastDate = new Date(prev.lastStudyDate);
        const lastDayStart = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate()).getTime();
        const isFirstActionToday = todayStart > lastDayStart;

        let newStreak = prev.streakDays;
        let streakBonus = 0;
        
        if (isFirstActionToday) {
             const diffDays = (todayStart - lastDayStart) / (1000 * 3600 * 24);
             if (diffDays <= 1 || prev.streakDays === 0) {
                newStreak += 1;
             } else {
                newStreak = 1; 
             }
             streakBonus = ACTIVITY_XP.DAILY_STREAK;
        }

        const newReviewsDone = (prev.dailyProgress?.reviewsDoneToday || 0) + 1;
        const goalMet = newReviewsDone >= DAILY_GOAL;
        
        // Calculate new effective level based on 80% rule
        const newEffectiveLevel = progressionService.calculateEffectiveHSKLevel(vocab, updatedSRS);

        const nextProfile: StudentProfile = {
            ...prev,
            hskLevel: newEffectiveLevel, // The Truth Metric
            xp: prev.xp + masteryXP + activityXP + streakBonus, // The Ego Metric
            streakDays: newStreak,
            lastStudyDate: Date.now(),
            dailyProgress: {
                ...prev.dailyProgress!,
                reviewsDoneToday: newReviewsDone,
                flashcards: prev.dailyProgress?.flashcards || goalMet
            }
        };

        dbService.updateProfile(undefined, nextProfile);
        return nextProfile;
    });
  };

  const handleImportWords = async (newWords: Vocabulary[]) => {
    try {
        await dbService.importWords(undefined, newWords);
        const userData = await dbService.fetchUserData();
        setVocab(userData.vocab);
        setSrsState(userData.srsState);
    } catch (e) {
        console.error("Import failed", e);
        alert("Import failed. Please check the file format.");
    }
  };

  if (loading) {
    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-china-red mb-4"></div>
            <p className="text-gray-500">Loading your journey...</p>
        </div>
    );
  }

  // Daily Stats & Due Counts
  const reviewsDoneToday = student.dailyProgress?.reviewsDoneToday || 0;
  const dashboardDueItems = getDueItems(srsState || [], DAILY_NEW_CARD_LIMIT);
  const dueCount = dashboardDueItems.length;
  
  // Progression Stats
  const levelStats = progressionService.getLevelStats(student.hskLevel, vocab, srsState);
  const xpRank = progressionService.getXPRank(student.xp);

  // Helper Checklist Component
  const ChecklistItem = ({ 
    label, 
    completed, 
    onClick 
  }: { 
    label: string, 
    completed: boolean, 
    onClick: () => void 
  }) => (
      <div 
        onClick={onClick}
        className={`flex items-center p-3 rounded-xl border transition-all cursor-pointer group ${
            completed 
            ? 'bg-green-50 border-green-200' 
            : 'bg-white border-gray-100 hover:border-china-red hover:shadow-sm'
        }`}
      >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 transition-colors ${
              completed ? 'bg-bamboo-green border-bamboo-green' : 'border-gray-300 group-hover:border-china-red'
          }`}>
              {completed && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              )}
          </div>
          <span className={`font-bold ${completed ? 'text-green-800' : 'text-gray-600 group-hover:text-ink-black'}`}>
              {label}
          </span>
      </div>
  );

  const renderContent = () => {
    switch (view) {
      case ViewState.FLASHCARDS:
        return (
          <Flashcards 
            vocab={vocab}
            srsState={srsState}
            onUpdateSRS={handleSRSUpdate}
            onComplete={() => setView(ViewState.DASHBOARD)}
            sessionLimit={SESSION_BATCH_SIZE}
            onStartReading={() => setView(ViewState.READING)}
          />
        );
      case ViewState.READING:
        // Use all unlimited items to find specific target words
        const allDueItemsUnlimited = getDueItems(srsState || [], -1);
        const dueIds = allDueItemsUnlimited.slice(0, 5).map(i => i.id);
        
        return (
          <ReadingGenerator 
            vocab={vocab}
            srsState={srsState}
            dueWordIds={dueIds}
            userLevel={student.hskLevel}
            onComplete={() => setView(ViewState.DASHBOARD)}
            onTaskComplete={() => handleTaskCompletion('reading')}
            onStartSpeaking={(passage) => {
                handleTaskCompletion('reading');
                setCurrentReadingPassage(passage);
                setView(ViewState.SPEAKING);
            }}
          />
        );
      case ViewState.SPEAKING:
        const speakingDueIds = getDueItems(srsState || [], -1).slice(0, 5).map(i => i.id);
        return (
            <SpeakingPractice
                vocab={vocab}
                dueWordIds={speakingDueIds}
                userLevel={student.hskLevel}
                initialPassage={currentReadingPassage}
                onTaskComplete={(feedback) => {
                    // Pass the accuracy score if available, otherwise default handled in function
                    const score = feedback ? feedback.score : 0;
                    handleTaskCompletion('speaking', score);
                    handleTaskCompletion('reading'); // Usually follows reading
                }}
                onComplete={() => {
                    setCurrentReadingPassage(null);
                    setView(ViewState.DASHBOARD);
                }}
            />
        );
      case ViewState.TEACHER:
        return (
            <TeacherDashboard 
                srsState={srsState || []} 
                vocab={vocab} 
                student={student} 
                onBack={() => setView(ViewState.DASHBOARD)}
            />
        );
      case ViewState.IMPORT:
        return (
          <FileImporter 
            onImport={handleImportWords}
            onCancel={() => setView(ViewState.DASHBOARD)}
          />
        );
      case ViewState.DASHBOARD:
      default:
        return (
          <div className="p-6 flex flex-col items-center justify-center h-full space-y-6 max-w-md mx-auto w-full overflow-y-auto no-scrollbar">
            <div className="w-full mb-2">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-serif font-bold text-ink-black">Mandarin Flow</h1>
                    {/* Tiny Streak Indicator for Mobile Header */}
                    <div className="flex items-center gap-1 bg-orange-50 px-2 py-1 rounded-lg">
                        <span className="text-sm">🔥</span>
                        <span className="text-sm font-bold text-orange-600">{student.streakDays}</span>
                    </div>
                </div>

                {/* DUAL METRIC SYSTEM */}
                <div className="grid grid-cols-2 gap-4 mb-8">
                    
                    {/* Metric A: HSK Level (The Truth) */}
                    <div className="bg-ink-black text-white p-5 rounded-2xl shadow-lg relative overflow-hidden flex flex-col justify-between h-36">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Proficiency</p>
                            <p className="text-3xl font-serif font-bold">HSK {student.hskLevel}</p>
                        </div>
                        <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Mastery</span>
                                <span>{levelStats.percentage}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div 
                                    className="bg-bamboo-green h-1.5 rounded-full transition-all duration-500" 
                                    style={{ width: `${levelStats.percentage}%` }}
                                ></div>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-1">
                                {levelStats.masteredCount} / {levelStats.totalRequired} words
                            </p>
                        </div>
                    </div>

                    {/* Metric B: XP (The Ego) */}
                    <div className="bg-white border border-gray-100 p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between h-36">
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Rank</p>
                            <p className="text-xl font-bold text-china-red truncate">{xpRank}</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-800">{student.xp.toLocaleString()}</p>
                            <p className="text-xs text-gray-400 mt-1">Total XP</p>
                        </div>
                    </div>
                </div>

                {/* Daily Goals Checklist */}
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Today's Goals</h3>
                    <div className="space-y-3">
                        <ChecklistItem 
                            label={`Review Flashcards (${reviewsDoneToday}/${DAILY_GOAL})`}
                            completed={!!student.dailyProgress?.flashcards}
                            onClick={() => setView(ViewState.FLASHCARDS)}
                        />
                        <ChecklistItem 
                            label="Daily Reading" 
                            completed={!!student.dailyProgress?.reading}
                            onClick={() => setView(ViewState.READING)}
                        />
                        <ChecklistItem 
                            label="Speaking Practice" 
                            completed={!!student.dailyProgress?.speaking}
                            onClick={() => setView(ViewState.SPEAKING)}
                        />
                    </div>
                </div>

                {/* Main Action - Logic based on what's next */}
                <div className="mb-8">
                    {dueCount > 0 ? (
                        <button 
                            onClick={() => setView(ViewState.FLASHCARDS)}
                            className="w-full bg-china-red text-white py-4 rounded-2xl shadow-lg hover:bg-red-700 transition transform active:scale-95 flex items-center justify-center gap-3"
                        >
                            <span className="text-2xl font-bold">{Math.min(dueCount, SESSION_BATCH_SIZE)}</span>
                            <div className="text-left leading-tight">
                                <span className="block font-bold">Cards Due</span>
                                <span className="text-xs opacity-80">Start Review Session</span>
                            </div>
                        </button>
                    ) : !student.dailyProgress?.reading ? (
                         <button 
                            onClick={() => setView(ViewState.READING)}
                            className="w-full bg-ink-black text-white py-4 rounded-2xl shadow-lg hover:bg-gray-800 transition transform active:scale-95 flex items-center justify-center gap-3"
                        >
                            <div className="text-left leading-tight">
                                <span className="block font-bold">Start Daily Reading</span>
                                <span className="text-xs opacity-80">Continue your streak</span>
                            </div>
                        </button>
                    ) : (
                        <div className="w-full bg-white border border-gray-200 py-4 rounded-2xl shadow-sm flex items-center justify-center gap-2 text-gray-500">
                             <span className="font-bold">Good progress today!</span>
                        </div>
                    )}
                </div>

                {/* Secondary Actions */}
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => setView(ViewState.TEACHER)}
                        className="p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition text-left group"
                    >
                        <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                        </div>
                        <span className="font-bold text-gray-800">Stats</span>
                    </button>

                    <button 
                        onClick={() => setView(ViewState.IMPORT)}
                        className="p-4 bg-gray-50 border border-gray-200 border-dashed rounded-xl hover:bg-gray-100 transition flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-800"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        <span className="text-xs font-bold">Import Words</span>
                    </button>
                </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen w-full bg-paper-bg overflow-hidden relative">
      {renderContent()}
    </div>
  );
};

export default App;