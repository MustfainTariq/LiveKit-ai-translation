# Server Setup Guide

## Environment Variables

Create a `.env` file in the server directory with the following variables:

```bash
# LiveKit Configuration
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# OpenAI Configuration (for translations)
OPENAI_API_KEY=

# Speechmatics Configuration (for STT)
SPEECHMATICS_API_KEY=

```

## Installation

1. Create a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:
   ```bash
   python main.py dev
   ```

## API Keys Required

- **LiveKit**: Get from your LiveKit server setup
- **OpenAI**: Get from [OpenAI Platform](https://platform.openai.com/)
- **Speechmatics**: Get from [Speechmatics Console](https://console.speechmatics.com/) 