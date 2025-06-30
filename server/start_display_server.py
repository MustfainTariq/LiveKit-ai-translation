#!/usr/bin/env python3
"""
Startup script for the Live Translation Display Server
This serves the HTML display page with exact UI matching the screenshot.
"""

import os
import sys

def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import fastapi
        import uvicorn
        import livekit
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("\n📦 Please install dependencies first:")
        print("   cd server")
        print("   pip install -r requirements.txt")
        print("\n🔑 Also ensure your .env file has:")
        print("   LIVEKIT_API_KEY=your_key")
        print("   LIVEKIT_API_SECRET=your_secret")
        print("   LIVEKIT_URL=your_livekit_url")
        return False

def main():
    """Main startup function"""
    print("🚀 Starting Live Translation Display Server...")
    
    if not check_dependencies():
        sys.exit(1)
    
    # Import after dependency check
    from web_server import app
    import uvicorn
    
    print("\n📱 HTML Display Server")
    print("=" * 50)
    print("🎯 Purpose: Serve HTML page with exact UI from screenshot")
    print("🔗 URL format: http://localhost:8080/display?party_id=YOUR_PARTY_ID")
    print("📋 Features:")
    print("   - Black background")
    print("   - Arabic transcription (top right, RTL)")
    print("   - Dutch translation (bottom left)")
    print("   - Large, clean typography")
    print("   - Real-time LiveKit integration")
    print("\n🏃 Starting server on port 8080...")
    
    try:
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8080,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n👋 Display server stopped.")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main() 