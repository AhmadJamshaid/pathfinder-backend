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
You are a friendly and helpful career counselor for students in Pakistan. Your job is to give clear, easy-to-understand career advice.

**GLOBAL INSTRUCTION:**
- All output must be easy to understand for a beginner student. 
- Rewrite complex sentences in simpler words.
- Explain everything at a beginner level, like teaching a student with no prior knowledge.
- Write like a helpful teacher, not like a corporate report.
- Use short sentences and plain English. Avoid technical jargon.
- Suggest jobs that are available in Pakistan or as remote work from Pakistan.
- Use local salary estimates in PKR.

**HANDLING MISSING DATA:**
- If data is "Not provided", make your best guess or provide general helpful advice.
- ALWAYS provide exactly 3 career options.

**STRICT OUTPUT PROTOCOL:**
Return ONLY a valid JSON object. No extra text.
    `.trim();

    const userProfileText = `
User Profile:
- Interests: ${aiProcessingPayload.interests}
- Strengths: ${aiProcessingPayload.skills}
- Skill Level: ${aiProcessingPayload.skillLevel}
- Goal: ${aiProcessingPayload.goal}
- Time: ${aiProcessingPayload.time}
- Context: ${aiProcessingPayload.additionalContext}
    `.trim();

    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userProfileText}` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            careers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  role_overview: { type: "string" },
                  why_fit: { type: "string" },
                  income: { type: "string" },
                  time_to_earn: { type: "string" },
                  skills: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { 
                        name: { type: "string" }, 
                        simple_explanation: { type: "string" },
                        type: { type: "string" } 
                      },
                      required: ["name", "simple_explanation", "type"]
                    }
                  },
                  roadmap: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { title: { type: "string" }, desc: { type: "string" } },
                      required: ["title", "desc"]
                    }
                  },
                  match: { type: "integer" },
                  demandTag: { type: "string" },
                  attributeTag: { type: "string" }
                },
                required: ["title", "role_overview", "why_fit", "income", "time_to_earn", "skills", "roadmap", "match", "demandTag", "attributeTag"]
              }
            },
            reality_check: {
              type: "object",
              properties: {
                competition: { type: "string" },
                risk: { type: "string" },
                effort: { type: "string" }
              },
              required: ["competition", "risk", "effort"]
            },
            alternative_paths: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" }, description: { type: "string" } },
                required: ["title", "description"]
              }
            },
            what_to_avoid: {
              type: "array",
              items: {
                type: "object",
                properties: { pitfall: { type: "string" }, reason: { type: "string" } },
                required: ["pitfall", "reason"]
              }
            }
          },
          required: ["careers", "reality_check", "alternative_paths", "what_to_avoid"]
        }
      }
    });

    const rawText = result.response.text();
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

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
