"""
Local Reranker Service for Continue.dev
Uses BGE reranker to improve semantic search context quality
"""
import os
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import CrossEncoder
import uvicorn

# Initialize FastAPI
app = FastAPI(title="Continue.dev Reranker Service")

# Enable CORS for local access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model instance
model = None

class RerankRequest(BaseModel):
    query: str
    documents: List[str]
    top_k: int = 5

class RerankResponse(BaseModel):
    ranked_documents: List[dict]

@app.on_event("startup")
async def load_model():
    """Load the reranker model on startup"""
    global model
    print("Loading BGE reranker model...")
    # Use tiny model for speed, or 'BAAI/bge-reranker-base' for quality
    model = CrossEncoder('BAAI/bge-reranker-v2-m3', max_length=512)
    print("✅ Model loaded successfully")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/rerank", response_model=RerankResponse)
async def rerank(request: RerankRequest):
    """
    Rerank documents based on query relevance
    
    Args:
        query: The search query
        documents: List of document strings to rerank
        top_k: Number of top results to return (default: 5)
    
    Returns:
        ranked_documents: List of {text, score, index} sorted by relevance
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    if not request.documents:
        return RerankResponse(ranked_documents=[])
    
    # Create query-document pairs
    pairs = [[request.query, doc] for doc in request.documents]
    
    # Get relevance scores
    scores = model.predict(pairs)
    
    # Combine documents with scores and original indices
    ranked = [
        {
            "text": doc,
            "score": float(score),
            "index": idx
        }
        for idx, (doc, score) in enumerate(zip(request.documents, scores))
    ]
    
    # Sort by score (descending) and take top_k
    ranked.sort(key=lambda x: x["score"], reverse=True)
    top_results = ranked[:request.top_k]
    
    return RerankResponse(ranked_documents=top_results)

@app.get("/")
async def root():
    """Root endpoint with service info"""
    return {
        "service": "Continue.dev Reranker",
        "model": "BAAI/bge-reranker-v2-m3",
        "endpoints": {
            "health": "/health",
            "rerank": "/rerank (POST)"
        }
    }

if __name__ == "__main__":
    # Run on port 5001 to avoid conflicts
    uvicorn.run(app, host="127.0.0.1", port=5001, log_level="info")
