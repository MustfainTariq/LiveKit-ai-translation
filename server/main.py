import asyncio
import logging
import json

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


@dataclass
class Language:
    code: str
    name: str
    flag: str


languages = {
    "en": Language(code="en", name="English", flag="🇺🇸"),
    "es": Language(code="es", name="Spanish", flag="🇪🇸"),
    "fr": Language(code="fr", name="French", flag="🇫🇷"),
    "de": Language(code="de", name="German", flag="🇩🇪"),
    "ja": Language(code="ja", name="Japanese", flag="🇯🇵"),
}

LanguageCode = Enum(
    "LanguageCode",  # Name of the Enum
    {code: lang.name for code, lang in languages.items()},  # Enum entries
)


class Translator:
    def __init__(self, room: rtc.Room, lang: Language):
        self.room = room
        self.lang = lang
        
        # Initialize with a fresh context - we'll add system message in translate method
        self.system_prompt = (
            f"You are a translator for language: {lang.name}. "
            f"Your only response should be the exact translation of input text in the {lang.name} language."
        )
        self.llm = openai.LLM()
        logger.info(f"Initialized translator for {lang.name} language")

    async def translate(self, message: str, track: rtc.Track):
        try:
            logger.info(f"Translating message to {self.lang.name}: '{message[:50]}...'")
            
            # Simplified approach - direct prompt without context for now
            prompt = f"{self.system_prompt}\n\nTranslate this text: {message}"
            
            # Use OpenAI directly with a simple completion
            from openai import AsyncOpenAI
            client = AsyncOpenAI()
            
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": f"Translate this text: {message}"}
                ],
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

            if not translated_message.strip():
                logger.warning(f"Empty translation received for message: {message}")
                translated_message = f"[Translation unavailable for {self.lang.name}]"

            segment = rtc.TranscriptionSegment(
                id=utils.misc.shortuuid("SG_"),
                text=translated_message,
                start_time=0,
                end_time=0,
                language=self.lang.code,  # Use language code (ja, es) not name (Japanese, Spanish)
                final=True,
            )
            transcription = rtc.Transcription(
                self.room.local_participant.identity, "", [segment]
            )
            await self.room.local_participant.publish_transcription(transcription)

            logger.info(f"Successfully translated: '{message}' -> '{translated_message}' ({self.lang.name})")
            
        except Exception as e:
            logger.error(f"Translation failed for {self.lang.name}: {str(e)}")
            # Publish error message as fallback
            error_segment = rtc.TranscriptionSegment(
                id=utils.misc.shortuuid("SG_"),
                text=f"[Translation error for {self.lang.name}]",
                start_time=0,
                end_time=0,
                language=self.lang.code,  # Use language code (ja, es) not name (Japanese, Spanish)  
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
    stt_provider = speechmatics.STT()
    tasks = []
    translators = {}
    logger.info(f"🚀 Starting entrypoint for room: {job.room.name if job.room else 'unknown'}")
    logger.info(f"📝 Initialized empty translators dictionary: {translators}")
    logger.info(f"🔍 Translators dict ID: {id(translators)}")

    async def _forward_transcription(
        stt_stream: stt.SpeechStream,
        track: rtc.Track,
    ):
        """Forward the transcription and log the transcript in the console"""
        try:
            async for ev in stt_stream:
                # log to console
                if ev.type == stt.SpeechEventType.INTERIM_TRANSCRIPT:
                    print(ev.alternatives[0].text, end="")
                elif ev.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                    print("\n")
                    print(" -> ", ev.alternatives[0].text)
                    logger.info(f"Final transcript: {ev.alternatives[0].text}")

                    message = ev.alternatives[0].text
                    if message.strip():
                        logger.info(f"🎯 TRANSCRIPTION PROCESSING in room {job.room.name}")
                        logger.info(f"📊 Processing transcription for {len(translators)} translators")
                        logger.info(f"📋 Available translators: {list(translators.keys())}")
                        logger.info(f"🔍 Translators dict ID: {id(translators)}")
                        
                        # FIRST: Always publish the original English transcription
                        logger.info(f"📤 Publishing original English transcription: '{message}'")
                        try:
                            original_segment = rtc.TranscriptionSegment(
                                id=utils.misc.shortuuid("SG_"),
                                text=message,
                                start_time=0,
                                end_time=0,
                                language="en",  # Original language
                                final=True,
                            )
                            original_transcription = rtc.Transcription(
                                job.room.local_participant.identity, "", [original_segment]
                            )
                            await job.room.local_participant.publish_transcription(original_transcription)
                            logger.info(f"✅ Successfully published original English transcription")
                        except Exception as e:
                            logger.error(f"❌ Failed to publish original transcription: {str(e)}")
                        
                        # SECOND: Process translations for other languages
                        if translators:
                            for lang, translator in translators.items():
                                logger.info(f"📤 Sending transcription '{message}' to {lang} translator")
                                asyncio.create_task(translator.translate(message, track))
                        else:
                            logger.warning(f"⚠️ No translators available in room {job.room.name}, only English transcription published")
                            logger.warning(f"🔍 Debugging: translators dict = {translators} (ID: {id(translators)})")
                    else:
                        logger.debug("Empty transcription, skipping translation")
        except Exception as e:
            logger.error(f"STT transcription error: {str(e)}")
            raise

    async def transcribe_track(participant: rtc.RemoteParticipant, track: rtc.Track):
        try:
            logger.info(f"🎤 Starting transcription for participant {participant.identity}, track {track.sid}")
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
                    logger.info(f"🔊 Received audio frame #{frame_count} from {participant.identity}")
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
            logger.info(f"✅ Adding transcriber for participant: {participant.identity}")
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
            if lang == "en":
                logger.info(f"✅ Participant {participant.identity} requested English (original language)")
            elif lang in translators:
                logger.info(f"✅ Participant {participant.identity} requested existing language: {lang}")
                logger.info(f"📊 Current translators for this room: {list(translators.keys())}")
            else:
                # Check if the language is supported
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
        else:
            logger.debug(f"No caption language change for participant {participant.identity}")

    logger.info("Connecting to room...")
    await job.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    logger.info(f"Successfully connected to room: {job.room.name}")
    
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
