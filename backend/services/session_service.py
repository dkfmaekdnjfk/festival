import json
from datetime import datetime
from pathlib import Path
from typing import Optional

# Sessions are persisted as JSON files in this directory
SESSIONS_DIR = Path(__file__).parent.parent / "sessions"


class SessionService:
    def __init__(self) -> None:
        SESSIONS_DIR.mkdir(exist_ok=True)
        # Load all existing sessions from disk into memory
        self.sessions: dict[str, dict] = {}
        for path in SESSIONS_DIR.glob("*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                self.sessions[data["id"]] = data
            except Exception:
                pass  # Skip corrupted files

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _save(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        path = SESSIONS_DIR / f"{session_id}.json"
        path.write_text(json.dumps(session, ensure_ascii=False, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def create_session(
        self,
        session_id: str,
        title: str,
        speaker: str,
        session_type: str,
        group: str = "",
        session_date: str = "",
    ) -> dict:
        now = datetime.now()
        session = {
            "id": session_id,
            "title": title,
            "speaker": speaker,
            "session_type": session_type,
            "group": group,
            "session_date": session_date if session_date else now.strftime("%Y-%m-%d"),
            "started_at": now.isoformat(),
            "ended_at": None,
            "transcript": "",
            "transcript_chunks": [],
            "concepts": [],
            "user_questions": [],
            "confusion_points": [],
            "summary": None,
            "status": "active",
        }
        self.sessions[session_id] = session
        self._save(session_id)
        return session

    def get_session(self, session_id: str) -> Optional[dict]:
        return self.sessions.get(session_id)

    def add_transcript_chunk(self, session_id: str, chunk: str, is_final: bool) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        session["transcript_chunks"].append({
            "text": chunk,
            "is_final": is_final,
            "timestamp": datetime.now().isoformat(),
        })
        if chunk:
            separator = " " if session["transcript"] else ""
            session["transcript"] += separator + chunk
        # Save periodically — only on final chunks to avoid excessive I/O
        if is_final:
            self._save(session_id)

    def add_concept(self, session_id: str, concept: dict) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        existing_names = {c["name"].lower() for c in session["concepts"]}
        name = concept.get("name", "")
        if name and name.lower() not in existing_names:
            session["concepts"].append({**concept, "first_seen": datetime.now().isoformat()})
            self._save(session_id)

    def add_user_question(self, session_id: str, question: str, answer: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        session["user_questions"].append({
            "question": question,
            "answer": answer,
            "timestamp": datetime.now().isoformat(),
        })
        self._save(session_id)

    def update_summary(self, session_id: str, summary: dict) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        session["summary"] = summary
        for point in summary.get("unclear_points", []):
            if point not in session["confusion_points"]:
                session["confusion_points"].append(point)
        self._save(session_id)

    def end_session(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return
        session["ended_at"] = datetime.now().isoformat()
        session["status"] = "ended"
        self._save(session_id)

    def reopen_session(self, session_id: str) -> None:
        """Reopen an ended session so recording can continue."""
        session = self.sessions.get(session_id)
        if session is None:
            return
        session["status"] = "active"
        session["ended_at"] = None
        self._save(session_id)
