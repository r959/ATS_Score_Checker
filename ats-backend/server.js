require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const mammoth = require('mammoth');
const { OpenAI } = require('openai');
const fs = require('fs');

// SAFE IMPORT for pdf-parse
// This fixes the "pdfParse is not a function" error by handling different export styles
let pdfParseLib = require('pdf-parse');
if (typeof pdfParseLib !== 'function' && pdfParseLib.default) {
    pdfParseLib = pdfParseLib.default;
}

const app = express();

// 1. CORS Setup (CRITICAL FIX: Removed trailing slash from Vercel URL)
app.use(cors({
    origin: ["[https://ats-score-checker-silk.vercel.app](https://ats-score-checker-silk.vercel.app)", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
}));

app.use(express.json());

// 2. Database Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Schema
const AnalysisSchema = new mongoose.Schema({
    jobRole: String,
    score: Number,
    missingKeywords: [String],
    date: { type: Date, default: Date.now }
});
const Analysis = mongoose.model('Analysis', AnalysisSchema);

// 3. OpenAI Setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 4. Multer Setup
const upload = multer({ storage: multer.memoryStorage() });

// 5. Helper: Text Extraction
const extractText = async (file) => {
    try {
        if (file.mimetype === 'application/pdf') {
            const data = await pdfParseLib(file.buffer); 
            return data.text;
        } 
        else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            return result.value;
        }
        throw new Error(`Unsupported file type: ${file.mimetype}`);
    } catch (error) {
        console.error("Text Extraction Failed:", error);
        throw error;
    }
};

// 6. Main Route
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription } = req.body;
        const resumeFile = req.file;

        if (!resumeFile || !jobDescription) {
            return res.status(400).json({ error: 'Resume file and Job Description are required' });
        }

        // A. Extract Text
        console.log("Extracting text from resume...");
        const resumeText = await extractText(resumeFile);
        console.log("Text extraction successful.");

        // B. Send to AI
        const prompt = `
            You are an expert Applicant Tracking System (ATS).
            Evaluate this candidate's resume against the Job Description.

            RESUME TEXT:
            "${resumeText.substring(0, 3000)}"

            JOB DESCRIPTION:
            "${jobDescription.substring(0, 3000)}"

            Output strictly in JSON format:
            {
                "score": (integer 0-100),
                "missingKeywords": ["array", "of", "strings"],
                "formattingIssues": ["array", "of", "strings"],
                "feedback": "string"
            }
            Do not include markdown formatting (like \`\`\`json).
        `;

        const completion = await openai.chat.completions.create({
            messages: [
                { role: "system", content: "You are a helpful ATS assistant. Output strict JSON." },
                { role: "user", content: prompt }
            ],
            model: "gpt-3.5-turbo",
        });

        let resultText = completion.choices[0].message.content;

        // C. Clean JSON (Fixes potential AI formatting errors)
        resultText = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const analysisResult = JSON.parse(resultText);

        // D. Save to DB (Optional: wrapped in try-catch so it doesn't fail the request if DB is down)
        try {
            const record = new Analysis({
                jobRole: 'Extracted from JD',
                score: analysisResult.score,
                missingKeywords: analysisResult.missingKeywords
            });
            await record.save();
        } catch (dbError) {
            console.error("Database save failed (non-fatal):", dbError);
        }

        res.json(analysisResult);

    } catch (error) {
        console.error("Analysis Error:", error);
        // Return the actual error message to the frontend for better debugging
        res.status(500).json({ error: 'Analysis failed', details: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));