const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

// In Cloud Functions, we use environment variables
// Ensure GEMINI_API_KEY is set in your Firebase project configuration
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post("/analyze-path", async (req, res) => {
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

    const generateWithRetry = async (payload, attempts = 5) => {
      for (let i = 0; i < attempts; i++) {
        try {
          return await ai.models.generateContent(payload);
        } catch (err) {
          const isRetryable = err.status === 503 || err.status === 429;
          if (isRetryable && i < attempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 3000 * (i + 1)));
            continue;
          }
          throw err;
        }
      }
    };

    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const aiResult = await generateWithRetry({
      contents: [{ role: 'user', parts: [{ text: userProfileText }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const rawText = aiResult.response.text();
    let analysisResult;
    try {
      analysisResult = JSON.parse(rawText);
    } catch (parseError) {
      return res.json({
        success: true,
        data: {
          careers: [],
          reality_check: { competition: "Unknown", risk: "Unknown", effort: "Unknown" },
          alternative_paths: [],
          what_to_avoid: []
        }
      });
    }

    return res.json({
      success: true,
      data: analysisResult
    });

  } catch (error) {
    console.error('Error in analyze-path:', error);
    return res.status(500).json({ error: 'Failed to process AI career path analysis.' });
  }
});

exports.api = functions.https.onRequest(app);
