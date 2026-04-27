import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config(); // Loads .env from current directory

// Initialize the Gemini API Client securely from environment variables
if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in the environment variables!");
}
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    // Destructure the expected 8 fields from the frontend scan
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
    
    // Basic validation
    if (!core_goal && !career_intent) {
      return res.status(400).json({ error: 'Missing critical user scanning data.' });
    }

    // Structure incoming data into a clean JSON object for AI processing
    const aiProcessingPayload = {
      interests: interests || "",
      skills: strengths || "",
      skillLevel: skill_level || "",
      preferences: work_preference || "",
      intent: career_intent || "",
      goal: core_goal || "",
      time: time_commitment || "",
      additionalContext: extra_depth || ""
    };

    console.log("Clean JSON payload prepared for AI:", aiProcessingPayload);

    // -------------------------------------------------------------
    // Connecting to Gemini API
    // -------------------------------------------------------------
    
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
- Avoid technical jargon (big "work words").
- Use short sentences.
- Explain things in plain English.
- Use examples where helpful to explain a career or a task.
- Be honest but encouraging.

**SECTIONS TO MAKE ESPECIALLY SIMPLE:**
1. **Why It Fits You**: Explain in very basic terms why this job is good for them based on what they like.
2. **Step-by-step Roadmap**: Use short, clear actions (what to do). Use simple steps. Do not use complex project names or industry terms.
3. **Reality Check**: Explain the hard parts (competition, risk, effort) using simple stories or metaphors.

**SKILLS REQUIREMENTS:**
- For each required skill, you MUST add a short and simple explanation.
- Example: Python -> "A programming language used for data and automation"
- Example: Critical Thinking -> "Thinking carefully to solve problems"

**GEOGRAPHIC FOCUS:**
- All advice must be specifically for the Pakistan market. 
- Use local salary estimates in PKR.
- Suggest jobs that are actually available in Pakistan or as remote work from Pakistan.

**HANDLING MISSING DATA:**
- If a user skips a question, the data will be "Not provided". 
- If critical data is missing, make your best guess based on other fields.
- Always provide 3 career options, even if the user gave very little information.
- Use a general but helpful tone if you don't have enough specific details.

**STRICT OUTPUT PROTOCOL:**
Return ONLY the requested analysis: careers (exactly 3 options), reality_check (competition, risk, effort), alternative_paths (1-2 options), and what_to_avoid (mistakes). 
For EACH career, include: title, role_overview, why_fit, income (PKR), time to start earning, skills (name and simple_explanation), and a simple roadmap.
Force your entire response in strict valid JSON format. Provide absolutely NO extra text or markdown wrappers. If output is not valid JSON, the response will be rejected.
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

    // Helper for retrying AI requests
    const generateWithRetry = async (payload, attempts = 5) => {
      for (let i = 0; i < attempts; i++) {
        try {
          return await ai.models.generateContent(payload);
        } catch (err) {
          const isRetryable = err.status === 503 || err.status === 429;
          if (isRetryable && i < attempts - 1) {
            console.warn(`AI Request failed with ${err.status}. Retrying in ${3000 * (i + 1)}ms...`);
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
            continue;
          }
          throw err;
        }
      }
    };

    const model = ai.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    const response = await generateWithRetry({
      contents: [{ role: 'user', parts: [{ text: userProfileText }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            careers: {
              type: "ARRAY",
              description: "Provide exactly 3 highly specific career suggestions.",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  role_overview: { type: "STRING", description: "A short, simple explanation of the role." },
                  why_fit: { type: "STRING", description: "Explain in very basic terms why this job is good for them." },
                  income: { type: "STRING", description: "Potential mapped to real world brackets." },
                  time_to_earn: { type: "STRING", description: "Realistic timeframe." },
                  skills: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: { 
                        name: { type: "STRING" }, 
                        simple_explanation: { type: "STRING", description: "A very simple, short explanation of what this skill is." },
                        type: { type: "STRING", description: "'core', 'secondary', or 'soft'" } 
                      },
                      required: ["name", "simple_explanation", "type"]
                    }
                  },
                  roadmap: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: { title: { type: "STRING" }, desc: { type: "STRING" } },
                      required: ["title", "desc"]
                    }
                  },
                  match: { type: "INTEGER", description: "Percentage match (0-100)" },
                  demandTag: { type: "STRING" },
                  attributeTag: { type: "STRING" }
                },
                required: ["title", "role_overview", "why_fit", "income", "time_to_earn", "skills", "roadmap", "match", "demandTag", "attributeTag"]
              }
            },
            reality_check: {
              type: "OBJECT",
              properties: {
                competition: { type: "STRING" },
                risk: { type: "STRING" },
                effort: { type: "STRING" }
              },
              required: ["competition", "risk", "effort"]
            },
            alternative_paths: {
              type: "ARRAY",
              description: "Suggest 1-2 other related career options.",
              items: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  description: { type: "STRING", description: "Why it might be a good backup." }
                },
                required: ["title", "description"]
              }
            },
            what_to_avoid: {
              type: "ARRAY",
              description: "List 2-3 mistakes or wrong career paths the user should explicitly avoid based on their profile.",
              items: {
                type: "OBJECT",
                properties: {
                  pitfall: { type: "STRING" },
                  reason: { type: "STRING" }
                },
                required: ["pitfall", "reason"]
              }
            }
          },
          required: ["careers", "reality_check", "alternative_paths", "what_to_avoid"]
        }
      }
    });

    // Parse response properly
    const rawText = response.response.text();

    let analysisResult;
    try {
      analysisResult = JSON.parse(rawText);
    } catch (parseError) {
      console.error("JSON Parse Failed:", rawText);
      
      // Smart Fallback to prevent app crash
      return res.json({
        success: true,
        data: {
          careers: [],
          reality_check: {
            competition: "Unknown",
            risk: "Unknown",
            effort: "Unknown"
          },
          alternative_paths: [],
          what_to_avoid: []
        }
      });
    }
    
    console.log("Successfully parsed AI response. Sending back to frontend.");

    // Send response back to frontend cleanly
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
