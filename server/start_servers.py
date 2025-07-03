#!/usr/bin/env python3
"""
Startup script to run both the web server (for settings API) and the main transcription service.
This script starts both services concurrently.
"""

import subprocess
import sys
import time
import threading
import os

def run_web_server():
    """Run the web server for settings API and display page"""
    print("🌐 Starting Web Server (Settings API & Display)...")
    try:
        subprocess.run([sys.executable, "web_server.py"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Web server failed: {e}")
    except KeyboardInterrupt:
        print("🛑 Web server interrupted")

def run_main_service():
    """Run the main transcription service"""
    print("🎤 Starting Main Transcription Service...")
    time.sleep(2)  # Give web server a moment to start first
    try:
        subprocess.run([sys.executable, "main.py", "dev"], check=True)
    except subprocess.CalledProcessError as e:
        print(f"❌ Main service failed: {e}")
    except KeyboardInterrupt:
        print("🛑 Main service interrupted")

if __name__ == "__main__":
    print("🚀 Starting Live Translation Services...")
    print("📋 This will start:")
    print("   1. Web Server (Settings API) on http://localhost:8080")
    print("   2. Main Transcription Service with LiveKit")
    print("   3. WebSocket Display Server on ws://localhost:8765")
    print()
    
    # Change to server directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Create threads for both services
    web_thread = threading.Thread(target=run_web_server, daemon=True)
    main_thread = threading.Thread(target=run_main_service, daemon=True)
    
    try:
        # Start both services
        web_thread.start()
        main_thread.start()
        
        print("✅ Both services started!")
        print("🔧 Settings API: http://localhost:8080/api/settings")
        print("📺 Display Page: http://localhost:8080/display")
        print("🎯 Frontend can connect to ws://localhost:8765 for live updates")
        print()
        print("Press Ctrl+C to stop all services...")
        
        # Wait for both threads
        web_thread.join()
        main_thread.join()
        
    except KeyboardInterrupt:
        print("\n🛑 Shutting down all services...")
        sys.exit(0) 