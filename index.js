import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- THE ULTRA-DETAIL BLUEPRINT ---
const SCHEMA_PROMPT = `
You MUST return ONLY a JSON object. NO CONVERSATION.
Every field MUST be filled with high-depth, professional information.

Structure:
{
  "careers": [
    {
      "title": "Professional Title",
      "match": number (70-100),
      "demandTag": "High/Growing Demand",
      "attributeTag": "Key Personality Fit",
      "role_overview": "A 50-word professional deep-dive into this career in the Pakistani context. Describe daily tasks, work-life balance, and long-term growth.",
      "why_fit": "Explain exactly how this matches the user's specific answers.",
      "income": "Realistic monthly PKR salary range (e.g. 100k - 200k PKR)",
      "time_to_earn": "Time until first income (e.g. 4-7 months)",
      "skills": [
        { "name": "Skill 1", "simple_explanation": "Detailed explanation", "type": "core" },
        { "name": "Skill 2", "simple_explanation": "Detailed explanation", "type": "secondary" }
      ],
      "roadmap": [
        { "title": "Step 1: Foundational Learning", "desc": "Detailed instructions for month 1." },
        { "title": "Step 2: Skill Specialization", "desc": "Detailed instructions for month 2." },
        { "title": "Step 3: Portfolio Building", "desc": "Specific projects to complete." },
        { "title": "Step 4: Market Entry", "desc": "How to find the first client in Pakistan." },
        { "title": "Step 5: Income Scaling", "desc": "How to increase rates." },
        { "title": "Step 6: Career Mastery", "desc": "Long-term goal and certification." }
      ]
    }
  ],
  "reality_check": {
    "competition": "Deep analysis of the competitive landscape in Pakistan.",
    "risk": "Detailed financial and professional risks.",
    "effort": "Real talk about the hours and mental energy required."
  },
  "alternative_paths": [
    { "title": "Option 1", "description": "Why this is a solid backup." },
    { "title": "Option 2", "description": "Why this is a solid backup." },
    { "title": "Option 3", "description": "Why this is a solid backup." }
  ],
  "what_to_avoid": [
    { "pitfall": "Mistake 1", "reason": "Why it is dangerous." },
    { "pitfall": "Mistake 2", "reason": "Why it is dangerous." },
    { "pitfall": "Mistake 3", "reason": "Why it is dangerous." },
    { "pitfall": "Mistake 4", "reason": "Why it is dangerous." }
  ]
}
`;

const SYSTEM_PROMPT = `YOU ARE A SENIOR CAREER CONSULTANT. Suggest exactly 3 careers. 
Be comprehensive and deep. Your roadmap MUST HAVE EXACTLY 6 STEPS. 
Your Alternative Paths MUST HAVE EXACTLY 3. 
Your What To Avoid MUST HAVE EXACTLY 4.
Write like a mentor who wants the student to win. ${SCHEMA_PROMPT}`;

const cleanJSON = (text) => {
  if (!text) return "";
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return text;
  return text.substring(start, end + 1).trim();
};

const tryOpenRouter = async (prompt) => {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("Key missing.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.0-flash-001", messages: [{ role: "user", content: prompt }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "OR API Error");
  return data.choices?.[0]?.message?.content;
};

app.post('/api/analyze-path', async (req, res) => {
  console.log("\n--- [ULTRA-DETAIL MODE] New Scan ---");
  const prompt = `${SYSTEM_PROMPT}\n\nUser Profile: ${JSON.stringify(req.body)}`;
  try {
    const rawText = await tryOpenRouter(prompt);
    const cleanedText = cleanJSON(rawText);
    const parsedData = JSON.parse(cleanedText);
    if (parsedData && parsedData.careers) {
      console.log("SUCCESS: Deep Analysis Delivered.");
      return res.json({ success: true, data: parsedData });
    }
  } catch (err) {
    console.error(`❌ FAILURE:`, err.message);
    return res.status(503).json({ error: `System Error: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`Ultra-Detail Backend live on port ${PORT}`));
