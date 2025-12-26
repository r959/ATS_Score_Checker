require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { OpenAI } = require('openai');
const fs = require('fs');

const app = express();
app.use(cors({
    origin: ["https://ats-score-checker-silk.vercel.app/", "http://localhost:3000"],
    credentials: true
}));
app.use(express.json());

// 1. Database Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

// Schema to store results
const AnalysisSchema = new mongoose.Schema({
    jobRole: String,
    score: Number,
    missingKeywords: [String],
    date: { type: Date, default: Date.now }
});
const Analysis = mongoose.model('Analysis', AnalysisSchema);

// 2. OpenAI Setup (You need an API Key)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 3. Multer Setup (File Upload)
const upload = multer({ storage: multer.memoryStorage() }); // Store in memory for immediate parsing

// 4. Helper: Text Extraction
const extractText = async (file) => {
    if (file.mimetype === 'application/pdf') {
        const data = await pdf(file.buffer);
        return data.text;
    } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return result.value;
    }
    throw new Error('Unsupported file format');
};

// 5. The Main Route
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        const { jobDescription } = req.body;
        const resumeFile = req.file;

        if (!resumeFile || !jobDescription) {
            return res.status(400).json({ error: 'Resume and Job Description are required' });
        }

        // A. Extract Text from Resume
        const resumeText = await extractText(resumeFile);

        // B. Send to AI for Analysis
        const prompt = `
  You are an expert Applicant Tracking System (ATS) and Technical Recruiter.
  Your goal is to evaluate a candidate's resume against a specific Job Description (JD).

  ---
  RESUME TEXT:
  "${resumeText.substring(0, 3000)}"

  JOB DESCRIPTION:
  "${jobDescription.substring(0, 3000)}"
  ---

  Please analyze the match and output a strict JSON object (no markdown, no extra text) with the following structure:
  {
    "score": (integer 0-100),
    "missingKeywords": ["array", "of", "critical", "technical", "skills", "missing"],
    "formattingIssues": ["array", "of", "potential", "formatting", "problems", "like", "columns", "or", "images"],
    "feedback": "A concise 2-3 sentence summary of why the candidate is or isn't a good fit."
  }

  SCORING CRITERIA:
  - 100-80: Strong Match (Has all critical hard skills and relevant experience).
  - 79-50: Potential Match (Has some skills but misses key technologies).
  - <50: Poor Match (Irrelevant experience or missing major requirements).

  IMPORTANT:
  - Focus heavily on "Hard Skills" (e.g., React, Node, AWS, Python) found in the JD but missing in the Resume.
  - Do not hallucinate skills not present in the JD.
`;

        const completion = await openai.chat.completions.create({
            messages: [{ role: "system", content: "You are a helpful ATS assistant." }, { role: "user", content: prompt }],
            model: "gpt-3.5-turbo", // Or gpt-4
        });

        const resultText = completion.choices[0].message.content;
        
        // Parse AI response (Ensure it handles JSON parsing safely in production)
        const analysisResult = JSON.parse(resultText);

        // C. Save to MongoDB
        const record = new Analysis({
            jobRole: 'Extracted from JD', // You could ask AI to extract the title too
            score: analysisResult.score,
            missingKeywords: analysisResult.missingKeywords
        });
        await record.save();

        res.json(analysisResult);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Analysis failed' });
    }
});

// Change the port line at the bottom to this:
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));