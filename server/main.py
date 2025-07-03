import asyncio
import logging
import json
import time
import re
import websockets
from typing import Set, Any

from enum import Enum
from dataclasses import dataclass, asdict

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    JobRequest,
    WorkerOptions,
    cli,
    stt,
    llm,
    utils,
)
from livekit.plugins import openai, silero, speechmatics
from livekit.plugins.speechmatics.types import TranscriptionConfig
from dotenv import load_dotenv

# Import settings from web server
try:
    from web_server import get_current_settings
    SETTINGS_AVAILABLE = True
except ImportError:
    print("Warning: Could not import settings from web_server. Using default values.")
    SETTINGS_AVAILABLE = False

load_dotenv()

logger = logging.getLogger("transcriber")

# WebSocket server for display clients
connected_displays: Set[Any] = set()

async def register_display(websocket):
    """Register a new display client"""
    global connected_displays
    
    connected_displays.add(websocket)
    logger.info(f"Display client connected. Total displays: {len(connected_displays)}")
    try:
        await websocket.wait_closed()
    finally:
        connected_displays.discard(websocket)
        logger.info(f"Display client disconnected. Total displays: {len(connected_displays)}")

async def broadcast_to_displays(message_type: str, language: str, text: str):
    """Broadcast transcription/translation to all connected display clients"""
    global connected_displays
    
    if not connected_displays:
        logger.debug(f"No display clients connected to receive {message_type}")
        return
    
    message = {
        "type": message_type,
        "language": language,
        "text": text,
        "timestamp": time.time()
    }
    
    message_json = json.dumps(message)
    logger.info(f"Broadcasting to {len(connected_displays)} displays: {message_type} ({language}): {text[:50]}...")
    
    # Send to all connected displays
    disconnected = set()
    for websocket in connected_displays.copy():
        try:
            await websocket.send(message_json)
        except websockets.exceptions.ConnectionClosed:
            disconnected.add(websocket)
        except Exception as e:
            logger.error(f"Error broadcasting to display: {e}")
            disconnected.add(websocket)
    
    # Remove disconnected clients
    connected_displays -= disconnected

async def start_websocket_server():
    """Start WebSocket server for display clients"""
    logger.info("Starting WebSocket server for display clients on port 8765...")
    server = await websockets.serve(register_display, "localhost", 8765)
    logger.info("WebSocket server started on ws://localhost:8765")
    return server


@dataclass
class Language:
    code: str
    name: str
    flag: str


languages = {
    "ar": Language(code="ar", name="Arabic", flag="🇸🇦"),
    "en": Language(code="en", name="English", flag="🇺🇸"),
    "es": Language(code="es", name="Spanish", flag="🇪🇸"),
    "fr": Language(code="fr", name="French", flag="🇫🇷"),
    "de": Language(code="de", name="German", flag="🇩🇪"),
    "ja": Language(code="ja", name="Japanese", flag="🇯🇵"),
    "nl": Language(code="nl", name="Dutch", flag="🇳🇱"),  # Added Dutch
}

LanguageCode = Enum(
    "LanguageCode",  # Name of the Enum
    {lang.name: code for code, lang in languages.items()},  # Enum entries: name -> code mapping
)

class Translator:
    def __init__(self, room: rtc.Room, lang: Enum, max_context_pairs: int = 10):
        self.room = room
        self.lang = lang
        self.max_context_pairs = max_context_pairs  # Maximum number of user-assistant pairs to keep
        
        # Track messages manually since ChatContext doesn't expose messages
        self.message_history = []  # List of (role, content) tuples
        
        # Get custom prompt from settings if available
        custom_prompt = ""
        if SETTINGS_AVAILABLE:
            try:
                settings = get_current_settings()
                custom_prompt = settings.llm.custom_prompt
            except Exception as e:
                logger.warning(f"Could not get custom prompt from settings: {e}")
        
        # Use custom prompt if available, otherwise use default
        if custom_prompt.strip():
            # Replace {language} placeholder in custom prompt
            prompt_text = custom_prompt.replace("{language}", lang.value).replace("{lang}", lang.value)
            self.system_message = ("system", prompt_text)
            logger.info(f"🎯 TRANSLATOR CREATED for {lang.value} with CUSTOM PROMPT:")
            logger.info(f"   📝 Prompt length: {len(prompt_text)} characters")
            logger.info(f"   📝 Prompt preview: {prompt_text[:150]}{'...' if len(prompt_text) > 150 else ''}")
        else:
            self.system_message = (
                "system",
                f"You are a translator for language: {lang.value}. "
                f"Your only response should be the exact translation of input text in the {lang.value} language."
            )
            logger.info(f"🎯 TRANSLATOR CREATED for {lang.value} with DEFAULT PROMPT")
            logger.info(f"   📝 Default prompt: {self.system_message[1]}")
        
        # Initialize context with system message
        self._rebuild_context()
        self.llm = openai.LLM()

    def _rebuild_context(self):
        """Rebuild the ChatContext with current message history"""
        self.context = llm.ChatContext()
        
        # Add system message
        self.context.add_message(
            role=self.system_message[0],
            content=self.system_message[1]
        )
        
        # Add conversation messages
        for role, content in self.message_history:
            self.context.add_message(role=role, content=content)

    def _maintain_context_window(self):
        """Maintain rolling context window by keeping only the last N translation pairs"""
        # Get current context settings
        context_enabled = True
        context_sentences = self.max_context_pairs
        
        if SETTINGS_AVAILABLE:
            try:
                settings = get_current_settings()
                context_enabled = settings.llm.context_enabled
                context_sentences = settings.llm.context_sentences
                logger.debug(f"🔧 CONTEXT MANAGEMENT for {self.lang.value}: enabled={context_enabled}, max_sentences={context_sentences}")
            except Exception as e:
                logger.warning(f"Could not get LLM context settings: {e}")
        else:
            logger.debug(f"⚠️ CONTEXT MANAGEMENT: Using defaults for {self.lang.value}: enabled={context_enabled}, max_sentences={context_sentences}")
        
        # If context is disabled, clear message history except system message
        if not context_enabled:
            old_length = len(self.message_history)
            self.message_history = []
            self._rebuild_context()
            logger.info(f"🧠 LLM CONTEXT DISABLED for {self.lang.value}: cleared {old_length} messages from history")
            return
        
        # Keep only the last context_sentences * 2 messages (user-assistant pairs)
        max_conversation_messages = context_sentences * 2
        
        if len(self.message_history) > max_conversation_messages:
            old_length = len(self.message_history)
            # Keep only the most recent messages
            self.message_history = self.message_history[-max_conversation_messages:]
            
            # Rebuild context with updated message history
            self._rebuild_context()
            
            logger.info(f"📚 CONTEXT WINDOW TRIMMED for {self.lang.value}: {old_length} -> {len(self.message_history)} messages (max: {context_sentences} pairs)")
        else:
            logger.debug(f"📚 CONTEXT WINDOW OK for {self.lang.value}: {len(self.message_history)} messages (under limit of {context_sentences} pairs)")

    async def translate(self, message: str, track: rtc.Track):
        # DEBUG: Print current settings before translation
        if SETTINGS_AVAILABLE:
            try:
                settings = get_current_settings()
                logger.info(f"🔧 TRANSLATION DEBUG for {self.lang.value}:")
                logger.info(f"   📝 Input text: '{message[:50]}{'...' if len(message) > 50 else ''}'")
                logger.info(f"   🧠 LLM Context: {'ENABLED' if settings.llm.context_enabled else 'DISABLED'}")
                logger.info(f"   📚 Context Sentences: {settings.llm.context_sentences}")
                logger.info(f"   💬 Current History Length: {len(self.message_history)} messages")
                logger.info(f"   🎯 Custom Prompt: {'YES' if settings.llm.custom_prompt else 'NO (using default)'}")
            except Exception as e:
                logger.warning(f"❌ Could not get settings for translation debug: {e}")
        else:
            logger.warning(f"⚠️ TRANSLATION DEBUG: Settings not available for {self.lang.value}")
        
        # Add user message to history
        self.message_history.append(("user", message))
        
        # Maintain context window before translation
        self._maintain_context_window()
        
        # Rebuild context to include the new user message
        self._rebuild_context()
        
        stream = self.llm.chat(chat_ctx=self.context)
        translated_message = ""
        async for chunk in stream:
            if chunk.delta is None:
                continue
            content = chunk.delta.content
            if content is None:
                break
            translated_message += content

        # Add assistant's response to history
        self.message_history.append(("assistant", translated_message))
        
        # Maintain context window after adding assistant response
        self._maintain_context_window()

        segment = rtc.TranscriptionSegment(
            id=utils.misc.shortuuid("SG_"),
            text=translated_message,
            start_time=0,
            end_time=0,
            language=self.lang.value,
            final=True,
        )
        transcription = rtc.Transcription(
            self.room.local_participant.identity, track.sid if track else "", [segment]
        )
        await self.room.local_participant.publish_transcription(transcription)

        # Also broadcast translation to WebSocket displays
        asyncio.create_task(
            broadcast_to_displays("translation", self.lang.value, translated_message)
        )

        print(
            f"message: {message}, translated to {self.lang.value}: {translated_message}"
        )
        
        # Enhanced debug logging for translation result
        logger.info(f"🎯 TRANSLATION COMPLETED for {self.lang.value}:")
        logger.info(f"   📝 Input: '{message[:50]}{'...' if len(message) > 50 else ''}'")
        logger.info(f"   ✅ Output: '{translated_message[:50]}{'...' if len(translated_message) > 50 else ''}'")
        logger.info(f"   📚 Final context size: {len(self.message_history)} conversation messages + 1 system message")
        logger.debug(f"   📊 Full translation: {translated_message}")

def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(job: JobContext):
    # Configure source language - ARABIC as default
    # This will be the language that users are actually speaking (host/speaker language)
    source_language = "ar"  # Arabic is the default source language - host speaks Arabic
    
    # Get STT settings
    max_delay = 5.0  # Default value
    punctuation_sensitivity = 0.3  # Default value
    
    if SETTINGS_AVAILABLE:
        try:
            settings = get_current_settings()
            max_delay = settings.stt.max_delay
            punctuation_sensitivity = settings.stt.punctuation_overrides
            logger.info(f"✅ LOADED STT SETTINGS - max_delay: {max_delay}, punctuation_sensitivity: {punctuation_sensitivity}")
            logger.info(f"✅ LOADED LLM SETTINGS - context_enabled: {settings.llm.context_enabled}, context_sentences: {settings.llm.context_sentences}")
            logger.info(f"✅ CUSTOM PROMPT LENGTH: {len(settings.llm.custom_prompt)} characters")
            if settings.llm.custom_prompt:
                logger.info(f"✅ CUSTOM PROMPT PREVIEW: {settings.llm.custom_prompt[:100]}...")
        except Exception as e:
            logger.warning(f"❌ Could not get STT settings, using defaults: {e}")
    else:
        logger.warning(f"⚠️ SETTINGS NOT AVAILABLE - Using hardcoded defaults: max_delay={max_delay}, punctuation_sensitivity={punctuation_sensitivity}")
    
    # Configure Speechmatics STT for Arabic speech recognition
    # Speechmatics supports Arabic language recognition with enhanced settings
    logger.info(f"🎤 CONFIGURING STT WITH: max_delay={max_delay}, punctuation_sensitivity={punctuation_sensitivity}")
    stt_provider = speechmatics.STT(
        transcription_config=TranscriptionConfig(
            language="ar",
            enable_partials=True,
            max_delay=max_delay,
            punctuation_overrides={"sensitivity": punctuation_sensitivity},
            diarization="speaker"
        )
    )  # Configure for Arabic using Speechmatics with partials, configurable delay, and speaker diarization
    
    tasks = []
    translators = {}
    
    # ALWAYS add Dutch translator for display page
    # Create Dutch enum member using getattr to avoid linter issues
    dutch_enum = getattr(LanguageCode, 'Dutch')
    translators["nl"] = Translator(job.room, dutch_enum)
    logger.info(f"🇳🇱 AUTOMATICALLY added Dutch translator for display page")
    
    # Sentence accumulation for proper sentence-by-sentence translation
    accumulated_text = ""  # Accumulates text until we get a complete sentence
    last_final_transcript = ""  # Keep track of the last final transcript to avoid duplicates
    translation_delay = 10.0  # Reduced to 2 seconds for faster incomplete sentence translation
    pending_translation_task = None
    
    logger.info(f"🚀 Starting entrypoint for room: {job.room.name if job.room else 'unknown'}")
    logger.info(f"📝 Initialized translators with Dutch: {list(translators.keys())}")
    logger.info(f"🔍 Translators dict ID: {id(translators)}")
    logger.info(f"🗣️ STT configured for {languages[source_language].name} speech recognition using Speechmatics (source language: {source_language})")
    logger.info(f"🇸🇦 ARABIC is set as the default host/speaker language")

    def _extract_complete_sentences(text: str):
        """Extract complete sentences from text and return them along with remaining incomplete text"""
        if not text.strip():
            return [], ""
        
        # Use regex to find sentence endings - be more flexible with sentence detection
        # Added Arabic punctuation marks
        sentence_pattern = r'([.!?؟]+)'
        parts = re.split(sentence_pattern, text)
        
        complete_sentences = []
        remaining_text = ""
        
        i = 0
        while i < len(parts):
            if i + 1 < len(parts) and re.match(r'[.!?؟]+', parts[i+1]):
                # This is a complete sentence
                sentence = (parts[i] + parts[i+1]).strip()
                if sentence and not sentence.isspace():
                    complete_sentences.append(sentence)
                i += 2
            else:
                # This might be incomplete text at the end
                remaining_text = parts[i].strip()
                break
        
        return complete_sentences, remaining_text

    async def _translate_sentences(sentences: list[str]):
        """Translate complete sentences to all target languages"""
        if not sentences or not translators:
            return
            
        for sentence in sentences:
            if sentence.strip():
                logger.info(f"🎯 TRANSLATING COMPLETE ARABIC SENTENCE: '{sentence}'")
                logger.info(f"📊 Processing sentence for {len(translators)} translators")
                
                # Send to all translators concurrently for better performance
                translation_tasks = []
                for lang, translator in translators.items():
                    logger.info(f"📤 Sending complete Arabic sentence '{sentence}' to {lang} translator")
                    translation_tasks.append(translator.translate(sentence, None))
                
                # Execute all translations concurrently
                if translation_tasks:
                    await asyncio.gather(*translation_tasks, return_exceptions=True)

    async def _delayed_translation(text: str, delay: float):
        """Wait for delay, then translate incomplete text if no new updates came in"""
        nonlocal pending_translation_task
        
        try:
            await asyncio.sleep(delay)
            # Check if this is still the latest translation task
            if pending_translation_task and not pending_translation_task.cancelled():
                if text.strip():
                    logger.info(f"⏰ DELAYED TRANSLATION of incomplete Arabic text: '{text}'")
                    await _translate_sentences([text])
                pending_translation_task = None
        except asyncio.CancelledError:
            logger.debug("Translation task was cancelled (newer transcript received)")

    async def _forward_transcription(
        stt_stream: stt.SpeechStream,
        track: rtc.Track,
    ):
        """Forward the transcription and log the transcript in the console"""
        nonlocal accumulated_text, last_final_transcript, pending_translation_task
        
        try:
            async for ev in stt_stream:
                # Log to console for interim (word-by-word)
                if ev.type == stt.SpeechEventType.INTERIM_TRANSCRIPT:
                    print(ev.alternatives[0].text, end="", flush=True)
                    
                    # Publish interim transcription for real-time word-by-word display
                    interim_text = ev.alternatives[0].text.strip()
                    if interim_text:
                        try:
                            interim_segment = rtc.TranscriptionSegment(
                                id=utils.misc.shortuuid("SG_"),
                                text=interim_text,
                                start_time=0,
                                end_time=0,
                                language=source_language,  # Arabic
                                final=False,  # This is interim, not final
                            )
                            interim_transcription = rtc.Transcription(
                                job.room.local_participant.identity, "", [interim_segment]
                            )
                            await job.room.local_participant.publish_transcription(interim_transcription)
                        except Exception as e:
                            logger.debug(f"Failed to publish interim transcription: {str(e)}")
                    
                elif ev.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                    print("\n")
                    final_text = ev.alternatives[0].text.strip()
                    print(" -> ", final_text)
                    logger.info(f"Final Arabic transcript: {final_text}")

                    if final_text and final_text != last_final_transcript:
                        last_final_transcript = final_text
                        
                        # Publish final transcription for the original language (Arabic)
                        try:
                            final_segment = rtc.TranscriptionSegment(
                                id=utils.misc.shortuuid("SG_"),
                                text=final_text,
                                start_time=0,
                                end_time=0,
                                language=source_language,  # Arabic
                                final=True,
                            )
                            final_transcription = rtc.Transcription(
                                job.room.local_participant.identity, "", [final_segment]
                            )
                            await job.room.local_participant.publish_transcription(final_transcription)
                            
                            # Also broadcast Arabic transcription to WebSocket display clients
                            asyncio.create_task(broadcast_to_displays("transcription", source_language, final_text))
                            
                            logger.info(f"✅ Published final {languages[source_language].name} transcription: '{final_text}'")
                        except Exception as e:
                            logger.error(f"❌ Failed to publish final transcription: {str(e)}")
                        
                        # Handle translation logic
                        if translators:
                            # Improved text accumulation logic
                            if accumulated_text:
                                # Check if the new text is an extension of previous text or completely new
                                if final_text.startswith(accumulated_text.strip()):
                                    # New text extends the previous - replace accumulated text
                                    accumulated_text = final_text
                                elif accumulated_text.strip() in final_text:
                                    # Previous text is contained in new text - replace accumulated text
                                    accumulated_text = final_text
                                elif len(final_text.split()) == 1 and len(accumulated_text.split()) >= 1:
                                    # Single word - might be continuation, append with space
                                    accumulated_text = accumulated_text.strip() + " " + final_text
                                else:
                                    # Completely new text - process previous accumulated text first, then start new
                                    if accumulated_text.strip():
                                        complete_sentences, remaining = _extract_complete_sentences(accumulated_text)
                                        if complete_sentences:
                                            await _translate_sentences(complete_sentences)
                                        # Also translate any remaining incomplete text before starting new
                                        #if remaining.strip():
                                        #    await _translate_sentences([remaining])
                                    accumulated_text = final_text
                            else:
                                accumulated_text = final_text
                            
                            logger.info(f"📝 Updated accumulated Arabic text: '{accumulated_text}'")
                            
                            # Extract complete sentences from accumulated text
                            complete_sentences, remaining_text = _extract_complete_sentences(accumulated_text)
                            
                            if complete_sentences:
                                # We have complete sentences - translate them immediately
                                logger.info(f"🎯 Found {len(complete_sentences)} complete Arabic sentences: {complete_sentences}")
                                
                                # Cancel any pending translation
                                if pending_translation_task:
                                    pending_translation_task.cancel()
                                    pending_translation_task = None
                                
                                # Translate complete sentences
                                await _translate_sentences(complete_sentences)
                                
                                # Update accumulated text to only remaining incomplete text
                                accumulated_text = remaining_text
                                logger.info(f"📝 Updated accumulated Arabic text after sentence extraction: '{accumulated_text}'")
                            
                            # Handle remaining incomplete text with shorter delay
                            if accumulated_text.strip():
                                logger.info(f"📝 Incomplete Arabic text remaining, setting up delayed translation: '{accumulated_text}'")
                                
                                # Cancel any previous pending translation
                                if pending_translation_task:
                                    pending_translation_task.cancel()
                                
                                # Set up new delayed translation for incomplete text
                                pending_translation_task = asyncio.create_task(
                                    _delayed_translation(accumulated_text, translation_delay)
                                )
                            else:
                                # No remaining text - cancel any pending translation
                                if pending_translation_task:
                                    pending_translation_task.cancel()
                                    pending_translation_task = None
                        else:
                            logger.warning(f"⚠️ No translators available in room {job.room.name}, only {languages[source_language].name} transcription published")
                    else:
                        logger.debug("Empty or duplicate transcription, skipping")
        except Exception as e:
            logger.error(f"STT transcription error: {str(e)}")
            raise

    async def transcribe_track(participant: rtc.RemoteParticipant, track: rtc.Track):
        try:
            logger.info(f"🎤 Starting Arabic transcription for participant {participant.identity}, track {track.sid}")
            audio_stream = rtc.AudioStream(track)
            stt_stream = stt_provider.stream()
            stt_task = asyncio.create_task(
                _forward_transcription(stt_stream, track)
            )
            tasks.append(stt_task)

            frame_count = 0
            async for ev in audio_stream:
                frame_count += 1
                if frame_count % 100 == 0:  # Log every 100 frames to avoid spam
                    logger.debug(f"🔊 Received audio frame #{frame_count} from {participant.identity}")
                stt_stream.push_frame(ev.frame)
                
            logger.warning(f"🔇 Audio stream ended for {participant.identity}")
        except Exception as e:
            logger.error(f"❌ Transcription track error for {participant.identity}: {str(e)}")
            raise

    @job.room.on("track_subscribed")
    def on_track_subscribed(
        track: rtc.Track,
        publication: rtc.TrackPublication,
        participant: rtc.RemoteParticipant,
    ):
        logger.info(f"🎵 Track subscribed: {track.kind} from {participant.identity} (track: {track.sid})")
        logger.info(f"Track details - muted: {publication.muted}")
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"✅ Adding Arabic transcriber for participant: {participant.identity}")
            tasks.append(asyncio.create_task(transcribe_track(participant, track)))
        else:
            logger.info(f"❌ Ignoring non-audio track: {track.kind}")

    @job.room.on("track_published")
    def on_track_published(publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
        logger.info(f"📡 Track published: {publication.kind} from {participant.identity} (track: {publication.sid})")
        logger.info(f"Publication details - muted: {publication.muted}")

    @job.room.on("track_unpublished") 
    def on_track_unpublished(publication: rtc.TrackPublication, participant: rtc.RemoteParticipant):
        logger.info(f"📡 Track unpublished: {publication.kind} from {participant.identity}")

    @job.room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        logger.info(f"👥 Participant connected: {participant.identity}")

    @job.room.on("participant_disconnected")
    def on_participant_disconnected(participant: rtc.RemoteParticipant):
        logger.info(f"👥 Participant disconnected: {participant.identity}")

    @job.room.on("participant_attributes_changed")
    def on_attributes_changed(
        changed_attributes: dict[str, str], participant: rtc.Participant
    ):
        """
        When participant attributes change, handle new translation requests.
        """
        logger.info(f"🌍 Participant {participant.identity} attributes changed: {changed_attributes}")
        lang = changed_attributes.get("captions_language", None)
        if lang:
            if lang == source_language:
                logger.info(f"✅ Participant {participant.identity} requested {languages[source_language].name} (source language - Arabic)")
            elif lang in translators:
                logger.info(f"✅ Participant {participant.identity} requested existing language: {lang}")
                logger.info(f"📊 Current translators for this room: {list(translators.keys())}")
            else:
                # Check if the language is supported and different from source language
                if lang in languages:
                    try:
                        # Create a translator for the requested language using the language enum
                        language_obj = languages[lang]
                        language_enum = getattr(LanguageCode, language_obj.name)
                        
                        # Debug: Show current settings when creating new translator
                        if SETTINGS_AVAILABLE:
                            try:
                                settings = get_current_settings()
                                logger.info(f"🆕 CREATING NEW TRANSLATOR for {language_obj.name} with current settings:")
                                logger.info(f"   🧠 LLM Context: {'ENABLED' if settings.llm.context_enabled else 'DISABLED'} ({settings.llm.context_sentences} sentences)")
                                logger.info(f"   🎯 Custom Prompt: {'YES' if settings.llm.custom_prompt else 'NO'}")
                            except Exception as e:
                                logger.warning(f"❌ Could not show settings for new translator: {e}")
                        
                        translators[lang] = Translator(job.room, language_enum)
                        logger.info(f"🆕 Added translator for ROOM {job.room.name} (requested by {participant.identity}), language: {language_obj.name}")
                        logger.info(f"📊 Total translators for room {job.room.name}: {len(translators)} -> {list(translators.keys())}")
                        logger.info(f"🔍 Translators dict ID: {id(translators)}")
                        
                        # Debug: Verify the translator was actually added
                        if lang in translators:
                            logger.info(f"✅ Translator verification: {lang} successfully added to room translators")
                        else:
                            logger.error(f"❌ Translator verification FAILED: {lang} not found in translators dict")
                            
                    except Exception as e:
                        logger.error(f"❌ Error creating translator for {lang}: {str(e)}")
                else:
                    logger.warning(f"❌ Unsupported language requested by {participant.identity}: {lang}")
                    logger.info(f"💡 Supported languages: {list(languages.keys())}")
        else:
            logger.debug(f"No caption language change for participant {participant.identity}")

    # Start WebSocket server for display clients
    logger.info("Starting WebSocket server for display clients...")
    websocket_server = await start_websocket_server()
    
    logger.info("Connecting to room...")
    await job.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info(f"Successfully connected to room: {job.room.name}")
    logger.info(f"📡 WebSocket server running - display clients can connect to ws://localhost:8765")
    
    # Debug room state after connection
    logger.info(f"Room participants: {len(job.room.remote_participants)}")
    for participant in job.room.remote_participants.values():
        logger.info(f"Participant: {participant.identity}")
        logger.info(f"  Audio tracks: {len(participant.track_publications)}")
        for sid, pub in participant.track_publications.items():
            logger.info(f"    Track {sid}: {pub.kind}, muted: {pub.muted}")

    # Also check local participant
    logger.info(f"Local participant: {job.room.local_participant.identity}")
    logger.info(f"Local participant tracks: {len(job.room.local_participant.track_publications)}")

    @job.room.local_participant.register_rpc_method("get/languages")
    async def get_languages(data: rtc.RpcInvocationData):
        languages_list = [asdict(lang) for lang in languages.values()]
        return json.dumps(languages_list)


async def request_fnc(req: JobRequest):
    await req.accept(
        name="agent",
        identity="agent",
    )


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint, prewarm_fnc=prewarm, request_fnc=request_fnc
        )
    )