const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const callAPI = async (url, key, model, prompt) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
  });
  const d = await r.json();
  return d.choices[0].message.content;
};

app.post("/analyze-path", async (req, res) => {
  try {
    const prompt = `Career Counselor Pakistan. JSON ONLY. Data: ${JSON.stringify(req.body)}`;
    let result = null;

    // 1. Gemini
    try {
      const m = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const g = await m.generateContent(prompt);
      result = JSON.parse(g.response.text().replace(/```json/g, '').replace(/```/g, ''));
    } catch (e) {}

    // 2. OpenRouter
    if (!result) {
      try {
        const t = await callAPI("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY, "meta-llama/llama-3-8b-instruct:free", prompt);
        result = JSON.parse(t.replace(/```json/g, '').replace(/```/g, ''));
      } catch (e) {}
    }

    // 3. Groq
    if (!result) {
      try {
        const t = await callAPI("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, "llama3-8b-8192", prompt);
        result = JSON.parse(t.replace(/```json/g, '').replace(/```/g, ''));
      } catch (e) {}
    }

    return result ? res.json({ success: true, data: result }) : res.status(500).send("All failed");
  } catch (e) {
    return res.status(500).send("System error");
  }
});

exports.api = functions.https.onRequest(app);
