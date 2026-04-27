import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config(); // Loads .env from current directory

// Initialize the Gemini API Client securely from environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in the environment variables!");
}
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PathFinder AI backend is fully operational.' });
});

// POST Route to analyze user data
app.post('/api/analyze-path', async (req, res) => {
  try {
    const { 
      interests, 
      strengths, 
      skill_level, 
      work_preference, 
      career_intent, 
      time_commitment, 
      core_goal, 
      extra_depth 
    } = req.body;

    console.log("Analyzing path for user data...");
    
    if (!core_goal && !career_intent) {
      return res.status(400).json({ error: 'Missing critical user scanning data.' });
    }

    const aiProcessingPayload = {
      interests: interests || "Not provided",
      skills: strengths || "Not provided",
      skillLevel: skill_level || "Not provided",
      preferences: work_preference || "Not provided",
      intent: career_intent || "Not provided",
      goal: core_goal || "Not provided",
      time: time_commitment || "Not provided",
      additionalContext: extra_depth || "Not provided"
    };

    const SYSTEM_PROMPT = `
You are a friendly and helpful career counselor for students. Your job is to give clear, easy-to-understand career advice.

**GLOBAL INSTRUCTION:**
- All output must be easy to understand for a beginner student. 
- If a sentence is complex, rewrite it in simpler words.

**BEGINNER LEVEL INSTRUCTION:**
- Explain everything at a beginner level, like teaching a student with no prior knowledge.
- Imagine you are talking to someone who has never heard of these jobs before.

**TONE & STYLE (VERY IMPORTANT):**
- Write like a helpful teacher, not like a corporate report.
- Do not use complex sentences or difficult vocabulary.
- Do not use long paragraphs. Keep descriptions short and sweet.
- Use very simple, easy English.
- Avoid technical jargon.
- Use short sentences.
- Explain things in plain English.
- Be honest but encouraging.

**GEOGRAPHIC FOCUS:**
- All advice must be specifically for the Pakistan market. 
- Use local salary estimates in PKR.

**STRICT OUTPUT PROTOCOL:**
Return ONLY a valid JSON object with: careers (exactly 3 options), reality_check, alternative_paths, and what_to_avoid.
    `.trim();

    const userProfileText = `
User Profile:
- Interests: ${aiProcessingPayload.interests}
- Strengths: ${aiProcessingPayload.skills}
- Skill Level: ${aiProcessingPayload.skillLevel}
- Goal: ${aiProcessingPayload.goal}
- Time Available: ${aiProcessingPayload.time}
- Work Preference: ${aiProcessingPayload.preferences}
- Career Intent: ${aiProcessingPayload.intent}
- Additional Context: ${aiProcessingPayload.additionalContext}
    `.trim();

    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Stable method for content generation with retry logic
    const generateWithRetry = async (prompt, attempts = 3) => {
      for (let i = 0; i < attempts; i++) {
        try {
          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
            generationConfig: {
              responseMimeType: "application/json"
            }
          });
          return result.response.text();
        } catch (err) {
          if ((err.status === 503 || err.status === 429) && i < attempts - 1) {
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
            continue;
          }
          throw err;
        }
      }
    };

    const rawText = await generateWithRetry(userProfileText);
    const analysisResult = JSON.parse(rawText);

    return res.json({
      success: true,
      data: analysisResult
    });

  } catch (error) {
    console.error('Error in /analyze-path:', error);
    return res.status(500).json({ error: 'Failed to process AI career path analysis.' });
  }
});

// Initialize Server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
