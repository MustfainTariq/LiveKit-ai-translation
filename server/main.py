import asyncio
import logging
import json
import time
import re
import websockets
import websockets.server
import threading
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
from dotenv import load_dotenv

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
    {code: lang.name for code, lang in languages.items()},  # Enum entries
)


class Translator:
    def __init__(self, room: rtc.Room, lang: Language):
        self.room = room
        self.lang = lang
        self.conversation_context = []  # Store recent translations for context
        self.max_context_length = 5  # Keep last 5 translations for context
        
        logger.info(f"Initialized translator for {lang.name} language")

    async def translate(self, message: str, source_language: str = "ar"):  # Changed default to Arabic
        try:
            logger.info(f"Translating message from {source_language} to {self.lang.name}: '{message}'")
            
            # Get source language name
            source_lang_name = languages.get(source_language, Language(code=source_language, name=source_language.upper(), flag="")).name
            
            # Build context from recent translations
            context_str = ""
            if self.conversation_context:
                context_str = "\n\nRecent conversation context for reference:\n"
                for i, (orig, trans) in enumerate(self.conversation_context[-3:], 1):  # Last 3 for context
                    context_str += f"{source_lang_name}: \"{orig}\" → {self.lang.name}: \"{trans}\"\n"
            
            # Simple, direct system prompt without examples - optimized for Arabic source
            system_prompt = (
                f"You are a professional real-time translator specializing in Arabic to {self.lang.name} translation. "
                f"Translate the following {source_lang_name} text to {self.lang.name}. "
                f"Respond ONLY with the {self.lang.name} translation. Do not ask questions, provide explanations, or add any other text. "
                f"Translate incomplete phrases, single words, and partial sentences directly as they would naturally appear in {self.lang.name}. "
                f"Maintain the tone and style of the original Arabic text. Handle Arabic cultural context appropriately.{context_str}"
            )
            
            # Use OpenAI directly with a simple completion
            from openai import AsyncOpenAI
            client = AsyncOpenAI()
            
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message}
                ],
                temperature=0.1,  # Very low temperature for consistent translations
                max_tokens=150,   # Reasonable limit for translations
                stream=True
            )
            
            translated_message = ""
            async for chunk in response:
                # Handle OpenAI streaming response
                try:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        translated_message += content
                except Exception as chunk_error:
                    logger.warning(f"Error processing chunk: {chunk_error}, chunk: {chunk}")
                    continue

            # Clean up the translation
            translated_message = translated_message.strip()
            
            # Basic validation - if response seems like a question or explanation, retry once
            if (translated_message.lower().startswith(("please", "i need", "could you", "what", "which", "how can", "i cannot", "sorry")) 
                or "translate" in translated_message.lower()
                or len(translated_message.split()) > len(message.split()) * 3):  # If translation is suspiciously long
                
                logger.warning(f"AI gave explanation instead of translation: '{translated_message}', retrying with stronger prompt")
                
                # Retry with even more direct prompt
                retry_response = await client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": f"Translate Arabic to {self.lang.name}. Only output the translation, nothing else."},
                        {"role": "user", "content": f"Translate: {message}"}
                    ],
                    temperature=0.0,
                    max_tokens=100,
                    stream=True
                )
                
                translated_message = ""
                async for chunk in retry_response:
                    try:
                        if chunk.choices and chunk.choices[0].delta.content:
                            content = chunk.choices[0].delta.content
                            translated_message += content
                    except Exception as chunk_error:
                        logger.warning(f"Error processing retry chunk: {chunk_error}")
                        continue
                
                translated_message = translated_message.strip()
                
                # If still getting bad response, use original message as fallback
                if (translated_message.lower().startswith(("please", "i need", "could you", "what", "which", "how can", "i cannot", "sorry")) 
                    or "translate" in translated_message.lower()):
                    logger.error(f"AI still giving explanations after retry, using original message as fallback")
                    translated_message = message  # Use original as last resort

            if not translated_message.strip():
                logger.warning(f"Empty translation received for message: {message}")
                translated_message = message  # Use original message if empty

            # Update conversation context
            self.conversation_context.append((message, translated_message))
            if len(self.conversation_context) > self.max_context_length:
                self.conversation_context = self.conversation_context[-self.max_context_length:]

            # Publish the translation
            segment = rtc.TranscriptionSegment(
                id=utils.misc.shortuuid("SG_"),
                text=translated_message,
                start_time=0,
                end_time=0,
                language=self.lang.code,  # Use language code (ja, es, nl) not name (Japanese, Spanish, Dutch)
                final=True,
            )
            transcription = rtc.Transcription(
                self.room.local_participant.identity, "", [segment]
            )
            await self.room.local_participant.publish_transcription(transcription)

            # Also broadcast to WebSocket display clients
            asyncio.create_task(broadcast_to_displays("translation", self.lang.code, translated_message))

            logger.info(f"Successfully translated: '{message}' -> '{translated_message}' ({source_lang_name} to {self.lang.name})")
            
        except Exception as e:
            logger.error(f"Translation failed for {self.lang.name}: {str(e)}")
            # Publish error message as fallback
            error_segment = rtc.TranscriptionSegment(
                id=utils.misc.shortuuid("SG_"),
                text=f"[Translation error for {self.lang.name}]",
                start_time=0,
                end_time=0,
                language=self.lang.code,  # Use language code (ja, es, nl) not name (Japanese, Spanish, Dutch)  
                final=True,
            )
            error_transcription = rtc.Transcription(
                self.room.local_participant.identity, "", [error_segment]
            )
            try:
                await self.room.local_participant.publish_transcription(error_transcription)
            except Exception as publish_error:
                logger.error(f"Failed to publish error transcription: {str(publish_error)}")


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(job: JobContext):
    # Configure source language - ARABIC as default
    # This will be the language that users are actually speaking (host/speaker language)
    source_language = "ar"  # Arabic is the default source language - host speaks Arabic
    
    # Configure OpenAI STT for Arabic speech recognition
    # OpenAI Whisper has excellent Arabic language support
    stt_provider = openai.STT(language="ar")  # Explicitly configure for Arabic
    
    tasks = []
    translators = {}
    
    # ALWAYS add Dutch translator for display page
    dutch_language = languages["nl"]  # Dutch
    translators["nl"] = Translator(job.room, dutch_language)
    logger.info(f"🇳🇱 AUTOMATICALLY added Dutch translator for display page")
    
    # Sentence accumulation for proper sentence-by-sentence translation
    accumulated_text = ""  # Accumulates text until we get a complete sentence
    last_final_transcript = ""  # Keep track of the last final transcript to avoid duplicates
    translation_delay = 2.0  # Reduced to 2 seconds for faster incomplete sentence translation
    pending_translation_task = None
    
    logger.info(f"🚀 Starting entrypoint for room: {job.room.name if job.room else 'unknown'}")
    logger.info(f"📝 Initialized translators with Dutch: {list(translators.keys())}")
    logger.info(f"🔍 Translators dict ID: {id(translators)}")
    logger.info(f"🗣️ STT configured for {languages[source_language].name} speech recognition (source language: {source_language})")
    logger.info(f"🇸🇦 ARABIC is set as the default host/speaker language")

    def _extract_complete_sentences(text: str):
        """Extract complete sentences from text and return them along with remaining incomplete text"""
        if not text.strip():
            return [], ""
        
        # Use regex to find sentence endings - be more flexible with sentence detection
        # Added Arabic punctuation marks
        sentence_pattern = r'([.!?؟]+|\n)'
        parts = re.split(sentence_pattern, text)
        
        complete_sentences = []
        remaining_text = ""
        
        i = 0
        while i < len(parts):
            if i + 1 < len(parts) and re.match(r'[.!?\n؟]+', parts[i+1]):
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
                    translation_tasks.append(translator.translate(sentence, source_language))
                
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
                                        if remaining.strip():
                                            await _translate_sentences([remaining])
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
                        # Create a translator for the requested language using the language object
                        language_obj = languages[lang]
                        translators[lang] = Translator(job.room, language_obj)
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