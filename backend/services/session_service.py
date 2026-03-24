from datetime import datetime
from typing import Optional


class SessionService:
    sessions: dict = {}

    def create_session(
        self,
        session_id: str,
        title: str,
        speaker: str,
        session_type: str,
        group: str = "",
    ) -> dict:
        session = {
            "id": session_id,
            "title": title,
            "speaker": speaker,
            "session_type": session_type,
            "group": group,
            "started_at": datetime.now().isoformat(),
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
        return session

    def get_session(self, session_id: str) -> Optional[dict]:
        return self.sessions.get(session_id)

    def add_transcript_chunk(self, session_id: str, chunk: str, is_final: bool) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return

        chunk_entry = {
            "text": chunk,
            "is_final": is_final,
            "timestamp": datetime.now().isoformat(),
        }
        session["transcript_chunks"].append(chunk_entry)

        # Append to the running full transcript
        if chunk:
            separator = " " if session["transcript"] else ""
            session["transcript"] += separator + chunk

    def add_concept(self, session_id: str, concept: dict) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return

        # Avoid duplicate concept names (case-insensitive)
        existing_names = {c["name"].lower() for c in session["concepts"]}
        name = concept.get("name", "")
        if name and name.lower() not in existing_names:
            enriched = {
                **concept,
                "first_seen": datetime.now().isoformat(),
            }
            session["concepts"].append(enriched)

    def add_user_question(self, session_id: str, question: str, answer: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return

        qa_entry = {
            "question": question,
            "answer": answer,
            "timestamp": datetime.now().isoformat(),
        }
        session["user_questions"].append(qa_entry)

    def update_summary(self, session_id: str, summary: dict) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return

        session["summary"] = summary

        # Merge unclear_points from summary into session confusion_points
        unclear = summary.get("unclear_points", [])
        for point in unclear:
            if point not in session["confusion_points"]:
                session["confusion_points"].append(point)

    def end_session(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None:
            return

        session["ended_at"] = datetime.now().isoformat()
        session["status"] = "ended"
