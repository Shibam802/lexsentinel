from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import pandas as pd
import nltk
from nltk.tokenize import sent_tokenize
import re
import os
import uuid
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import asyncio
from concurrent.futures import ThreadPoolExecutor
import shutil
from pathlib import Path
import sqlite3
import hashlib
import hmac
import base64
import json
import time

nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

app = FastAPI(title="LexSentinel API", version="2.0.0")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
RESULTS_DIR = Path("results")
DB_PATH = os.environ.get("DB_PATH", "lexsentinel.db")
UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

SECRET_KEY = os.environ.get("SECRET_KEY", "lexsentinel-secret-change-in-production")
TOKEN_EXPIRE_HOURS = 24

jobs: dict = {}
executor = ThreadPoolExecutor(max_workers=2)
security = HTTPBearer()

# ── Database ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS analysis_history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            total INTEGER,
            positive INTEGER,
            negative INTEGER,
            neutral INTEGER,
            overall TEXT,
            created_at REAL NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)
    conn.commit()
    conn.close()

init_db()

# ── Auth ──────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = "lexsentinel2025"
    return hashlib.sha256(f"{salt}{password}".encode()).hexdigest()

def make_token(user_id: str, email: str) -> str:
    payload = {"user_id": user_id, "email": email, "exp": time.time() + TOKEN_EXPIRE_HOURS * 3600}
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    sig = hmac.new(SECRET_KEY.encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{data}.{sig}"

def verify_token(token: str) -> dict:
    try:
        data, sig = token.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), data.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise HTTPException(status_code=401, detail="Invalid token")
        payload = json.loads(base64.b64decode(data).decode())
        if payload["exp"] < time.time():
            raise HTTPException(status_code=401, detail="Token expired, please login again")
        return payload
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    return verify_token(credentials.credentials)

# ── Auth routes ───────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
def register(body: dict):
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, email, hash_password(password), time.time())
    )
    conn.commit()
    conn.close()

    token = make_token(user_id, email)
    return {"token": token, "user": {"id": user_id, "name": name, "email": email}}

@app.post("/api/auth/login")
def login(body: dict):
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()

    if not user or user["password_hash"] != hash_password(password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = make_token(user["id"], email)
    return {"token": token, "user": {"id": user["id"], "name": user["name"], "email": email}}

@app.get("/api/auth/me")
def me(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    user = conn.execute("SELECT id, name, email, created_at FROM users WHERE id = ?", (current_user["user_id"],)).fetchone()
    conn.close()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(user)

@app.get("/api/auth/history")
def history(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM analysis_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
        (current_user["user_id"],)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ── Model ─────────────────────────────────────────────────────────────────────

# print("Loading FLAN-T5 model...")
# MODEL_NAME = "google/flan-t5-small"
# tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
# model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
from transformers import pipeline
sentiment_pipeline = pipeline("sentiment-analysis", model=MODEL_NAME)
print("Model loaded successfully.")

# ── Analysis ──────────────────────────────────────────────────────────────────

def preprocess_text(text: str) -> str:
    text = re.sub(r'\s+', ' ', text.strip())
    text = re.sub(r'\b\d{1,2}/\d{1,2}/\d{4}\b', '[DATE]', text)
    text = re.sub(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', '[NAME]', text)
    return text

# def analyze_sentiment(text: str) -> str:
#     prompt = f"Classify the sentiment of this legal text as Positive, Negative, or Neutral: {text}"
#     inputs = tokenizer(prompt, return_tensors="pt", max_length=512, truncation=True)
#     outputs = model.generate(**inputs, max_length=10)
#     return tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
def analyze_sentiment(text: str) -> str:
    result = sentiment_pipeline(text[:512])[0]["label"]
    mapping = {"positive": "Positive", "negative": "Negative", "neutral": "Neutral"}
    return mapping.get(result.lower(), "Neutral")

def run_analysis(job_id: str, file_path: str, file_type: str, user_id: str, filename: str):
    try:
        jobs[job_id]["status"] = "processing"
        results = []
        texts = []

        if file_type == "csv":
            df = pd.read_csv(file_path)
            if "text" not in df.columns:
                raise ValueError("CSV must have a 'text' column.")
            texts = df["text"].dropna().tolist()
        else:
            with open(file_path, "r", encoding="utf-8") as f:
                texts = [f.read()]

        total_sentences = sum(
            1 for text in texts
            for s in sent_tokenize(preprocess_text(text))
            if len(s.strip()) > 10
        )

        processed = 0
        for text in texts:
            for sentence in sent_tokenize(preprocess_text(text)):
                if len(sentence.strip()) > 10:
                    raw = analyze_sentiment(sentence).lower()
                    label = "Positive" if "positive" in raw else "Negative" if "negative" in raw else "Neutral"
                    results.append({"text": sentence, "sentiment": label})
                    processed += 1
                    jobs[job_id]["progress"] = int((processed / total_sentences) * 100)

        sentiments = [r["sentiment"] for r in results]
        total = len(sentiments)
        positive = sentiments.count("Positive")
        negative = sentiments.count("Negative")
        neutral = sentiments.count("Neutral")

        if positive > negative and positive > neutral:
            overall, insight = "positive", "Predominantly positive tone — favorable outcomes indicated."
        elif negative > positive and negative > neutral:
            overall, insight = "negative", "Predominantly negative tone — potential issues indicated."
        else:
            overall, insight = "neutral", "Balanced or neutral tone — no strong directional bias."

        summary = {
            "total": total, "positive": positive, "negative": negative, "neutral": neutral,
            "positive_pct": round(positive / total * 100, 1) if total else 0,
            "negative_pct": round(negative / total * 100, 1) if total else 0,
            "neutral_pct": round(neutral / total * 100, 1) if total else 0,
            "overall": overall, "insight": insight,
        }

        out_csv = RESULTS_DIR / f"{job_id}.csv"
        pd.DataFrame(results).to_csv(out_csv, index=False)

        conn = get_db()
        conn.execute(
            "INSERT INTO analysis_history VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (job_id, user_id, filename, total, positive, negative, neutral, overall, time.time())
        )
        conn.commit()
        conn.close()

        jobs[job_id].update({
            "status": "done", "progress": 100,
            "summary": summary, "results": results[:200],
            "result_file": str(out_csv),
        })

    except Exception as e:
        jobs[job_id].update({"status": "error", "error": str(e)})
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    ext = Path(file.filename).suffix.lower()
    if ext not in [".txt", ".csv"]:
        raise HTTPException(status_code=400, detail="Only .txt and .csv files are supported.")

    job_id = str(uuid.uuid4())
    save_path = UPLOAD_DIR / f"{job_id}{ext}"

    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    jobs[job_id] = {"status": "queued", "progress": 0, "filename": file.filename, "job_id": job_id}

    loop = asyncio.get_event_loop()
    loop.run_in_executor(executor, run_analysis, job_id, str(save_path), ext.lstrip("."), current_user["user_id"], file.filename)

    return {"job_id": job_id}

@app.get("/api/job/{job_id}")
def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found.")
    job = jobs[job_id].copy()
    job.pop("result_file", None)
    return job

@app.get("/api/job/{job_id}/download")
def download_results(job_id: str, current_user: dict = Depends(get_current_user)):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found.")
    job = jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Results not ready yet.")
    return FileResponse(job["result_file"], media_type="text/csv", filename=f"results_{job_id[:8]}.csv")

@app.get("/api/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}
