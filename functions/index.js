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
      model: "google/gemini-2.0-flash-001", 
      messages: [{ role: "user", content: prompt }] 
    })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "OR Error");
  return d.choices?.[0]?.message?.content;
};

app.post("/analyze-path", async (req, res) => {
  const prompt = `RETURN ONLY RAW JSON. ${JSON.stringify(req.body)}`;
  
  try {
    const text = await callOpenRouter(prompt);
    if (text) {
      // Find the JSON block
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const cleaned = text.substring(start, end + 1).trim();
      
      const data = JSON.parse(cleaned);
      return res.json({ success: true, data });
    }
  } catch (e) {
    console.error(`❌ OpenRouter Failed: ${e.message}`);
  }

  return res.status(503).json({ error: "Analysis failed." });
});

exports.api = functions.https.onRequest(app);
