# LexSentinel — Legal Sentiment Analyzer

Full-stack legal document sentiment analysis using FLAN-T5, FastAPI, React, and SQLite.

---

## Local Development

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\Activate.ps1        # Windows
source venv/bin/activate          # Mac/Linux
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Deployment

### Backend → Render.com
1. Push this repo to GitHub
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. Build command: `pip install -r requirements.txt`
6. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
7. Deploy → copy your Render URL (e.g. `https://lexsentinel-backend.onrender.com`)

### Frontend → Vercel.com
1. Go to https://vercel.com → New Project
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add **Environment Variable**:
   - Key: `VITE_API_URL`
   - Value: your Render backend URL (e.g. `https://lexsentinel-backend.onrender.com`)
5. Deploy

---

## Project Structure

```
lexsentinel/
├── backend/
│   ├── main.py           ← FastAPI app with auth + analysis
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx       ← React UI
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── render.yaml           ← Render deployment config
├── .gitignore
└── README.md
```
