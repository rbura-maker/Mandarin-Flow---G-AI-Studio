import { Vocabulary, SRSState, StudentProfile } from '../types';
import { INITIAL_VOCABULARY, INITIAL_SRS_STATE } from '../constants';

const KEYS = {
  PROFILE: 'mandarin_flow_profile',
  VOCAB: 'mandarin_flow_vocab',
  SRS: 'mandarin_flow_srs'
};

export const dbService = {
    async fetchProfile(userId?: string): Promise<StudentProfile> {
        const stored = localStorage.getItem(KEYS.PROFILE);
        if (stored) return JSON.parse(stored);
        
        // Default Profile
        return {
            hskLevel: 1,
            xp: 0,
            streakDays: 0,
            lastStudyDate: 0
        };
    },

    async updateProfile(userId: string | undefined, profile: StudentProfile) {
        localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile));
    },

    async fetchUserData(userId?: string) {
        let vocab: Vocabulary[] = [];
        let srsState: SRSState[] = [];

        const storedVocab = localStorage.getItem(KEYS.VOCAB);
        const storedSRS = localStorage.getItem(KEYS.SRS);

        if (storedVocab && storedSRS) {
            vocab = JSON.parse(storedVocab);
            srsState = JSON.parse(storedSRS);
        } else {
            // Seed initial data if empty
            vocab = INITIAL_VOCABULARY;
            srsState = INITIAL_SRS_STATE;
            localStorage.setItem(KEYS.VOCAB, JSON.stringify(vocab));
            localStorage.setItem(KEYS.SRS, JSON.stringify(srsState));
        }

        return { vocab, srsState };
    },

    async updateSRSItem(userId: string | undefined, item: SRSState) {
        const storedSRS = localStorage.getItem(KEYS.SRS);
        if (!storedSRS) return;
        
        const srsList: SRSState[] = JSON.parse(storedSRS);
        const index = srsList.findIndex(s => s.id === item.id);
        
        if (index !== -1) {
            srsList[index] = item;
            localStorage.setItem(KEYS.SRS, JSON.stringify(srsList));
        }
    },

    async importWords(userId: string | undefined, newWords: Vocabulary[]) {
        // Get existing data
        const { vocab, srsState } = await this.fetchUserData();
        
        const updatedVocab = [...vocab, ...newWords];
        const now = Date.now();
        
        // We add 'index' to the timestamp to preserve the order of the CSV/File.
        // This ensures Word #1 in the file is due before Word #2, etc.
        const newSRS: SRSState[] = newWords.map((w, index) => ({
            id: w.id,
            easeFactor: 2.5,
            interval: 0,
            dueDate: now + index, 
            reviews: 0,
            lapses: 0
        }));
        
        const updatedSRS = [...srsState, ...newSRS];

        localStorage.setItem(KEYS.VOCAB, JSON.stringify(updatedVocab));
        localStorage.setItem(KEYS.SRS, JSON.stringify(updatedSRS));

        return updatedVocab;
    }
};