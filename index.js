import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set!");
}
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- FALLBACK CONFIGURATION ---
// We will try these models in order if one fails.
const MODEL_FALLBACK_LIST = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-flash'
];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', models: MODEL_FALLBACK_LIST });
});

app.post('/api/analyze-path', async (req, res) => {
  try {
    const userData = req.body;

    const SYSTEM_PROMPT = `
You are a friendly career counselor for students in Pakistan. 
Focus on the Pakistan market (PKR salaries).
Output EXACTLY 3 career options in valid JSON.
    `.trim();

    const userProfileText = `User Data: ${JSON.stringify(userData)}`;

    // --- SMART FALLBACK ENGINE ---
    let lastError = null;
    let finalResult = null;

    for (const modelName of MODEL_FALLBACK_LIST) {
      try {
        console.log(`Attempting analysis with model: ${modelName}...`);
        const model = ai.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${userProfileText}` }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        });

        const rawText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        finalResult = JSON.parse(rawText);
        
        console.log(`Success! Request fulfilled by: ${modelName}`);
        break; // Exit the loop if successful

      } catch (err) {
        console.error(`Model ${modelName} failed. Reason: ${err.message}`);
        lastError = err;
        // Continue to the next model in the list
      }
    }

    if (finalResult) {
      return res.json({ success: true, data: finalResult });
    } else {
      // If we exhausted all models
      console.error("All models failed. Last error:", lastError);
      return res.status(500).json({ 
        error: 'AI is currently overloaded. Please wait 1 minute and try again.',
        details: lastError?.message
      });
    }

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'System error. Please contact support.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server live at port ${PORT}`);
});
