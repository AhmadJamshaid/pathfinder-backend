import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set!");
}
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Note: In production, consider restricting this to your frontend URL
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/analyze-path', async (req, res) => {
  try {
    const { 
      interests, strengths, skill_level, work_preference, 
      career_intent, time_commitment, core_goal, extra_depth 
    } = req.body;

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
You are a friendly career counselor for students in Pakistan. 
Write like a helpful teacher using simple English.
Focus on the Pakistan market (PKR salaries).
Output EXACTLY 3 career options.
RETURN ONLY VALID JSON. No extra text or markdown.
    `.trim();

    const userProfileText = `
User Data: ${JSON.stringify(aiProcessingPayload)}
    `.trim();

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
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
                      }
                    }
                  },
                  roadmap: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { title: { type: "string" }, desc: { type: "string" } }
                    }
                  },
                  match: { type: "integer" },
                  demandTag: { type: "string" },
                  attributeTag: { type: "string" }
                }
              }
            },
            reality_check: {
              type: "object",
              properties: {
                competition: { type: "string" },
                risk: { type: "string" },
                effort: { type: "string" }
              }
            },
            alternative_paths: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" }, description: { type: "string" } }
              }
            },
            what_to_avoid: {
              type: "array",
              items: {
                type: "object",
                properties: { pitfall: { type: "string" }, reason: { type: "string" } }
              }
            }
          }
        }
      }
    });

    let rawText = result.response.text();
    
    // Safety: Clean AI output if it contains markdown markers
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const analysisResult = JSON.parse(rawText);
      return res.json({ success: true, data: analysisResult });
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError, "Raw Text:", rawText);
      return res.status(500).json({ error: "AI returned malformed data. Please try again." });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to connect to AI engine.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
