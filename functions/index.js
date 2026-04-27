const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// In Cloud Functions, we use environment variables
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
Output exactly 3 specific career suggestions for the Pakistan market in valid JSON format.
    `.trim();

    const userProfileText = `
User Profile:
- Interests: ${aiProcessingPayload.interests}
- Strengths: ${aiProcessingPayload.skills}
- Goal: ${aiProcessingPayload.goal}
- Context: ${aiProcessingPayload.additionalContext}
    `.trim();

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userProfileText}` }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    const rawText = result.response.text();
    const analysisResult = JSON.parse(rawText);

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
