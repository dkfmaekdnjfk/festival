import os
import re
from datetime import datetime

import aiofiles


class ObsidianService:
    def __init__(self, vault_path: str):
        self.vault_path = vault_path

    def _slugify(self, text: str) -> str:
        """Convert text to a URL/filename-safe slug."""
        text = text.lower()
        text = re.sub(r"[^\w\s]", "", text)
        text = re.sub(r"\s+", "_", text.strip())
        text = re.sub(r"[^\w]", "", text)
        return text

    async def save_lecture_note(self, session: dict) -> str:
        """
        Creates a Markdown lecture note at {vault_path}/Lectures/{date}_{title_slug}.md.
        Returns the file path.
        """
        title = session.get("title", "Untitled Lecture")
        speaker = session.get("speaker", "Unknown")
        session_type = session.get("session_type", "Lecture")
        transcript = session.get("transcript", "")
        user_questions = session.get("user_questions", [])
        summary_data = session.get("summary") or {}

        # Dates
        started_at = session.get("started_at", datetime.now().isoformat())
        try:
            date_str = datetime.fromisoformat(started_at).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            date_str = datetime.now().strftime("%Y-%m-%d")

        # Summary fields
        summary_text = summary_data.get("summary", "")
        key_concepts = summary_data.get("key_concepts", session.get("concepts", []))
        unclear_points = summary_data.get("unclear_points", session.get("confusion_points", []))
        review_questions = summary_data.get("review_questions", [])

        # Build auto-tags from concept names
        concept_tags = [self._slugify(c["name"]) for c in key_concepts if c.get("name")]
        tags_yaml = ", ".join(["lecture"] + concept_tags[:5])  # cap at 5 extra tags

        # Slug for filename
        slug = self._slugify(title) or "lecture"
        filename = f"{date_str}_{slug}.md"

        # Directory
        lectures_dir = os.path.join(self.vault_path, "Lectures")
        os.makedirs(lectures_dir, exist_ok=True)
        file_path = os.path.join(lectures_dir, filename)

        # Build markdown sections
        concepts_md = "\n".join(
            f"- **{c.get('name', '')}**: {c.get('definition', '')}"
            for c in key_concepts
        ) or "없음"

        unclear_md = "\n".join(
            f"- {point}" for point in unclear_points
        ) or "없음"

        review_md = "\n".join(
            f"{i + 1}. **Q**: {rq.get('question', '')}\n   **A**: {rq.get('answer', '')}"
            for i, rq in enumerate(review_questions)
        ) or "없음"

        user_questions_md = "\n\n".join(
            f"**Q**: {qa.get('question', '')}\n\n**A**: {qa.get('answer', '')}"
            for qa in user_questions
        ) or "없음"

        content = f"""---
title: {title}
date: {date_str}
speaker: {speaker}
tags: [{tags_yaml}]
---

# {title}

**날짜**: {date_str}
**발표자**: {speaker}
**유형**: {session_type}

## 핵심 요약
{summary_text or "요약 없음"}

## 주요 개념
{concepts_md}

## 이해가 약한 부분
{unclear_md}

## 복습 질문
{review_md}

## 사용자 질문
{user_questions_md}

## 원문 전사
{transcript or "전사 없음"}
"""

        async with aiofiles.open(file_path, mode="w", encoding="utf-8") as f:
            await f.write(content)

        return file_path

    async def save_concept_note(self, concept: dict, vault_path: str) -> str:
        """
        Creates or updates {vault_path}/Concepts/{name}.md for a single concept.
        Returns the file path.
        """
        name = concept.get("name", "Unknown Concept")
        definition = concept.get("definition", "")
        first_seen = concept.get("first_seen", datetime.now().isoformat())

        try:
            date_str = datetime.fromisoformat(first_seen).strftime("%Y-%m-%d")
        except (ValueError, TypeError):
            date_str = datetime.now().strftime("%Y-%m-%d")

        concepts_dir = os.path.join(vault_path, "Concepts")
        os.makedirs(concepts_dir, exist_ok=True)

        safe_name = re.sub(r'[\\/*?:"<>|]', "_", name)
        file_path = os.path.join(concepts_dir, f"{safe_name}.md")

        content = f"""---
title: {name}
date: {date_str}
tags: [concept]
---

# {name}

## 정의
{definition or "정의 없음"}

## 처음 등장
{first_seen}
"""

        async with aiofiles.open(file_path, mode="w", encoding="utf-8") as f:
            await f.write(content)

        return file_path
