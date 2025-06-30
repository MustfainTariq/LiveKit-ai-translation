import os
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

app = FastAPI(title="Live Translation Display Server")

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    """Root endpoint that serves the display page"""
    return {"message": "Live Translation Display Server", "usage": "/display for the display page"}

@app.get("/display")
async def display_page():
    """Serve the display page"""
    # Read the HTML file and return it
    try:
        with open("static/display.html", "r", encoding="utf-8") as f:
            html_content = f.read()
        return HTMLResponse(content=html_content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Display page not found")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "live-translation-display"}

if __name__ == "__main__":
    # Run the server
    print("Starting Live Translation Display Server...")
    print("Display page connects to main.py via WebSocket on port 8765")
    print("Access the display page at: http://localhost:8080/display")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    ) 