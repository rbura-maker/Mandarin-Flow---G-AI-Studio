import { GoogleGenAI, Type } from "@google/genai";
import { Vocabulary, ReadingPassage, PronunciationFeedback } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const MODEL_NAME = 'gemini-3-flash-preview';

const handleGeminiError = (error: any) => {
  console.error("Gemini API Error details:", error);
  
  const status = error?.status || error?.error?.status;
  const code = error?.code || error?.error?.code;
  const message = error?.message || error?.error?.message || JSON.stringify(error);

  if (
    status === 429 || 
    code === 429 || 
    status === 'RESOURCE_EXHAUSTED' || 
    (typeof message === 'string' && message.includes('RESOURCE_EXHAUSTED'))
  ) {
    throw new Error("Daily AI usage limit reached. Please try again later.");
  }
  
  throw new Error("Unable to connect to AI service. Please try again.");
};

// Unified One-Shot Generation
export const generateReadingPassage = async (
    targetWords: Vocabulary[],
    otherWords: Vocabulary[],
    hskLevel: number = 2
  ): Promise<ReadingPassage> => {
    
    try {
      const effectiveTargetWords = targetWords.length > 0 
        ? targetWords 
        : [{ id: 'demo', hanzi: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', level: 1, tags: [] }];
  
      const wordList = effectiveTargetWords.map(w => `${w.hanzi} (${w.meaning})`).join(', ');
      
      // LOGIC FIX: Resolve conflict between User Level and Target Word Level
      // If user is HSK 1 but studying HSK 5 words, generate HSK 5 content so the words fit naturally.
      const maxWordLevel = effectiveTargetWords.reduce((max, w) => Math.max(max, w.level || 1), 1);
      const effectiveLevel = Math.max(hskLevel, maxWordLevel);

      const isAdvanced = effectiveLevel > 2;
      const langInstruction = isAdvanced 
        ? "Questions must be in Chinese." 
        : "Questions must be in English.";
  
      const prompt = `
        Write a short Mandarin story (HSK ${effectiveLevel}).
        
        Constraints:
        1. STRICTLY include these words: ${wordList}.
        2. Length: 100-150 characters.
        3. Output a natural English translation.
        4. Create 3 reading comprehension questions (${langInstruction}).
        5. Break text into lines.
        6. Break lines into TOKENS (not just words).
           - Tokens must include ALL characters: Words, Punctuation (，。？！), and Numbers.
           - Every character in the "content" must appear in a token.
           - For punctuation tokens, strictly set "pinyin" to an empty string "".
        
        Output JSON with title, content, pinyin, translation, lines, and questions.
      `;
  
      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              pinyin: { type: Type.STRING },
              translation: { type: Type.STRING },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    hanzi: { type: Type.STRING },
                    pinyin: { type: Type.STRING },
                    words: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          hanzi: { type: Type.STRING },
                          pinyin: { type: Type.STRING }
                        },
                        required: ["hanzi", "pinyin"]
                      }
                    }
                  },
                  required: ["hanzi", "pinyin", "words"]
                }
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER }
                  },
                  required: ["question", "options", "correctIndex"]
                }
              }
            },
            required: ["title", "content", "pinyin", "translation", "lines", "questions"]
          }
        }
      });
  
      if (!response.text) throw new Error("No response from Gemini");
      
      let cleanText = response.text.trim().replace(/^```(?:json)?\s*|```\s*$/g, "");
      const data = JSON.parse(cleanText);
      
      return {
        ...data,
        targetWordIds: effectiveTargetWords.map(w => w.id),
      };
    } catch (error) {
      handleGeminiError(error);
      throw error;
    }
};

// Deprecated separate functions (kept empty or redirecting if needed, but safe to remove logic)
export const generateStoryBase = async (targetWords: Vocabulary[], otherWords: Vocabulary[], hskLevel: number) => {
    return generateReadingPassage(targetWords, otherWords, hskLevel);
};

export const generateStoryMetadata = async (content: string, hskLevel: number) => {
    return {};
};

export const analyzePronunciation = async (
  targetText: string,
  userTranscript: string
): Promise<PronunciationFeedback> => {
  
  try {
    const prompt = `
      I am a Mandarin student.
      Target Text: "${targetText}"
      My Transcript (from Speech-to-Text): "${userTranscript}"
      
      Compare my transcript to the target text. 
      1. Did I miss any words? 
      2. Did I say words that aren't there?
      3. Are there homophones that suggest a tone mistake? (e.g. Mai vs Mai)
      
      Provide a score (0-100) based on accuracy.
      Provide constructive feedback text (max 2 sentences).
      List up to 5 specific mispronounced words.
      List up to 5 words that were pronounced clearly and correctly ("bestWords").
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            accuracy: { type: Type.INTEGER },
            feedbackText: { type: Type.STRING },
            mispronouncedWords: { type: Type.ARRAY, items: { type: Type.STRING } },
            missingWords: { type: Type.ARRAY, items: { type: Type.STRING } },
            bestWords: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["score", "accuracy", "feedbackText", "mispronouncedWords", "missingWords", "bestWords"]
        }
      }
    });

    if (!response.text) throw new Error("No analysis from Gemini");
    
    let cleanText = response.text.trim().replace(/^```(?:json)?\s*|```\s*$/g, "");

    return JSON.parse(cleanText);
  } catch (error) {
    handleGeminiError(error);
    return {
        score: 0,
        accuracy: 0,
        feedbackText: "Could not analyze. Please try again.",
        mispronouncedWords: [],
        missingWords: [],
        bestWords: []
    };
  }
};