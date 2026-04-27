const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// --- PROVIDERS ---

const tryGemini = async (prompt) => {
  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const result = await ai.getGenerativeModel({ model: "gemini-2.0-flash" }).generateContent(prompt);
  return result.response.text();
};

const callAPI = async (url, key, model, prompt, isCohere = false) => {
  const body = isCohere ? { model, message: prompt } : { model, messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  return isCohere ? d.text : d.choices?.[0]?.message?.content;
};

app.post("/analyze-path", async (req, res) => {
  const prompt = `Career Counselor Pakistan. suggest 3 careers in valid JSON. Data: ${JSON.stringify(req.body)}`;
  const providers = [
    { name: "Gemini", fn: () => tryGemini(prompt) },
    { name: "OpenRouter", fn: () => callAPI("https://openrouter.ai/api/v1/chat/completions", process.env.OPENROUTER_API_KEY, "meta-llama/llama-3-8b-instruct:free", prompt) },
    { name: "Groq", fn: () => callAPI("https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY, "llama3-8b-8192", prompt) },
    { name: "Cohere", fn: () => callAPI("https://api.cohere.ai/v1/chat", process.env.COHERE_API_KEY, "command-r-plus", prompt, true) }
  ];

  for (const p of providers) {
    try {
      console.log(`[DEBUG] Attempting ${p.name}...`);
      const text = await p.fn();
      if (!text) continue;
      const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      if (data && data.careers) {
        console.log(`✅ SUCCESS: ${p.name}`);
        return res.json({ success: true, provider: p.name, data });
      }
    } catch (e) {
      console.error(`❌ ${p.name} Failed: ${e.message}`);
    }
  }

  return res.status(503).json({ error: "All AI providers busy." });
});

exports.api = functions.https.onRequest(app);
