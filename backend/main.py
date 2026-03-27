import json
import os
import uuid
import asyncio
from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
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


_CONFUSION_PATTERNS = [
    "모르겠", "모르는", "잘 모르", "이해가 안", "이해못", "이해 못",
    "헷갈", "헷갈려", "어렵", "무슨 뜻", "뭔지", "왜 이렇", "왜이렇",
    "설명해줘", "설명해 줘", "무슨 말", "뭔 말",
    "don't understand", "confused", "unclear", "not sure", "what does", "what is",
]

def _is_confusion(text: str) -> bool:
    t = text.lower()
    return any(p in t for p in _CONFUSION_PATTERNS)


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


@app.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    api_key: str = Form(""),
    language: str = Form("ko"),
    prompt: str = Form(""),
    keywords: str = Form(""),   # 콤마 구분 키워드 힌트
    session_title: str = Form(""),
):
    """Transcribe audio using OpenAI Whisper API."""
    resolved_key = _resolve_api_key("openai", api_key)
    if not resolved_key:
        raise HTTPException(status_code=400, detail="OpenAI API key required for Whisper. Set OPENAI_API_KEY in backend/.env or provide it in Settings.")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=resolved_key)

    audio_bytes = await audio.read()
    raw_mime = (audio.content_type or "audio/webm").split(";")[0].strip()
    _mime_to_ext = {
        "audio/webm": "webm",
        "audio/ogg": "ogg",
        "audio/wav": "wav",
        "audio/mp4": "mp4",
        "audio/mpeg": "mp3",
        "audio/flac": "flac",
    }
    ext = _mime_to_ext.get(raw_mime, "webm")
    filename = f"audio.{ext}"

    kwargs: dict = dict(
        model="gpt-4o-transcribe",
        file=(filename, audio_bytes, raw_mime),
        language=language,
    )
    # 세션 제목 + 키워드를 프롬프트로 전달 — 전문 용어 인식 향상
    hint_parts = []
    if session_title:
        hint_parts.append(session_title)
    if keywords:
        hint_parts.append(keywords)
    if hint_parts:
        kwargs["prompt"] = ", ".join(hint_parts)

    try:
        response = await client.audio.transcriptions.create(**kwargs)
        return {"text": response.text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Whisper transcription failed: {exc}")


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
    # 개념 추출 빈도 조절: 충분한 텍스트가 쌓였을 때만 분석
    _pending_text: str = ""
    _ANALYSIS_THRESHOLD = 1500  # 1500자 누적 시 분석

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
                existing = session_service.get_session(session_id)
                if existing is None:
                    session_service.create_session(
                        session_id=session_id,
                        title=title,
                        speaker=speaker,
                        session_type=session_type,
                        group=group,
                        session_date=session_date,
                    )
                elif existing.get("status") == "ended":
                    # Resuming a completed session — reopen it
                    session_service.reopen_session(session_id)

                # Now resolve API key and initialise the agent
                api_key = _resolve_api_key(provider, message.get("api_key", "").strip())
                if not api_key:
                    await send({"type": "error", "message": f"API key not found. Set it in the app or add {provider.upper()}_API_KEY to backend/.env"})
                    continue

                learning_agent = LearningAgent(api_key=api_key, provider=provider, model=model)
                learning_agent.build_agent(session_id, session_service, send)

                # 기존 세션이 있으면 에이전트에 이전 맥락 주입 (이어 녹음 지원)
                session_data = session_service.get_session(session_id)
                if session_data:
                    prior_transcript = session_data.get("transcript", "").strip()
                    prior_concepts = session_data.get("concepts", [])
                    if prior_transcript or prior_concepts:
                        concepts_str = (
                            "\n".join(f"- {c['name']}: {c.get('definition','')}" for c in prior_concepts)
                            or "없음"
                        )
                        await learning_agent.prime_history(
                            transcript=prior_transcript,
                            concepts_str=concepts_str,
                        )
                        await send({
                            "type": "session_restored",
                            "transcript": prior_transcript,
                            "concepts": prior_concepts,
                        })

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

                # 누적 텍스트가 임계값을 넘으면 에이전트 루프 실행
                if is_final and text.strip():
                    _pending_text += " " + text.strip()

                if is_final and len(_pending_text) >= _ANALYSIS_THRESHOLD:
                    batch = _pending_text.strip()
                    _pending_text = ""
                    try:
                        # deepagents 루프 실행 — 도구 호출이 사이드 이펙트로 처리됨
                        # (add_concept → concept_update WS, send_message → agent_proactive WS)
                        await learning_agent.process_transcript(batch)
                    except Exception as exc:
                        await send({"type": "error", "message": f"분석 실패: {exc}"})

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
                    async def _on_keyword(kw: str) -> None:
                        added = session_service.add_keyword(session_id, kw)
                        if added:
                            sess = session_service.get_session(session_id)
                            await send({"type": "keyword_added", "keyword": kw, "keywords": sess.get("keywords", [])})

                    full_answer = ""
                    async for chunk in learning_agent.stream_answer_question(question_text, session, on_keyword=_on_keyword):
                        full_answer += chunk
                        await send({
                            "type": "agent_response",
                            "text": full_answer,
                            "streaming": True,
                        })

                    # Signal end of stream with final accumulated text
                    await send({
                        "type": "agent_response",
                        "text": full_answer,
                        "streaming": False,
                    })

                    # Persist the Q&A
                    session_service.add_user_question(session_id, question_text, full_answer)

                    # 사용자 질문에서 혼동 감지 → confusion_points 자동 기록
                    if _is_confusion(question_text):
                        sess = session_service.get_session(session_id)
                        if sess and question_text not in sess.get("confusion_points", []):
                            sess["confusion_points"].append(question_text)
                            session_service._save(session_id)
                            await send({"type": "confusion_noted", "description": question_text})

                except Exception as exc:
                    await send({"type": "error", "message": f"Question answering failed: {exc}"})

            # ------------------------------------------------------------------
            # add_keyword (UI에서 직접 입력)
            # ------------------------------------------------------------------
            elif msg_type == "add_keyword":
                kw = message.get("keyword", "").strip()
                if kw:
                    added = session_service.add_keyword(session_id, kw)
                    if added:
                        sess = session_service.get_session(session_id)
                        await send({"type": "keyword_added", "keyword": kw, "keywords": sess.get("keywords", [])})

            # ------------------------------------------------------------------
            # understanding_check
            # ------------------------------------------------------------------
            elif msg_type == "understanding_check":
                level = message.get("level")  # 1=모르겠음, 2=애매함, 3=이해됨
                session = session_service.get_session(session_id)

                if level == 3:
                    await send({"type": "understanding_feedback", "level": 3,
                                "message": "✅ 이해됨으로 기록했습니다."})

                elif level in (1, 2) and session:
                    # 최근 전사 내용을 confusion point로 기록
                    recent = session.get("transcript", "")[-300:].strip()
                    label = "잘 모르겠음" if level == 1 else "애매함"
                    point = f"[{label}] {recent}" if recent else label
                    if point not in session.setdefault("confusion_points", []):
                        session["confusion_points"].append(point)
                        session_service._save(session_id)
                    msg = "❓ 모르겠는 부분으로 기록했습니다." if level == 1 else "🤔 애매한 부분으로 기록했습니다."
                    await send({"type": "understanding_feedback", "level": level, "message": msg})

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
