import React, { useState, useEffect, useRef } from 'react';
import { Vocabulary, ReadingPassage, PronunciationFeedback } from '../types';
import { generateReadingPassage, analyzePronunciation } from '../services/geminiService';

interface Props {
  vocab: Vocabulary[];
  dueWordIds: string[];
  userLevel: number;
  initialPassage?: ReadingPassage | null; // Passed from ReadingGenerator
  onComplete: () => void;
  onTaskComplete?: (feedback?: PronunciationFeedback | null) => void;
}

const SpeakingPractice: React.FC<Props> = ({ vocab, dueWordIds, userLevel, initialPassage, onComplete, onTaskComplete }) => {
  const [passage, setPassage] = useState<ReadingPassage | null>(initialPassage || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [feedback, setFeedback] = useState<PronunciationFeedback | null>(null);
  
  // Display Toggles
  const [showPinyin, setShowPinyin] = useState(false);
  const [showTranslation, setShowTranslation] = useState(false);
  
  // Refs
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Critical: Use Ref to track transcript without stale closures in callbacks
  const transcriptRef = useRef('');

  // If no initial passage, generate a short one for speaking practice
  useEffect(() => {
    if (!passage) {
        generateNewPassage();
    }
  }, []);

  // Setup Recording & STT
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'zh-CN';

      recognitionRef.current.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript;
          } else {
            interimChunk += event.results[i][0].transcript;
          }
        }

        // We only append finalized text to our persistent ref to avoid duplication
        // The display logic (setTranscript) shows both so the user sees immediate feedback
        if (finalChunk) {
            transcriptRef.current += finalChunk;
        }

        setTranscript(transcriptRef.current + interimChunk);
      };
      
      recognitionRef.current.onerror = (event: any) => {
          console.warn("Speech Recognition Error:", event.error);
          if (event.error === 'not-allowed') {
              setError("Microphone access denied. Please allow permissions.");
          }
      };
    } else {
        setError("Speech recognition is not supported in this browser.");
    }

    return () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const generateNewPassage = async () => {
    setLoading(true);
    setFeedback(null);
    setTranscript('');
    transcriptRef.current = ''; // Reset ref
    setAudioUrl(null);
    setError(null);
    try {
        const shuffle = <T,>(array: T[]): T[] => [...array].sort(() => Math.random() - 0.5);

        const dueWords = vocab.filter(v => dueWordIds.includes(v.id));
        const otherWords = vocab.filter(v => !dueWordIds.includes(v.id));
        
        const targetWords = [...shuffle(dueWords)];
        if (targetWords.length < 3 && otherWords.length > 0) {
            targetWords.push(...shuffle(otherWords).slice(0, 3 - targetWords.length));
        }
        
        // Generate a very short passage for speaking
        const generated = await generateReadingPassage(targetWords.slice(0, 3), [], userLevel);
        setPassage(generated);
    } catch (e: any) {
        console.error(e);
        setError(e.message || "Failed to generate text. Please try again.");
    } finally {
        setLoading(false);
    }
  };

  const startRecording = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          
          // Start MediaRecorder (Audio Blob)
          mediaRecorderRef.current = new MediaRecorder(stream);
          chunksRef.current = [];
          mediaRecorderRef.current.ondataavailable = (e) => {
              if (e.data.size > 0) chunksRef.current.push(e.data);
          };
          mediaRecorderRef.current.onstop = () => {
              const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
              const url = URL.createObjectURL(blob);
              setAudioUrl(url);
          };
          mediaRecorderRef.current.start();

          // Start Speech Recognition (Transcript)
          setTranscript('');
          transcriptRef.current = '';
          setFeedback(null);
          setError(null);
          recognitionRef.current?.start();
          
          setIsRecording(true);
      } catch (err) {
          console.error(err);
          setError("Could not access microphone. Please check settings.");
      }
  };

  const stopRecording = async () => {
      if (!isRecording) return;
      
      // Stop Recorders
      mediaRecorderRef.current?.stop();
      try {
        recognitionRef.current?.stop();
      } catch(e) {
          // Ignore errors if already stopped
      }
      
      setIsRecording(false);

      if (!passage) return;

      // Small delay to allow final STT results to settle in the Ref
      setLoading(true);
      setTimeout(async () => {
        try {
            // Read directly from Ref to ensure we get the latest data, ignoring closure staleness
            // Fallback: If ref is empty but 'transcript' state has content (interim), use that.
            const finalTranscript = transcriptRef.current || transcript;

            if (!finalTranscript) {
                 console.warn("No transcript captured via STT.");
            }

            const textToSend = finalTranscript.trim() || "(No speech detected)";
            
            const result = await analyzePronunciation(passage.content, textToSend);
            
            // Check if result returned an empty object/error state (e.g. quota limit)
            if (!result.score && result.feedbackText && result.feedbackText.includes("Could not analyze")) {
                 setError("Analysis failed or service unavailable.");
            } else {
                 setFeedback(result);
            }
            
            // We do NOT auto-complete task here anymore, user must click Done
        } catch(e: any) {
            console.error("Analysis failed", e);
            setError(e.message || "Analysis failed. Please try again.");
        } finally {
            setLoading(false);
        }
      }, 1500); // Slightly increased delay for better finalization
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  // Text-to-Speech Helper
  const playReferenceAudio = (text: string) => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Stop current
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.8; // Slightly slower for clarity
        window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle Component
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

  const WordList = ({ title, words, type }: { title: string, words: string[], type: 'good' | 'bad' }) => {
      if (!words || words.length === 0) return null;
      return (
          <div className="flex-1 min-w-[140px]">
              <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${type === 'good' ? 'text-bamboo-green' : 'text-china-red'}`}>
                  {title}
              </h4>
              <ul className="space-y-2">
                  {words.map((w, i) => (
                      <li key={i} className="flex items-center justify-between bg-white border border-gray-100 p-2 rounded-lg shadow-sm">
                          <span className="font-serif text-lg text-ink-black">{w}</span>
                          <button 
                            onClick={() => playReferenceAudio(w)}
                            className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-ink-black transition"
                            title="Play Reference Pronunciation"
                          >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                          </button>
                      </li>
                  ))}
              </ul>
          </div>
      );
  };

  const handleDone = () => {
      if (onTaskComplete) onTaskComplete(feedback);
      onComplete();
  };

  if (loading && !passage) {
     return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-china-red mb-4"></div>
        <p className="text-gray-500 animate-pulse">Preparing speaking practice...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto p-6 h-full overflow-y-auto no-scrollbar flex flex-col">
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 self-start md:self-auto">
                <button onClick={onComplete} className="text-gray-400 hover:text-ink-black transition mr-1">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </button>
                <h2 className="text-2xl font-serif font-bold text-ink-black">Speaking Practice</h2>
            </div>
            
            <div className="flex items-center gap-4 self-end md:self-auto">
                <div className="flex gap-2">
                    <Toggle label="Pinyin" active={showPinyin} onToggle={() => setShowPinyin(!showPinyin)} />
                    <Toggle label="Translation" active={showTranslation} onToggle={() => setShowTranslation(!showTranslation)} />
                </div>
            </div>
        </div>

        {passage && (
            <div className="flex-1 flex flex-col gap-6">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex-grow-0 transition-all duration-300">
                    <div className="flex items-start gap-4">
                        <button 
                            onClick={() => playReferenceAudio(passage.content)}
                            className="mt-1 w-10 h-10 flex-shrink-0 rounded-full bg-gray-50 hover:bg-china-red hover:text-white flex items-center justify-center text-gray-400 transition"
                            title="Listen to full passage"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path></svg>
                        </button>
                        <h3 className="text-2xl font-serif leading-relaxed text-ink-black">{passage.content}</h3>
                    </div>
                    
                    {showPinyin && (
                        <div className="mt-6 text-center text-gray-500 font-medium text-lg leading-relaxed animate-fade-in border-t border-gray-50 pt-4">
                            {passage.pinyin}
                        </div>
                    )}
                    
                    {showTranslation && (
                        <div className="mt-6 pt-4 border-t border-gray-100 text-center text-gray-500 italic text-sm animate-fade-in">
                            {passage.translation}
                        </div>
                    )}
                </div>

                <div className="bg-paper-bg p-6 rounded-2xl border border-gray-200 flex flex-col items-center justify-center relative overflow-hidden">
                    
                    {loading && isRecording === false && (
                         <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center">
                             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-china-red"></div>
                         </div>
                    )}

                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 cursor-pointer transition-all duration-300 shadow-xl ${isRecording ? 'bg-red-500 scale-110 ring-4 ring-red-200' : 'bg-ink-black hover:bg-gray-800'}`} onClick={toggleRecording}>
                         {isRecording ? (
                            <div className="w-8 h-8 bg-white rounded-sm animate-pulse" />
                        ) : (
                            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
                        )}
                    </div>
                    
                    <p className={`text-sm font-bold mb-4 ${isRecording ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                        {isRecording ? 'Listening... Read the text above.' : 'Tap mic to start recording'}
                    </p>
                    
                     {/* Live Transcript Feedback */}
                     {transcript && isRecording && (
                        <div className="w-full p-4 bg-white rounded-xl border border-gray-200 text-center text-gray-600 italic mb-4 animate-fade-in">
                            "{transcript}"
                        </div>
                    )}
                    
                    {/* Feedback Section */}
                    {feedback && (
                        <div className="w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in mt-2">
                            {/* Score Header */}
                            <div className="bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <span className="text-3xl font-bold text-ink-black">{feedback.score}%</span>
                                    <span className="text-xs text-gray-500 ml-2 uppercase tracking-wide">Accuracy Score</span>
                                </div>
                                {audioUrl && (
                                    <audio controls src={audioUrl} className="h-8 w-32" />
                                )}
                            </div>
                            
                            <div className="p-4">
                                <p className="text-sm text-gray-700 italic mb-6">"{feedback.feedbackText}"</p>
                                
                                <div className="flex flex-wrap gap-6">
                                    <WordList title="Great Pronunciation" words={feedback.bestWords} type="good" />
                                    <WordList title="Needs Practice" words={[...feedback.mispronouncedWords, ...feedback.missingWords]} type="bad" />
                                </div>
                            </div>
                        </div>
                    )}

                     {error && (
                        <div className="w-full text-center text-red-500 text-sm mt-2">
                            {error}
                        </div>
                    )}
                </div>

                <div className="mt-auto space-y-3">
                    <button 
                        onClick={generateNewPassage}
                        className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition"
                    >
                        Get New Paragraph
                    </button>
                    <button 
                        onClick={handleDone}
                        className="w-full bg-ink-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition shadow-lg"
                    >
                        Done
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default SpeakingPractice;