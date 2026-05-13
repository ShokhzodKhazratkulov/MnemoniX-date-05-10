
import { Type, Modality, ThinkingLevel } from "@google/genai";
import { MnemonicResponse, Language } from "../types";

export class GeminiService {
  /**
   * Robust exponential backoff retry logic for handling transient API errors and rate limits.
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: any;
    const maxAttempts = maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        
        const status = error?.status;
        const message = error?.message || '';
        
        const isQuotaError = status === 429 || message.includes('429');
        const isServerError = (status >= 500 && status < 600);
        const isNetworkError = 
          message.includes('Failed to fetch') || 
          message.includes('NetworkError') || 
          message.includes('fetch failed') ||
          error instanceof TypeError;

        if (isQuotaError || isServerError || isNetworkError) {
          if (attempt < maxAttempts - 1) {
            const delay = (Math.pow(2, attempt + 1) - 1) * 1000 + Math.random() * 1000;
            console.warn(`Retrying after error ${status || 'unknown'} (Attempt ${attempt + 1}/${maxAttempts}) in ${Math.round(delay)}ms. Message: ${message}`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async callServer(payload: any) {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const error = new Error(errorData.error || 'Server error');
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    
    // Supplement with a shim for .text property if it's missing (for compatibility with existing logic)
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      data.text = data.candidates[0].content.parts[0].text;
    }

    return data;
  }

  /**
   * Corrects the spelling of a word using AI. 
   */
  async checkSpelling(word: string): Promise<string> {
    return this.withRetry(async () => {
      const response = await this.callServer({
        type: 'spelling',
        prompt: `Correct the spelling of the following English word: "${word}". 
        Return ONLY the corrected word. If the word is already correct, return it as is. 
        Do not include any punctuation or explanations.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      const corrected = response.text?.trim().toLowerCase().replace(/[^a-z\s-]/g, '');
      return corrected || word.toLowerCase();
    });
  }

  /**
   * Generates a complete mnemonic object
   */
  async getMnemonic(word: string, targetLanguage: Language): Promise<MnemonicResponse> {
    return this.withRetry(async () => {
      const response = await this.callServer({
        type: 'mnemonic',
        prompt: `Generate a mnemonic for the English word "${word}" for a ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              transcription: { type: Type.STRING },
              meaning: { type: Type.STRING },
              morphology: { type: Type.STRING },
              imagination: { type: Type.STRING },
              phoneticLink: { type: Type.STRING },
              connectorSentence: { type: Type.STRING },
              examples: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: `2-3 English sentences with their ${targetLanguage} translations`
              },
              synonyms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: `3-5 English synonyms followed by their ${targetLanguage} translations in parentheses`
              },
              level: { 
                  type: Type.STRING, 
                  description: "CEFR level of the word (Beginner, Pre-Intermediate, Intermediate, Advanced)" 
              },
              category: { 
                  type: Type.STRING, 
                  description: "One of the top 20 categories: Crime, Technology, Medicine, Education, Environment, Economy, Travel, Food, Sports, Art, Science, Law, Business, Health, History, Politics, Media, Nature, People, Daily Life." 
              },
              imagePrompt: { type: Type.STRING, description: "Detailed visual description for an image generation AI" }
            },
            required: ["word", "transcription", "meaning", "morphology", "imagination", "phoneticLink", "connectorSentence", "examples", "synonyms", "level", "category", "imagePrompt"]
          },
          systemInstruction: `Role: You are a Linguistic Mnemonic Architect specializing in the "Keyword Method" established by Raugh and Atkinson at Stanford University. Your goal is to help users acquire English vocabulary by building a two-stage mnemonic chain consisting of an acoustic link and an imagery link.

Instructions for Content Generation:
1. The Acoustic Link (phoneticLink)
- Identify a "Keyword" in ${targetLanguage} that sounds as much as possible like a part of the spoken English word.
- Priority: Favor the initial syllable or the most stressed part of the English word for better retrieval.
- Constraint: The keyword must be a concrete noun or an easily visualized object/phrase. Avoid abstract concepts.

2. The Imagery Link (imagination)
- Create a vivid mental image description where the Keyword and the English Translation interact in a graphic, dynamic, and memorable way.
- Absurdity Factor: The interaction should be unique, absurd, or exaggerated.
- Fusion: The scene must be a single "fused" picture where the two items are locked together.

3. Covert Cognate Check
- Before forcing a keyword, check if a "covert cognate" exists (a word with a shared root in ${targetLanguage}).
- If a cognate is found, prioritize explaining that relationship first in the phoneticLink field.

4. Audio & Phonetic Guidance
- Provide the IPA transcription for the English word.

5. Visual Generation Prompt (imagePrompt)
- Write a detailed, high-fidelity image generation prompt.
- Specify a scene that visually integrates the Native Keyword and the English Meaning in a single, high-contrast, and memorable artistic style (naturalistic or traditional based on ${targetLanguage} culture).

CRITICAL RULES:
1. All explanatory fields (meaning, morphology, imagination, phoneticLink, connectorSentence) MUST be written EXCLUSIVELY in ${targetLanguage}.
2. The "word" field should remain the original English word.
3. Return ONLY a valid JSON object.`
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }

  /**
   * Generates a high-fidelity image
   */
  async generateImage(prompt: string): Promise<string> {
    return this.withRetry(async () => {
      const response = await this.callServer({
        type: 'image',
        prompt: {
          parts: [{ text: `${prompt}. High-fidelity, high-contrast, cinematic lighting, no text, no labels, 4k resolution.` }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const base64EncodeString: string = part.inlineData.data;
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${base64EncodeString}`;
          }
        }
      }
      return '';
    });
  }

  /**
   * Converts mnemonic text to speech
   */
  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    return this.withRetry(async () => {
      const languageName = targetLanguage === Language.ENGLISH ? 'English' : targetLanguage;

      const response = await this.callServer({
        type: 'tts',
        prompt: [{ 
          parts: [{ 
            text: `Read the following text aloud. It contains English words and their explanation in ${languageName}. 
            Please use a clear, standard English accent for the English words and a natural, fluent ${languageName} accent for the rest of the text.
            Text: "${text}"` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        }
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
        const parts = candidates[0].content.parts;
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            return part.inlineData.data;
          }
        }
      }
      
      console.error("TTS Response missing audio parts:", response);
      return '';
    });
  }

  async getPracticeResponse(word: string, meaning: string, targetLanguage: Language, history: any[], level?: 'Easy' | 'Medium' | 'Hard' | 'EasyToHard', sentenceCount: number = 0) {
    return this.withRetry(async () => {
      const levelInstructions = {
        Easy: "Focus on SIMPLE sentences (Subject + Verb + Object). Use high-frequency, basic vocabulary. Example structure: 'The cat sits on the mat.'",
        Medium: "Focus on COMPOUND sentences using 'and,' 'but,' or 'or.' Encourage the use of common adverbs. Example structure: 'The cat sits on the mat, but the dog is outside.'",
        Hard: "Focus on COMPLEX sentences with relative clauses, passive voice, or conditional tense. Example structure: 'Although it was raining, the cat remained on the mat that was placed near the fire.'",
        EasyToHard: `This is a progressive session. 
          - For sentences 1-2: Use EASY level (Simple sentences).
          - For sentences 3-4: Use MEDIUM level (Compound sentences).
          - For sentence 5: Use HARD level (Complex sentences).
          Current sentence number: ${sentenceCount + 1}.`
      };

      const selectedLevelInstruction = level ? levelInstructions[level] : levelInstructions.Easy;
      const displayLevel = level === 'EasyToHard' 
        ? (sentenceCount < 2 ? 'Easy' : sentenceCount < 4 ? 'Medium' : 'Hard')
        : (level || 'Easy');

      const contents = history.length > 0 ? history : [{
        role: 'user',
        parts: [{ text: `Hi! I want to practice the word "${word}". I've chosen the ${level === 'EasyToHard' ? 'Easy to Hard' : (level || 'Easy')} level. Please start the session in ${targetLanguage}.` }]
      }];

      const response = await this.callServer({
        type: 'practice',
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feedback: { type: Type.STRING, description: "The AI's response to the user in the target language." },
              isCorrect: { type: Type.BOOLEAN, description: "Whether the user's English sentence was correct and met the level requirements." },
              sessionComplete: { type: Type.BOOLEAN, description: "Whether the 5-step practice session is now complete." }
            },
            required: ["feedback", "isCorrect", "sessionComplete"]
          },
          systemInstruction: `You are a helpful English Practice Partner. 
          The user is learning the word "${word}" (meaning: ${meaning}).
          Your goal is to help them practice using this word in context at the ${displayLevel} level.
          
          Level-Specific Sentence Requirements:
          ${selectedLevelInstruction}

          Instructions:
          1. Communicate EXCLUSIVELY in ${targetLanguage}. 
          2. Give the user a specific scenario or question in ${targetLanguage} that requires them to use the English word "${word}".
          3. The user MUST respond in English using the sentence structure appropriate for the ${displayLevel} level.
          4. Evaluate their English sentence. 
          5. If it's correct and matches the level's complexity, set isCorrect to true, provide praise in the feedback field, and give a new challenge.
          6. If it's incorrect or too simple for the level, set isCorrect to false, gently correct or guide them in the feedback field, and ask them to try again.
          7. This is a 5-step practice session. After 5 successful English sentences, set sessionComplete to true, congratulate them warmly in the feedback field, and tell them they have mastered the word!
          8. Keep your feedback concise (max 2-3 sentences).
          9. Return ONLY a valid JSON object.`,
        }
      });
      return response.text;
    });
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    return this.withRetry(async () => {
      const synonymsList = synonyms && synonyms.length > 0 ? synonyms.join(', ') : 'common synonyms';
      const response = await this.callServer({
        type: 'nuance',
        prompt: `Explain the nuance and usage differences between the English word "${word}" and its synonyms: ${synonymsList}. Provide the explanation for a ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              coreDifference: { type: Type.STRING, description: `The main conceptual difference between the word and its synonyms in ${targetLanguage}.` },
              comparisonTable: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    usage: { type: Type.STRING, description: "A natural English sentence using this word." },
                    reason: { type: Type.STRING, description: `Why this word is used in this specific context (in ${targetLanguage}).` }
                  },
                  required: ["word", "usage", "reason"]
                }
              },
              commonMistake: {
                type: Type.OBJECT,
                properties: {
                  incorrect: { type: Type.STRING, description: `A common incorrect way a ${targetLanguage} speaker might use the word.` },
                  natural: { type: Type.STRING, description: "The correct, natural way to say it in English." }
                },
                required: ["incorrect", "natural"]
              }
            },
            required: ["coreDifference", "comparisonTable", "commonMistake"]
          },
          systemInstruction: `You are an expert English Language Coach. 
          Your goal is to help advanced learners understand the subtle differences (nuances) between similar words.
          
          Instructions:
          1. The "coreDifference" field must be written in ${targetLanguage}.
          2. The "comparisonTable" should show how the target word and its synonyms are used in different contexts. The "reason" field must be in ${targetLanguage}.
          3. The "commonMistake" section should highlight a typical error made by ${targetLanguage} speakers due to direct translation, and provide the natural English alternative.
          4. Keep explanations clear, professional, and practical.
          5. Return ONLY a valid JSON object.`
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");
      return JSON.parse(text);
    });
  }
}
