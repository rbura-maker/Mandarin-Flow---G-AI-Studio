import React from 'react';
import { SRSState, Vocabulary, StudentProfile } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  srsState: SRSState[];
  vocab: Vocabulary[];
  student: StudentProfile;
  onBack: () => void;
}

const TeacherDashboard: React.FC<Props> = ({ srsState, vocab, student, onBack }) => {
  
  // Calculate stats
  const totalReviews = srsState.reduce((acc, curr) => acc + curr.reviews, 0);
  const learnedCount = srsState.filter(s => s.interval > 21).length; // Mature cards
  const learningCount = srsState.filter(s => s.interval > 0 && s.interval <= 21).length;
  
  // Find "Hotspots" (words with high lapses)
  const troubleWords = srsState
    .filter(s => s.lapses > 0)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, 5)
    .map(s => {
        const v = vocab.find(w => w.id === s.id);
        return { name: v?.hanzi || '?', lapses: s.lapses };
    });

  // Find Words Reviewed Today
  const getStartOfDay = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  };
  const startOfDay = getStartOfDay();
  
  const reviewedToday = srsState
    .filter(s => s.lastReview && s.lastReview >= startOfDay)
    .sort((a, b) => (b.lastReview || 0) - (a.lastReview || 0));

  const progressData = [
    { name: 'New', value: srsState.filter(s => s.interval === 0).length, color: '#9CA3AF' },
    { name: 'Learning', value: learningCount, color: '#D32F2F' },
    { name: 'Learned', value: learnedCount, color: '#388E3C' },
  ];

  return (
    <div className="p-6 h-full overflow-y-auto no-scrollbar">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-ink-black transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </button>
        <h2 className="text-2xl font-bold text-ink-black">Teacher Dashboard</h2>
      </div>

      {/* Student Profile Card */}
      <div className="bg-ink-black text-white p-6 rounded-2xl shadow-lg mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
            <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14l9-5-9-5-9 5 9 5z"/><path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222"/></svg>
        </div>
        <div className="relative z-10">
            <h3 className="text-gray-300 text-sm font-bold uppercase tracking-wider mb-2">Student Profile</h3>
            <div className="flex items-end gap-2 mb-4">
                <span className="text-5xl font-serif font-bold">HSK {student.hskLevel}</span>
            </div>
            <div className="flex gap-6 text-sm font-medium">
                <div className="flex items-center gap-2">
                    <span className="bg-white/20 px-2 py-1 rounded">{student.xp} XP</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-orange-300">🔥 {student.streakDays} Day Streak</span>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Total Reviews</p>
            <p className="text-3xl font-bold text-china-red">{totalReviews}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <p className="text-gray-500 text-sm">Words Mastered</p>
            <p className="text-3xl font-bold text-bamboo-green">{learnedCount}</p>
        </div>
      </div>

      <div className="mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-64">
        <h3 className="text-sm font-bold text-gray-500 mb-4">Vocabulary Maturity</h3>
        <ResponsiveContainer width="100%" height="100%">
            <BarChart data={progressData}>
                <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={40}>
                    {progressData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Trouble Words */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Trouble Words</h3>
            {troubleWords.length === 0 ? (
                <p className="text-sm text-gray-400">No trouble words yet! Keep studying.</p>
            ) : (
                <ul className="space-y-3">
                    {troubleWords.map((w, i) => (
                        <li key={i} className="flex justify-between items-center">
                            <span className="text-lg font-serif">{w.name}</span>
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">{w.lapses} lapses</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>

        {/* Reviewed Today */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Reviewed Today</h3>
                <span className="text-xs text-bamboo-green font-bold bg-green-50 px-2 py-1 rounded-full">{reviewedToday.length}</span>
            </div>
            
            {reviewedToday.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No reviews yet today. Start a session!</p>
            ) : (
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 no-scrollbar">
                    {reviewedToday.map((s, i) => {
                        const word = vocab.find(v => v.id === s.id);
                        if (!word) return null;
                        return (
                            <div key={i} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col justify-center">
                                <span className="font-serif font-bold text-ink-black text-lg leading-tight">{word.hanzi}</span>
                                <span className="text-xs text-gray-500">{word.pinyin}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;