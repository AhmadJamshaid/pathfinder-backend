const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const callOpenRouter = async (prompt) => {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
      "Content-Type": "application/json" 
    },
    body: JSON.stringify({ 
      model: "meta-llama/llama-3-8b-instruct:free", 
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" } 
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "OR Error");
  return d.choices?.[0]?.message?.content;
};

app.post("/analyze-path", async (req, res) => {
  const prompt = `Career Counselor Pakistan. suggest 3 careers. Data: ${JSON.stringify(req.body)}`;
  
  try {
    console.log(`[DEBUG] Attempting OpenRouter...`);
    const text = await callOpenRouter(prompt);
    if (text) {
      const data = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
      console.log(`✅ SUCCESS: OpenRouter`);
      return res.json({ success: true, provider: "OpenRouter", data });
    }
  } catch (e) {
    console.error(`❌ OpenRouter Failed: ${e.message}`);
  }

  return res.status(503).json({ error: "Analysis failed." });
});

exports.api = functions.https.onRequest(app);
