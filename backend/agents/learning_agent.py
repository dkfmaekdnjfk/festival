import asyncio
import json
from typing import AsyncGenerator, Literal

Provider = Literal["anthropic", "openai", "deepseek", "gemini"]

DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "deepseek": "deepseek-chat",
    "gemini": "gemini-1.5-pro",
}


def _strip_fences(raw: str) -> str:
    """Remove markdown code fences from LLM JSON responses."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        inner = lines[1:-1] if lines[-1].startswith("```") else lines[1:]
        raw = "\n".join(inner)
    return raw.strip()


class LearningAgent:
    def __init__(
        self,
        api_key: str,
        provider: Provider = "anthropic",
        model: str | None = None,
    ):
        self.provider: Provider = provider
        self.model: str = model or DEFAULT_MODELS.get(provider, "gpt-4o")
        self._api_key = api_key
        self._init_client()

    # ------------------------------------------------------------------
    # Client initialisation
    # ------------------------------------------------------------------

    def _init_client(self) -> None:
        if self.provider == "anthropic":
            import anthropic
            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)

        elif self.provider in ("openai", "deepseek"):
            from openai import AsyncOpenAI
            kwargs: dict = {"api_key": self._api_key}
            if self.provider == "deepseek":
                kwargs["base_url"] = "https://api.deepseek.com/v1"
            self._client = AsyncOpenAI(**kwargs)

        elif self.provider == "gemini":
            import google.generativeai as genai  # type: ignore
            genai.configure(api_key=self._api_key)
            self._genai = genai

    # ------------------------------------------------------------------
    # Low-level helpers
    # ------------------------------------------------------------------

    async def _complete(self, system: str, user: str, max_tokens: int = 2048) -> str:
        """Single-turn non-streaming completion. Returns raw text."""
        if self.provider == "anthropic":
            response = await self._client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return response.content[0].text.strip()

        elif self.provider in ("openai", "deepseek"):
            response = await self._client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            return (response.choices[0].message.content or "").strip()

        elif self.provider == "gemini":
            model = self._genai.GenerativeModel(
                model_name=self.model,
                system_instruction=system,
            )
            response = await asyncio.to_thread(model.generate_content, user)
            return response.text.strip()

        return ""

    async def _stream_text(
        self, system: str, user: str, max_tokens: int = 1024
    ) -> AsyncGenerator[str, None]:
        """Streaming completion — async generator yielding text chunks."""
        if self.provider == "anthropic":
            async with self._client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        elif self.provider in ("openai", "deepseek"):
            stream = await self._client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

        elif self.provider == "gemini":
            model = self._genai.GenerativeModel(
                model_name=self.model,
                system_instruction=system,
            )

            def _collect_chunks():
                return list(model.generate_content(user, stream=True))

            chunks = await asyncio.to_thread(_collect_chunks)
            for chunk in chunks:
                if chunk.text:
                    yield chunk.text

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def analyze_transcript_chunk(
        self, chunk: str, session_context: dict
    ) -> dict:
        """Extract concepts and detect confusion from a transcript segment."""
        rolling = session_context.get("transcript", "")[-3000:]
        concepts_so_far = session_context.get("concepts", [])
        concepts_list = (
            ", ".join(c["name"] for c in concepts_so_far)
            if concepts_so_far
            else "None yet"
        )

        system = (
            "You are a real-time lecture learning assistant. Analyze the given transcript "
            "segment and extract key concepts, detect potential confusion points, and note "
            "important information. Be concise. Respond in JSON format only."
        )
        user = (
            f"Recent transcript context (last 3000 chars):\n{rolling}\n\n"
            f"Concepts detected so far: {concepts_list}\n\n"
            f"New transcript segment to analyze:\n{chunk}\n\n"
            'Return JSON with keys: "concepts" (list of {"name": str, "definition": str}), '
            '"confusion_detected" (bool), "notes" (str).'
        )

        raw = await self._complete(system, user, max_tokens=1024)
        raw = _strip_fences(raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {"concepts": [], "confusion_detected": False, "notes": raw}

    async def generate_session_summary(self, session_context: dict) -> dict:
        """Generate a structured summary after the session ends."""
        transcript = session_context.get("transcript", "")
        concepts = session_context.get("concepts", [])
        user_questions = session_context.get("user_questions", [])
        confusion_points = session_context.get("confusion_points", [])

        concepts_text = (
            "\n".join(f"- {c['name']}: {c.get('definition', '')}" for c in concepts)
            or "None detected"
        )
        questions_text = (
            "\n".join(f"Q: {q['question']}\nA: {q['answer']}" for q in user_questions)
            or "None"
        )
        confusion_text = (
            "\n".join(f"- {p}" for p in confusion_points) or "None detected"
        )

        system = (
            "You are a lecture summarisation assistant. Given the full transcript, detected "
            "concepts, user questions, and confusion points from a lecture session, produce a "
            "comprehensive structured summary. Respond in JSON format only."
        )
        user = (
            f"Full transcript:\n{transcript}\n\n"
            f"Detected concepts:\n{concepts_text}\n\n"
            f"Confusion points:\n{confusion_text}\n\n"
            f"User Q&A:\n{questions_text}\n\n"
            "Return JSON with keys:\n"
            '"summary" (str),\n'
            '"key_concepts" (list of {"name": str, "definition": str}),\n'
            '"unclear_points" (list of str),\n'
            '"review_questions" (list of {"question": str, "answer": str}),\n'
            '"prerequisites" (list of str).'
        )

        raw = await self._complete(system, user, max_tokens=4096)
        raw = _strip_fences(raw)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {
                "summary": raw,
                "key_concepts": [],
                "unclear_points": [],
                "review_questions": [],
                "prerequisites": [],
            }

    async def stream_answer_question(
        self, question: str, session_context: dict
    ) -> AsyncGenerator[str, None]:
        """Stream an answer to a user's question, grounded in lecture context."""
        rolling = session_context.get("transcript", "")[-3000:]
        concepts_so_far = session_context.get("concepts", [])
        concepts_list = (
            "\n".join(f"- {c['name']}: {c.get('definition', '')}" for c in concepts_so_far)
            or "None yet"
        )

        system = (
            "You are a helpful lecture learning assistant. Answer the user's question based on "
            "the lecture transcript context provided. Be clear and concise."
        )
        user = (
            f"Lecture transcript context (last 3000 chars):\n{rolling}\n\n"
            f"Key concepts identified so far:\n{concepts_list}\n\n"
            f"User question: {question}"
        )

        async for chunk in self._stream_text(system, user, max_tokens=1024):
            yield chunk
