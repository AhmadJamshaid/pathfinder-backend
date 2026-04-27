const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const MODEL_FALLBACK_LIST = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-flash'
];

app.post("/analyze-path", async (req, res) => {
  try {
    const userData = req.body;
    const SYSTEM_PROMPT = "You are a friendly career counselor for students in Pakistan. Output EXACTLY 3 career options in valid JSON.";
    const userProfileText = `User Data: ${JSON.stringify(userData)}`;

    let finalResult = null;

    for (const modelName of MODEL_FALLBACK_LIST) {
      try {
        const model = ai.getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userProfileText}` }] }],
          generationConfig: { responseMimeType: "application/json" }
        });

        const rawText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        finalResult = JSON.parse(rawText);
        break;
      } catch (err) {
        console.error(`Model ${modelName} failed.`);
      }
    }

    if (finalResult) {
      return res.json({ success: true, data: finalResult });
    } else {
      return res.status(500).json({ error: 'All AI models are busy.' });
    }

  } catch (error) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

exports.api = functions.https.onRequest(app);
