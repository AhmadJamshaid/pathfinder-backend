const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const callAPI = async (url, key, model, prompt, isCohere = false) => {
  const body = isCohere ? { model, message: prompt } : { model, messages: [{ role: "user", content: prompt }] };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  return isCohere ? d.text : d.choices[0].message.content;
};

app.post("/analyze-path", async (req, res) => {
  try {
    const prompt = `Career Counselor Pakistan. JSON ONLY. Data: ${JSON.stringify(req.body)}`;
    let result = null;

    // Tiers: Gemini -> OpenRouter -> Groq -> Cohere
    try {
      const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const g = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
      result = JSON.parse(g.response.text().replace(/```json/g, '').replace(/```/g, ''));
    } catch (e) {
      try {
        const t = await callAPI("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY, "meta-llama/llama-3-8b-instruct:free", prompt);
        result = JSON.parse(t.replace(/```json/g, '').replace(/```/g, ''));
      } catch (e) {
        try {
          const t = await callAPI("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, "llama3-8b-8192", prompt);
          result = JSON.parse(t.replace(/```json/g, '').replace(/```/g, ''));
        } catch (e) {
          try {
            const t = await callAPI("https://api.cohere.ai/v1/chat", process.env.COHERE_API_KEY, "command-r-plus", prompt, true);
            result = JSON.parse(t.replace(/```json/g, '').replace(/```/g, ''));
          } catch (e) {}
        }
      }
    }

    return result ? res.json({ success: true, data: result }) : res.status(500).send("All failed");
  } catch (e) { return res.status(500).send("Error"); }
});

exports.api = functions.https.onRequest(app);
