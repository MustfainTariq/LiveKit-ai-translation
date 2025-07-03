import os
import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="Live Translation Display Server")

# Add CORS middleware for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Settings data model
class STTSettings(BaseModel):
    max_delay: float = 5.0
    punctuation_overrides: float = 0.3

class LLMSettings(BaseModel):
    context_enabled: bool = True
    context_sentences: int = 10
    custom_prompt: str = ""

class AppSettings(BaseModel):
    stt: STTSettings = STTSettings()
    llm: LLMSettings = LLMSettings()

# Global settings state
current_settings = AppSettings()

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

@app.get("/api/settings")
async def get_settings():
    """Get current settings"""
    return current_settings

@app.post("/api/settings")
async def update_settings(settings: AppSettings):
    """Update settings"""
    global current_settings
    current_settings = settings
    
    # Save settings to file for persistence
    try:
        settings_file = "settings.json"
        with open(settings_file, "w") as f:
            json.dump(settings.dict(), f, indent=2)
    except Exception as e:
        print(f"Warning: Could not save settings to file: {e}")
    
    return {"status": "success", "message": "Settings updated successfully", "settings": current_settings}

@app.post("/api/settings/stt")
async def update_stt_settings(stt_settings: STTSettings):
    """Update only STT settings"""
    global current_settings
    current_settings.stt = stt_settings
    return {"status": "success", "message": "STT settings updated", "stt": current_settings.stt}

@app.post("/api/settings/llm")
async def update_llm_settings(llm_settings: LLMSettings):
    """Update only LLM settings"""
    global current_settings
    current_settings.llm = llm_settings
    return {"status": "success", "message": "LLM settings updated", "llm": current_settings.llm}

def load_settings():
    """Load settings from file if it exists"""
    global current_settings
    try:
        settings_file = "settings.json"
        if os.path.exists(settings_file):
            with open(settings_file, "r") as f:
                settings_data = json.load(f)
                current_settings = AppSettings(**settings_data)
                print(f"Loaded settings from {settings_file}")
        else:
            print("No existing settings file found, using defaults")
    except Exception as e:
        print(f"Error loading settings: {e}, using defaults")

def get_current_settings():
    """Function to get current settings for use in main.py"""
    return current_settings

if __name__ == "__main__":
    # Load settings on startup
    load_settings()
    
    # Run the server
    print("Starting Live Translation Display Server...")
    print("Display page connects to main.py via WebSocket on port 8765")
    print("Access the display page at: http://localhost:8080/display")
    print(f"Current settings: {current_settings}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    ) 