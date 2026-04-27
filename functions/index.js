const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post("/analyze-path", async (req, res) => {
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
Focus on the Pakistan market (PKR salaries).
Output EXACTLY 3 career options in valid JSON.
    `.trim();

    const userProfileText = `User Data: ${JSON.stringify(aiProcessingPayload)}`;

    const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userProfileText}` }] }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    });

    let rawText = result.response.text();
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const analysisResult = JSON.parse(rawText);
      return res.json({ success: true, data: analysisResult });
    } catch (parseError) {
      return res.status(500).json({ error: "Malformed AI response." });
    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Server error.' });
  }
});

exports.api = functions.https.onRequest(app);
