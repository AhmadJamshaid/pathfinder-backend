const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.0-flash-lite-001'];

const generateWithOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("No OpenRouter Key");
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "model": "meta-llama/llama-3-8b-instruct:free",
      "messages": [{ "role": "user", "content": prompt }]
    })
  });
  const data = await resp.json();
  return data.choices[0].message.content;
};

app.post("/analyze-path", async (req, res) => {
  try {
    const prompt = `Career Counselor for Pakistan. JSON ONLY. Data: ${JSON.stringify(req.body)}`;
    let finalResult = null;

    for (const m of GEMINI_MODELS) {
      try {
        const model = ai.getGenerativeModel({ model: m });
        const res = await model.generateContent(prompt);
        finalResult = JSON.parse(res.response.text().replace(/```json/g, '').replace(/```/g, '').trim());
        break;
      } catch (e) {}
    }

    if (!finalResult) {
      try {
        const text = await generateWithOpenRouter(prompt);
        finalResult = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {}
    }

    return finalResult ? res.json({ success: true, data: finalResult }) : res.status(500).send("Error");
  } catch (e) {
    return res.status(500).send("Error");
  }
});

exports.api = functions.https.onRequest(app);
