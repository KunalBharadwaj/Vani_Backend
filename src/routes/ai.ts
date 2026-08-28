import express from "express";
import multer from "multer";
// Removed sharp dependency since cropping happens on frontend
import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

let groq: Groq;
try {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
} catch (e) {
  console.warn("GROQ_API_KEY is not configured yet.");
}

let ai: GoogleGenAI;
try {
  ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
} catch (e) {
  console.warn("GEMINI_API_KEY is not configured yet.");
}

// Helper to calculate time
const getCurrentTime = () => {
    return new Date().toLocaleString("en-US", {
        hour: "numeric", minute: "numeric", hour12: true,
        weekday: "long", day: "numeric", month: "long", year: "numeric"
    });
};

router.post("/process", upload.single("file"), async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return res.status(400).json({ error: "GEMINI_API_KEY is not configured in backend .env" });
        }
        if (!ai) {
            ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
        }
        
        if (!req.file) return res.status(400).json({ error: "No cropped image provided" });

        // Image is already cropped on the frontend, just convert directly to base64
        const base64Image = req.file.buffer.toString("base64");

        const prompt = `You are an Expert AI Tutor analyzing a user-provided image or a specific cropped region of an image. Your goal is to provide a highly insightful, dynamic, and natural explanation of the exact content the user is focusing on.

**Key Instructions:**
- **For Code Snippets:** Provide a high-level architectural summary (maximum 3 sentences) explaining the overarching logic and problem being solved. Then, provide a brief bulleted list of the core logical phases. Assume the reader is a Senior Engineer. Ignore basic syntax and variable definitions entirely.
- **For Math/Physics Equations:** Break down the equation. Explain what each variable means, what the entire equation calculates, and its practical or logical significance.
- **For Diagrams/Text:** Explain the foundational principles and the 'Why/How'. What is the purpose? How does it work under the hood?
- **Be Dynamic in Size and Structure:** Do NOT force a fixed length response. If the snippet is simple, give a concise explanation. If it's a complex algorithm, provide a deeper breakdown. Structure your explanation naturally using headings, bullet points, and paragraphs.

Deliver a clear, engaging, and professional explanation that directly addresses the core intelligence of the snippet without treating the user like a beginner.`;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                prompt,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/png"
                    }
                }
            ]
        });

        res.json({ response: response.text });
    } catch (error: any) {
        console.error("Circle to Search Error:", error);
        res.status(500).json({ error: "Failed to process image: " + error.message });
    }
});

router.post("/chat", async (req, res) => {
    try {
        if (!process.env.GROQ_API_KEY) {
            return res.status(400).json({ error: "GROQ_API_KEY is not configured in backend .env" });
        }
        if (!groq) {
            groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        }
        
        const { text, currentTime: clientTime } = req.body;
        if (!text) return res.status(400).json({ error: "No text provided" });

        const lowerText = text.toLowerCase();

        // 1. Basic Web Links (since OS commands aren't possible/safe on a remote server)
        if (lowerText.startsWith("open ")) {
            const query = lowerText.replace("open ", "").trim();
            let url = "";
            if (query.includes("vani")) url = "https://vani-frontend.vercel.app";
            else if (query.includes("chrome") || query.includes("google")) url = "https://google.com";
            else if (query.includes("youtube")) url = "https://youtube.com";
            else url = "https://www.google.com/search?q=" + encodeURIComponent(query);
            
            return res.json({
                response: `Opening ${query}...`,
                action: { type: "open_url", url }
            });
        }

        // Use client time if provided, else fallback to server time
        const timeToUse = clientTime || getCurrentTime();
        
        // 2. LLM processing for chat, reminders, and hotels
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are Chanakya, a concise and helpful AI assistant.
                    
                    CURRENT TIME: ${timeToUse}
                    
                    CRITICAL: If the user asks for a reminder, alarm, or timer (e.g., "in 5 mins" OR "at 8:54 AM"):
                    1. Respond naturally to the user.
                    2. Append a command block at the very end: [COMMAND: REMINDER | message: <msg> | seconds: <sec>]
                    3. Calculate <sec> by finding the difference between CURRENT TIME and the requested time.
                    4. If the requested time is earlier than the current time, assume they mean tomorrow.
                    
                    Otherwise, answer in 1-2 sentences maximum. Be direct.`
                },
                {
                    role: "user",
                    content: text,
                }
            ],
            model: "openai/gpt-oss-20b",
        });

        let llmResponse = chatCompletion.choices[0]?.message?.content || "";
        const alarms: any[] = [];
        const hotels: any[] = [];

        // Check for alarms
        const alarmMatch = llmResponse.match(/\[COMMAND: REMINDER \| message: (.*?) \| seconds: (\d+)\]/);
        if (alarmMatch) {
            alarms.push({ message: alarmMatch[1], seconds: parseInt(alarmMatch[2] as string) });
            llmResponse = llmResponse.replace(/\[COMMAND: REMINDER .*?\]/g, "").trim();
        }

        // Check for hotels if asked
        if (lowerText.includes("hotel") || lowerText.includes("stay")) {
            const hotelQuery = `Provide a list of 3 real hotels in '${text}' sorted by price (lowest to highest) with name, price per night, and star rating. Format: [HOTEL: name | price: <price> | rating: <stars>]`;
            
            const hotelCompletion = await groq.chat.completions.create({
                messages: [{ role: "user", content: hotelQuery }],
                model: "openai/gpt-oss-20b",
            });

            const hotelData = hotelCompletion.choices[0]?.message?.content || "";
            const hotelMatches = [...hotelData.matchAll(/\[HOTEL: (.*?) \| price: (.*?) \| rating: (.*?)\]/g)];
            
            hotelMatches.forEach(match => {
                hotels.push({
                    name: match[1],
                    price: match[2],
                    rating: parseFloat(match[3]?.replace(/[^0-9.]/g, '') || '') || 5.0
                });
            });
        }

        res.json({
            response: llmResponse,
            alarms,
            hotels
        });

    } catch (error: any) {
        console.error("Chat Error:", error);
        res.status(500).json({ error: "Failed to process chat: " + error.message });
    }
});

export default router;
