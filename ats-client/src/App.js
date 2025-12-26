import React, { useState } from 'react';
import axios from 'axios';
import './App.css'; // Add basic styling here

function App() {
  const [file, setFile] = useState(null);
  const [jobDescription, setJobDescription] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleAnalyze = async () => {
    if (!file || !jobDescription) {
      alert("Please upload a resume and enter a job description.");
      return;
    }

    const formData = new FormData();
    formData.append('resume', file);
    formData.append('jobDescription', jobDescription);

    setLoading(true);
    try {
      // Assuming backend is running on port 5000
      const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await axios.post(`${API_URL}/api/analyze`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(response.data);
    } catch (error) {
      console.error("Error analyzing resume:", error);
      alert("Analysis failed. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>AI ATS Resume Checker</h1>
      
      <div className="input-section">
        <h3>1. Upload Resume (PDF/Word)</h3>
        <input type="file" accept=".pdf,.docx" onChange={handleFileChange} />
        
        <h3>2. Paste Job Description</h3>
        <textarea 
          rows="10" 
          placeholder="Paste the JD here..." 
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />
        
        <br />
        <button onClick={handleAnalyze} disabled={loading}>
          {loading ? 'Analyzing...' : 'Check Score'}
        </button>
      </div>

      {result && (
  <div className="result-section">
    <div className="score-display">{result.score}% Match</div>
    
    <p><strong>Verdict:</strong> {result.feedback}</p>
    
    <h3>⚠️ Missing Keywords</h3>
    <div className="missing-keywords">
      <ul>
        {result.missingKeywords.map((kw, index) => (
          <li key={index}>{kw}</li>
        ))}
      </ul>
    </div>

    {result.formattingIssues && result.formattingIssues.length > 0 && (
      <div className="formatting-alert">
        <h3>📄 Formatting Alerts</h3>
        <ul>
          {result.formattingIssues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
    </div>
  );
}

export default App;