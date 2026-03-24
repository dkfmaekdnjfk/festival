import json
import os
import uuid
import asyncio
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agents.learning_agent import LearningAgent
from services.session_service import SessionService
from services.obsidian_service import ObsidianService

load_dotenv()

# API keys from environment — used as fallback when client doesn't supply one
_ENV_API_KEYS: dict[str, str] = {
    "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
    "openai":    os.getenv("OPENAI_API_KEY", ""),
    "deepseek":  os.getenv("DEEPSEEK_API_KEY", ""),
    "gemini":    os.getenv("GEMINI_API_KEY", ""),
}


def _resolve_api_key(provider: str, client_key: str) -> str:
    """Return client_key if provided, otherwise fall back to env variable."""
    return client_key or _ENV_API_KEYS.get(provider, "")


app = FastAPI(title="Festival Learning Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = SessionService()

_schedules: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/env-keys")
async def env_keys():
    """Return which providers have an API key configured in the environment."""
    return {
        provider: bool(key)
        for provider, key in _ENV_API_KEYS.items()
    }


@app.get("/sessions")
async def list_sessions():
    sessions = []
    for s in session_service.sessions.values():
        serialized = dict(s)
        serialized["created_at"] = s.get("started_at", "")
        sessions.append(serialized)
    return JSONResponse(content=sessions)


@app.get("/groups")
async def list_groups():
    """Return all unique groups from existing sessions."""
    groups = sorted({
        s.get("group", "")
        for s in session_service.sessions.values()
        if s.get("group", "")
    })
    return groups


class ScheduleCreate(BaseModel):
    title: str
    group: str = ""
    speaker: str = ""
    session_type: str = "수업"
    day_of_week: int  # 0=Mon, 6=Sun
    time: str = ""  # "HH:MM"


@app.get("/schedules")
async def list_schedules():
    return list(_schedules.values())


@app.post("/schedules")
async def create_schedule(body: ScheduleCreate):
    schedule_id = str(uuid.uuid4())
    schedule = {
        "id": schedule_id,
        "title": body.title,
        "group": body.group,
        "speaker": body.speaker,
        "session_type": body.session_type,
        "day_of_week": body.day_of_week,
        "time": body.time,
        "created_at": datetime.now().isoformat(),
    }
    _schedules[schedule_id] = schedule
    return schedule


@app.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: str):
    if schedule_id not in _schedules:
        raise HTTPException(status_code=404, detail="Schedule not found")
    del _schedules[schedule_id]
    return {"ok": True}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return JSONResponse(content=session)


class ExportRequest(BaseModel):
    obsidian_path: str
    api_key: str = ""
    provider: str = "anthropic"


@app.post("/sessions/{session_id}/export")
async def export_session(session_id: str, body: ExportRequest):
    session = session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate summary if not already present
    if session.get("summary") is None:
        try:
            resolved_key = _resolve_api_key(body.provider, body.api_key)
            agent = LearningAgent(api_key=resolved_key, provider=body.provider)
            summary = await agent.generate_session_summary(session)
            session_service.update_summary(session_id, summary)
            session = session_service.get_session(session_id)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Summary generation failed: {exc}")

    try:
        obsidian_service = ObsidianService(vault_path=body.obsidian_path)
        file_path = await obsidian_service.save_lecture_note(session)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Obsidian export failed: {exc}")

    return {"obsidian_path": file_path}


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()

    learning_agent: Optional[LearningAgent] = None
    obsidian_path: Optional[str] = None

    async def send(payload: dict):
        await websocket.send_text(json.dumps(payload))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await send({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = message.get("type")

            # ------------------------------------------------------------------
            # session_start
            # ------------------------------------------------------------------
            if msg_type == "session_start":
                provider = message.get("provider", "anthropic")
                model = message.get("model") or None
                title = message.get("title", "Untitled Lecture")
                speaker = message.get("speaker", "Unknown")
                session_type = message.get("session_type", "Lecture")
                group = message.get("group", "")
                session_date = message.get("session_date", "")
                obsidian_path = message.get("obsidian_path") or None

                # Always create/persist the session first — before API key check
                if session_service.get_session(session_id) is None:
                    session_service.create_session(
                        session_id=session_id,
                        title=title,
                        speaker=speaker,
                        session_type=session_type,
                        group=group,
                        session_date=session_date,
                    )

                # Now resolve API key and initialise the agent
                api_key = _resolve_api_key(provider, message.get("api_key", "").strip())
                if not api_key:
                    await send({"type": "error", "message": f"API key not found. Set it in the app or add {provider.upper()}_API_KEY to backend/.env"})
                    continue

                learning_agent = LearningAgent(api_key=api_key, provider=provider, model=model)
                await send({"type": "status", "message": f"Session '{title}' started"})

            # ------------------------------------------------------------------
            # transcript
            # ------------------------------------------------------------------
            elif msg_type == "transcript":
                if learning_agent is None:
                    await send({"type": "error", "message": "Session not started. Send session_start first."})
                    continue

                session = session_service.get_session(session_id)
                if session is None:
                    await send({"type": "error", "message": "Session not found"})
                    continue

                text = message.get("text", "")
                is_final = message.get("is_final", False)

                session_service.add_transcript_chunk(session_id, text, is_final)

                # Only analyze on final chunks to avoid excess API calls
                if is_final and text.strip():
                    try:
                        # Re-fetch to get updated transcript
                        session = session_service.get_session(session_id)
                        analysis = await learning_agent.analyze_transcript_chunk(text, session)

                        # Persist new concepts
                        for concept in analysis.get("concepts", []):
                            session_service.add_concept(session_id, concept)

                        # Track confusion
                        if analysis.get("confusion_detected"):
                            notes = analysis.get("notes", "")
                            if notes:
                                session = session_service.get_session(session_id)
                                if notes not in session["confusion_points"]:
                                    session["confusion_points"].append(notes)

                        # Fetch updated session for response
                        session = session_service.get_session(session_id)
                        await send({
                            "type": "concept_update",
                            "concepts": session["concepts"],
                        })
                    except Exception as exc:
                        await send({"type": "error", "message": f"Transcript analysis failed: {exc}"})

            # ------------------------------------------------------------------
            # question
            # ------------------------------------------------------------------
            elif msg_type == "question":
                if learning_agent is None:
                    await send({"type": "error", "message": "Session not started. Send session_start first."})
                    continue

                session = session_service.get_session(session_id)
                if session is None:
                    await send({"type": "error", "message": "Session not found"})
                    continue

                question_text = message.get("text", "").strip()
                if not question_text:
                    await send({"type": "error", "message": "Question text is empty"})
                    continue

                try:
                    full_answer = ""
                    async for chunk in learning_agent.stream_answer_question(question_text, session):
                        full_answer += chunk
                        await send({
                            "type": "agent_response",
                            "text": chunk,
                            "streaming": True,
                        })

                    # Signal end of stream
                    await send({
                        "type": "agent_response",
                        "text": "",
                        "streaming": False,
                    })

                    # Persist the Q&A
                    session_service.add_user_question(session_id, question_text, full_answer)

                except Exception as exc:
                    await send({"type": "error", "message": f"Question answering failed: {exc}"})

            # ------------------------------------------------------------------
            # understanding_check
            # ------------------------------------------------------------------
            elif msg_type == "understanding_check":
                level = message.get("level")
                level_map = {1: "understood", 2: "unclear", 3: "confused"}
                label = level_map.get(level, "unknown")
                await send({"type": "status", "message": f"Understanding level recorded: {label}"})

            # ------------------------------------------------------------------
            # session_end
            # ------------------------------------------------------------------
            elif msg_type == "session_end":
                if learning_agent is None:
                    await send({"type": "error", "message": "Session not started."})
                    continue

                session = session_service.get_session(session_id)
                if session is None:
                    await send({"type": "error", "message": "Session not found"})
                    continue

                await send({"type": "status", "message": "Generating session summary..."})

                try:
                    summary = await learning_agent.generate_session_summary(session)
                    session_service.update_summary(session_id, summary)
                    session_service.end_session(session_id)

                    await send({"type": "session_summary", "data": summary})

                    # Save to Obsidian if path was provided
                    if obsidian_path:
                        try:
                            session = session_service.get_session(session_id)
                            obsidian_service = ObsidianService(vault_path=obsidian_path)
                            file_path = await obsidian_service.save_lecture_note(session)
                            await send({"type": "obsidian_saved", "path": file_path})
                        except Exception as obs_exc:
                            await send({"type": "error", "message": f"Obsidian save failed: {obs_exc}"})

                except Exception as exc:
                    await send({"type": "error", "message": f"Summary generation failed: {exc}"})

            else:
                await send({"type": "error", "message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        # Clean up: mark session as ended if it was active
        session = session_service.get_session(session_id)
        if session and session.get("status") == "active":
            session_service.end_session(session_id)
