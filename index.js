import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const SCHEMA_PROMPT = `Return ONLY valid JSON: { "careers": [...], "reality_check": {...}, "alternative_paths": [...], "what_to_avoid": [...] }`;
const SYSTEM_PROMPT = `Career Counselor Pakistan. Suggest 3 careers. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) throw new Error("Empty response from AI");
  return text.replace(/```json/g, '').replace(/```/g, '').trim();
};

const tryOpenRouter = async (prompt) => {
  // --- DIAGNOSTIC LOG ---
  console.log("API Key Check:", process.env.OPENROUTER_API_KEY ? "✅ KEY FOUND" : "❌ KEY MISSING");
  
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured in Vercel Environment Variables.");
  }
  
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { 
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, 
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pathfinder.ai", // Required by some OR models
      "X-Title": "PathFinder AI"
    },
    body: JSON.stringify({ 
      "model": "google/gemini-2.0-flash-001", // Faster than Llama free
      "messages": [{"role": "user", "content": prompt}], 
      "response_format": {"type": "json_object"} 
    })
  });
  
  const d = await r.json();
  if (!r.ok) {
    console.error("OpenRouter API returned an error:", JSON.stringify(d));
    throw new Error(d.error?.message || `HTTP Error ${r.status}`);
  }
  
  const content = d.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned an empty choices array.");
  
  return content;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [DIAGNOSTIC] New Career Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  
  try {
    const rawText = await tryOpenRouter(prompt);
    const cleaned = cleanJSON(rawText);
    const finalResult = JSON.parse(cleaned);
    
    if (finalResult && finalResult.careers) {
      console.log(`✅ SUCCESS: Analysis fulfilled.`);
      return res.json({ success: true, provider: "OpenRouter", data: finalResult });
    }
  } catch (e) {
    console.error(`❌ CRITICAL FAILURE:`, e.message);
    return res.status(503).json({ 
      error: `AI analysis failed: ${e.message}`,
      tip: "Check your OpenRouter dashboard for credit status or key validity."
    });
  }
});

app.listen(PORT, () => console.log(`Diagnostic Backend live on port ${PORT}`));
