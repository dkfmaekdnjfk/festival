import json
import uuid
import asyncio
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from agents.learning_agent import LearningAgent
from services.session_service import SessionService
from services.obsidian_service import ObsidianService

app = FastAPI(title="Festival Learning Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = SessionService()


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/sessions")
async def list_sessions():
    return JSONResponse(content=list(session_service.sessions.values()))


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return JSONResponse(content=session)


class ExportRequest(BaseModel):
    obsidian_path: str
    api_key: str


@app.post("/sessions/{session_id}/export")
async def export_session(session_id: str, body: ExportRequest):
    session = session_service.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # Generate summary if not already present
    if session.get("summary") is None:
        try:
            agent = LearningAgent(api_key=body.api_key)
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
                api_key = message.get("api_key", "").strip()
                if not api_key:
                    await send({"type": "error", "message": "api_key is required in session_start"})
                    continue

                provider = message.get("provider", "anthropic")
                model = message.get("model") or None
                learning_agent = LearningAgent(api_key=api_key, provider=provider, model=model)
                obsidian_path = message.get("obsidian_path") or None

                title = message.get("title", "Untitled Lecture")
                speaker = message.get("speaker", "Unknown")
                session_type = message.get("session_type", "Lecture")

                session_service.create_session(
                    session_id=session_id,
                    title=title,
                    speaker=speaker,
                    session_type=session_type,
                )

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
