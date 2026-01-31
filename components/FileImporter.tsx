import React, { useState, useRef } from 'react';
import { Vocabulary } from '../types';
import { getHSKLevel } from '../services/hskData';

interface Props {
  onImport: (newWords: Vocabulary[]) => void;
  onCancel: () => void;
}

type ImportStep = 'UPLOAD' | 'PASTE' | 'MAPPING' | 'SUCCESS';

interface ColumnMapping {
  hanzi: number;
  pinyin: number;
  meaning: number;
  tags: number;
  level: number;
}

const FileImporter: React.FC<Props> = ({ onImport, onCancel }) => {
  const [step, setStep] = useState<ImportStep>('UPLOAD');
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [pastedText, setPastedText] = useState('');
  
  // CSV Data State
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ hanzi: -1, pinyin: -1, meaning: -1, tags: -1, level: -1 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseTextToRows = (text: string) => {
     // 1. Smarter Delimiter Detection
    const sampleLines = text.split(/\r?\n/).slice(0, 5).join('\n');
    let inQuotes = false;
    let commaCount = 0;
    let tabCount = 0;
    let semiCount = 0;

    for (let i = 0; i < sampleLines.length; i++) {
        const char = sampleLines[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (!inQuotes) {
            if (char === ',') commaCount++;
            else if (char === '\t') tabCount++;
            else if (char === ';') semiCount++;
        }
    }
    
    let delimiter = ',';
    if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
    else if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';

    // 2. State Machine Parser
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let parsingQuotes = false; 
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1]; 
        
        if (parsingQuotes) {
            if (char === '"' && nextChar === '"') {
                currentCell += '"';
                i++; 
            } else if (char === '"') {
                parsingQuotes = false;
            } else {
                currentCell += char;
            }
        } else {
            if (char === '"') {
                parsingQuotes = true;
            } else if (char === delimiter) {
                currentRow.push(currentCell.trim()); 
                currentCell = '';
            } else if (char === '\r' || char === '\n') {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                currentRow.push(currentCell.trim());
                rows.push(currentRow);
                currentRow = [];
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
    }
    
    if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
    }
    
    return rows.filter(r => r.some(c => c.length > 0));
  };

  const detectMapping = (rows: string[][]): ColumnMapping => {
      const mapping = { hanzi: -1, pinyin: -1, meaning: -1, tags: -1, level: -1 };
      const header = rows[0] || [];

      // 1. Header Keyword Analysis
      header.forEach((cell, index) => {
          const lower = cell.toLowerCase().trim();
          // Hanzi
          if (['hanzi', 'character', 'chinese', 'simplified', 'traditional', 'word', 'term', 'front', 'kanji'].some(k => lower.includes(k))) {
              if (mapping.hanzi === -1) mapping.hanzi = index;
          }
          // Pinyin
          if (['pinyin', 'pronunciation', 'reading', 'transliteration'].some(k => lower.includes(k))) {
              if (mapping.pinyin === -1) mapping.pinyin = index;
          }
          // Meaning
          if (['meaning', 'definition', 'english', 'translation', 'back', 'def'].some(k => lower.includes(k))) {
              if (mapping.meaning === -1) mapping.meaning = index;
          }
          // Tags
          if (['tag', 'category', 'label'].some(k => lower.includes(k))) {
              if (mapping.tags === -1) mapping.tags = index;
          }
          // Level
          if (['level', 'hsk', 'grade'].some(k => lower.includes(k))) {
              if (mapping.level === -1) mapping.level = index;
          }
      });

      // 2. Content Heuristics (if headers failed)
      // Check first 5 rows
      const sampleRows = rows.slice(0, 5);
      const scores = (rows[0] || []).map(() => ({ hanzi: 0, pinyin: 0, english: 0, number: 0 }));

      sampleRows.forEach(row => {
          row.forEach((cell, colIdx) => {
              if (!cell) return;
              if (scores[colIdx] === undefined) return; // safety

              // Hanzi Check: Contains Chinese characters
              if (/[\u4e00-\u9fa5]/.test(cell)) scores[colIdx].hanzi++;
              
              // Pinyin Check: Contains tone marks
              if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/.test(cell)) scores[colIdx].pinyin++;
              
              // Number Check: HSK level is usually a single digit integer
              if (/^[0-9]+$/.test(cell.trim()) && parseInt(cell) < 10) scores[colIdx].number++;
              
              // English/Meaning Check: ASCII letters, spaces, delimiters
              if (/^[a-zA-Z\s;,.]+$/.test(cell) && cell.length > 1) scores[colIdx].english++;
          });
      });

      const findBestColumn = (type: 'hanzi' | 'pinyin' | 'english' | 'number', fallbackSkip: number[] = []) => {
          let bestIdx = -1;
          let maxScore = 0;
          scores.forEach((score, idx) => {
              // Don't pick a column if it's already assigned or explicitly skipped
              if (Object.values(mapping).includes(idx) || fallbackSkip.includes(idx)) return;

              if (score[type] > maxScore) {
                  maxScore = score[type];
                  bestIdx = idx;
              }
          });
          return bestIdx;
      };

      // Fill in gaps based on content scores
      if (mapping.hanzi === -1) mapping.hanzi = findBestColumn('hanzi');
      if (mapping.pinyin === -1) mapping.pinyin = findBestColumn('pinyin');
      // For meaning, we prefer 'english' score
      if (mapping.meaning === -1) mapping.meaning = findBestColumn('english');
      // For level, we prefer 'number' score
      if (mapping.level === -1) mapping.level = findBestColumn('number');

      return mapping;
  };

  const handleParse = (text: string) => {
    const cleanedRows = parseTextToRows(text);

    if (cleanedRows.length === 0) {
      setError("Content appears to be empty or unreadable.");
      return;
    }

    setRawRows(cleanedRows);
    
    // Auto-detect mapping using smart logic
    const detectedMapping = detectMapping(cleanedRows);
    setMapping(detectedMapping);
    
    setStep('MAPPING');
    setError(null);
  };

  const parseXML = (text: string): Vocabulary[] => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check for Pleco format first (plecoflash) or generic items
    const plecoCards = xmlDoc.getElementsByTagName("card");
    const genericItems = xmlDoc.getElementsByTagName("item");
    
    const words: Vocabulary[] = [];

    // Strategy 1: Pleco XML
    if (plecoCards.length > 0) {
        for (let i = 0; i < plecoCards.length; i++) {
            const card = plecoCards[i];
            const entry = card.getElementsByTagName("entry")[0];
            if (!entry) continue;

            // Hanzi: look for headword with charset="sc" (Simplified)
            // If not found, use the first headword
            const headwords = entry.getElementsByTagName("headword");
            let hanzi = "";
            for(let h=0; h<headwords.length; h++) {
                if (headwords[h].getAttribute("charset") === "sc") {
                    hanzi = headwords[h].textContent || "";
                    break;
                }
            }
            if (!hanzi && headwords.length > 0) hanzi = headwords[0].textContent || "";

            // Pinyin
            const pinyin = entry.getElementsByTagName("pron")[0]?.textContent || "";

            // Meaning
            const meaning = entry.getElementsByTagName("defn")[0]?.textContent || "";

            // Tags & Level
            const catassigns = card.getElementsByTagName("catassign");
            const tags: string[] = [];
            let level: number | null = null;
            
            for(let c=0; c<catassigns.length; c++) {
                const cat = catassigns[c].getAttribute("category");
                if (cat) {
                    tags.push(cat);
                    // Extract HSK Level if present (e.g., "HSK 3.0/Level 1")
                    const hskMatch = cat.match(/HSK.*?(\d+)/i);
                    if (hskMatch) {
                        level = parseInt(hskMatch[1]);
                    }
                }
            }
            
            // Auto-detect level if not found
            if (!level && hanzi) {
                level = getHSKLevel(hanzi);
            }

            if (hanzi && (pinyin || meaning)) {
                words.push({
                    id: crypto.randomUUID(),
                    hanzi,
                    pinyin,
                    meaning,
                    level: level || 1,
                    tags
                });
            }
        }
    } 
    // Strategy 2: Generic XML (<item><hanzi>...</hanzi></item>)
    else if (genericItems.length > 0) {
        for (let i = 0; i < genericItems.length; i++) {
            const item = genericItems[i];
            const hanzi = item.getElementsByTagName("hanzi")[0]?.textContent;
            const pinyin = item.getElementsByTagName("pinyin")[0]?.textContent;
            const meaning = item.getElementsByTagName("meaning")[0]?.textContent;
            
            if (hanzi && pinyin && meaning) {
                const levelText = item.getElementsByTagName("level")[0]?.textContent;
                const tagsText = item.getElementsByTagName("tags")[0]?.textContent;
                
                let level = levelText ? parseInt(levelText) : null;
                if (!level && hanzi) {
                    level = getHSKLevel(hanzi);
                }

                words.push({
                    id: crypto.randomUUID(),
                    hanzi,
                    pinyin,
                    meaning,
                    level: level || 1,
                    tags: tagsText ? tagsText.split(',').map(t => t.trim()) : []
                });
            }
        }
    }

    return words;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null); // Clear previous errors

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        if (file.name.toLowerCase().endsWith('.csv')) {
          handleParse(text);
        } else if (file.name.toLowerCase().endsWith('.xml')) {
          const words = parseXML(text);
          if (words.length === 0) {
             setError("No valid words found in XML file.");
             return;
          }

          // Transform for Preview: Convert parsed objects back to "rows"
          const headers = ["Hanzi", "Pinyin", "Meaning", "Level", "Tags"];
          const rows = words.map(w => [
            w.hanzi,
            w.pinyin,
            w.meaning,
            w.level.toString(),
            w.tags.join(', ')
          ]);
          
          setRawRows([headers, ...rows]);
          
          // Set mapping manually since we know the structure we just created
          setMapping({ hanzi: 0, pinyin: 1, meaning: 2, level: 3, tags: 4 });
          setStep('MAPPING');
          setError(null);
        } else {
          setError("Unsupported file type. Please use .csv or .xml");
        }
      } catch (err) {
        setError("Failed to parse file. Please check the format.");
        console.error(err);
      }
    };
    reader.onerror = () => {
        setError("Error reading file. Please try again.");
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const updateMapping = (field: keyof ColumnMapping, index: number) => {
    setMapping(prev => ({ ...prev, [field]: index }));
  };

  const finalizeCSVImport = () => {
    if (mapping.hanzi === -1 || mapping.pinyin === -1 || mapping.meaning === -1) {
      setError("Please map at least Hanzi, Pinyin, and Meaning columns.");
      return;
    }

    const words: Vocabulary[] = [];
    
    // Heuristic: If row 0 contains "Hanzi" or "Character" in the hanzi column, skip it
    let startIndex = 0;
    if (rawRows.length > 0) {
      const firstRowHanzi = rawRows[0][mapping.hanzi];
      // A more robust check: does the first row look like a header compared to the second?
      const isHeaderRow = ['hanzi', 'character', 'chinese', 'term'].some(k => 
        firstRowHanzi && firstRowHanzi.toLowerCase().includes(k)
      );
      if (isHeaderRow) {
        startIndex = 1;
      }
    }

    for (let i = startIndex; i < rawRows.length; i++) {
      const row = rawRows[i];
      const hanzi = row[mapping.hanzi];
      const pinyin = row[mapping.pinyin];
      const meaning = row[mapping.meaning];
      
      if (!hanzi || !pinyin || !meaning) continue;

      const tags = mapping.tags > -1 ? row[mapping.tags] : "";
      
      let level = mapping.level > -1 ? parseInt(row[mapping.level]) : null;
      // Auto-detect level if missing
      if (!level || isNaN(level)) {
        level = getHSKLevel(hanzi.trim());
      }

      words.push({
        id: crypto.randomUUID(),
        hanzi: hanzi.trim(),
        pinyin: pinyin.trim(),
        meaning: meaning.trim(),
        tags: tags ? tags.split(/[;,]/).map(t => t.trim()).filter(t => t) : [],
        level: level || 1,
      });
    }

    finalizeImport(words);
  };

  const finalizeImport = (words: Vocabulary[]) => {
    if (words.length === 0) {
      setError("No valid words found in the file.");
      return;
    }
    onImport(words);
    setSuccessCount(words.length);
    setStep('SUCCESS');
    setError(null);
  };

  // --- RENDER ---

  if (step === 'SUCCESS' && successCount !== null) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce shadow-sm">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h2 className="text-3xl font-serif font-bold mb-2 text-ink-black">Import Successful!</h2>
        <p className="text-gray-500 mb-8 text-lg">You have added <span className="font-bold text-bamboo-green">{successCount}</span> new words.</p>
        <button 
          onClick={onCancel}
          className="bg-ink-black text-white px-8 py-3 rounded-2xl font-bold shadow-lg hover:bg-gray-800 transition transform hover:scale-105 active:scale-95"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (step === 'MAPPING') {
    const columnOptions = rawRows[0]?.map((_, index) => {
        const sample = rawRows[0][index];
        const displaySample = sample.length > 20 ? sample.substring(0, 20) + '...' : sample;
        return {
            value: index,
            label: `Column ${index + 1}: ${displaySample}`
        };
    }) || [];

    const SelectInput = ({ 
        label, 
        value, 
        onChange, 
        required,
        note
    }: { 
        label: string, 
        value: number, 
        onChange: (val: number) => void, 
        required?: boolean,
        note?: string
    }) => (
        <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-900">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className={`w-full appearance-none border text-gray-900 text-sm rounded-lg focus:ring-bamboo-green focus:border-bamboo-green block p-3 pr-8 shadow-sm transition-colors hover:bg-gray-50 focus:bg-white ${value === -1 ? 'border-gray-300 bg-gray-50' : 'border-bamboo-green bg-green-50/30'}`}
                >
                    <option value={-1}>Select column...</option>
                    {columnOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
            </div>
            {note && <p className="text-xs text-gray-400 italic">{note}</p>}
        </div>
    );

    return (
      <div className="flex flex-col h-full p-6 max-w-5xl mx-auto w-full">
        <div className="mb-6">
          <h2 className="text-2xl font-serif font-bold text-ink-black">Map Columns</h2>
          <p className="text-gray-500">We've tried to auto-detect your columns. Please verify.</p>
        </div>

        {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 flex justify-between items-center animate-fade-in">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold ml-4">
                    Dismiss
                </button>
            </div>
        )}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <SelectInput 
                    label="Character (汉字)" 
                    value={mapping.hanzi} 
                    onChange={(v) => updateMapping('hanzi', v)} 
                    required 
                />
                <SelectInput 
                    label="Pinyin" 
                    value={mapping.pinyin} 
                    onChange={(v) => updateMapping('pinyin', v)} 
                    required 
                />
                <SelectInput 
                    label="English Meaning" 
                    value={mapping.meaning} 
                    onChange={(v) => updateMapping('meaning', v)} 
                    required 
                />
                <SelectInput 
                    label="HSK Level" 
                    value={mapping.level} 
                    onChange={(v) => updateMapping('level', v)} 
                    note="We'll try to auto-detect if left blank."
                />
                <SelectInput 
                    label="Tags" 
                    value={mapping.tags} 
                    onChange={(v) => updateMapping('tags', v)} 
                />
            </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-hidden flex flex-col border border-gray-200 rounded-2xl bg-white shadow-sm">
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide">Data Preview</h3>
                <span className="text-xs text-gray-500 font-mono">Showing first 5 rows</span>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50/30">
                <table className="min-w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white sticky top-0 z-10 shadow-sm">
                        <tr>
                            {rawRows[0]?.map((_, index) => (
                                <th key={index} className="px-6 py-3 font-semibold text-gray-500 border-b border-gray-100 text-xs uppercase tracking-wider">
                                    Col {index + 1}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {rawRows.slice(0, 5).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-gray-50 transition-colors">
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="px-6 py-3 text-gray-600 font-mono text-xs">
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        <div className="mt-6 flex gap-4 justify-end">
            <button 
                onClick={() => setStep('UPLOAD')}
                className="px-6 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
            >
                Cancel
            </button>
            <button 
                onClick={finalizeCSVImport}
                className="px-8 py-3 bg-ink-black text-white rounded-xl font-bold hover:bg-gray-800 transition shadow-lg flex items-center gap-2"
            >
                Confirm Import
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </button>
        </div>
      </div>
    );
  }

  // PASTE STEP
  if (step === 'PASTE') {
      return (
        <div className="max-w-2xl mx-auto h-full flex flex-col justify-center p-6">
            <h2 className="text-2xl font-serif font-bold text-ink-black mb-2">Paste Vocabulary</h2>
            <p className="text-gray-500 text-sm mb-6">Paste your words (CSV format or Tab Separated).</p>
            
            {error && (
                <div className="mb-4 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-200 flex justify-between items-center animate-fade-in">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold ml-4">
                        Try Again
                    </button>
                </div>
            )}

            <textarea
                className="w-full h-64 p-4 border border-gray-300 rounded-xl font-mono text-sm focus:ring-2 focus:ring-china-red outline-none resize-none mb-6"
                placeholder={`Character, Pinyin, Meaning\n你好, nǐ hǎo, Hello\n...`}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
            />

            <div className="flex gap-4 justify-end">
                <button 
                    onClick={() => setStep('UPLOAD')}
                    className="px-6 py-3 border border-gray-300 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                >
                    Back
                </button>
                <button 
                    onClick={() => handleParse(pastedText)}
                    className="px-8 py-3 bg-ink-black text-white rounded-xl font-bold hover:bg-gray-800 transition shadow-lg"
                    disabled={!pastedText.trim()}
                >
                    Process Text
                </button>
            </div>
        </div>
      );
  }

  // UPLOAD STEP (Default)
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 relative">
      <button 
        onClick={onCancel}
        className="absolute top-8 left-6 text-gray-400 hover:text-ink-black transition p-2"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
      </button>

      <div className="w-full max-w-md flex flex-col">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-serif font-bold text-ink-black mb-2">Import Vocabulary</h2>
          <p className="text-gray-500 text-sm">Upload a CSV/XML file or paste text directly.</p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 border-dashed relative hover:border-china-red transition-colors group mb-4">
          <input 
            type="file" 
            ref={fileInputRef}
            accept=".csv,.xml"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="flex flex-col items-center pointer-events-none">
            <svg className="w-12 h-12 text-gray-300 mb-4 group-hover:text-china-red transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
            </svg>
            <p className="text-gray-600 font-medium">Click to upload file</p>
            <p className="text-xs text-gray-400 mt-2">.CSV or .XML files supported</p>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="h-px bg-gray-200 flex-1"></div>
          <span className="text-gray-400 text-xs uppercase">Or</span>
          <div className="h-px bg-gray-200 flex-1"></div>
        </div>

        <button 
          onClick={() => setStep('PASTE')}
          className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 font-bold rounded-xl border border-gray-200 transition"
        >
          Paste Text
        </button>

        {error && (
          <div className="mt-4 p-4 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 text-center animate-fade-in flex flex-col gap-2">
            <p>{error}</p>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800 font-bold underline">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileImporter;