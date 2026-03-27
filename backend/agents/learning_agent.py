import json
import re
from typing import AsyncGenerator, Callable, Awaitable, Literal, Optional

from deepagents import create_deep_agent
from langgraph.checkpoint.memory import MemorySaver

Provider = Literal["anthropic", "openai", "deepseek", "gemini"]

DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-6",
    "openai": "gpt-4o",
    "deepseek": "deepseek-chat",
    "gemini": "gemini-1.5-pro",
}

_SYSTEM_ANALYSIS = """\
당신은 실시간 강의를 함께 듣는 학습 보조 에이전트입니다.
전사 텍스트 조각이 순서대로 들어옵니다. 대화 히스토리를 통해 이미 무엇을 처리했는지 알고 있습니다.

다음 도구로 능동적으로 행동하세요:

- add_concept: 강사가 해당 개념을 명확히 정의하거나 충분히 설명했을 때만 호출하세요.
  단 한 번 언급된 단어, 맥락 없이 스치듯 나온 용어는 절대 추출하지 마세요.
  개념이 반복 언급되거나 강사가 의도적으로 설명하는 경우에만 추출합니다.
  이미 추출한 개념은 절대 다시 추가하지 마세요.

- send_message: 학습자에게 전달할 정말 중요한 내용이 있을 때만 — 혼동 감지, 핵심 포인트 강조, 개념 간 연결, 심화 질문.
  매 청크마다 호출하지 마세요. 꼭 필요할 때만.

- note_confusion: 학습자가 혼동할 가능성이 높은 포인트를 기록.

아무것도 할 필요 없으면 도구를 호출하지 않아도 됩니다.\
"""

_SYSTEM_QA = """\
당신은 강의 학습 보조 에이전트입니다.
제공된 강의 맥락을 바탕으로 학습자의 질문에 명확하고 간결하게 답하세요.
한국어로 답하세요.

사용자가 키워드나 용어를 Whisper 전사 힌트에 추가해 달라고 요청하면 add_keyword 툴을 호출하세요.\
"""

_KEYWORD_INTENT_RE = re.compile(r'키워드|용어|단어|추가|등록|전사|힌트', re.I)

_SYSTEM_SUMMARY = """\
당신은 강의 요약 에이전트입니다.
전체 전사 내용과 세션 데이터를 바탕으로 구조화된 학습 요약을 생성합니다.
JSON 형식으로만 응답하세요.\
"""


def _strip_fences(raw: str) -> str:
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
        self.model_name: str = model or DEFAULT_MODELS.get(provider, "gpt-4o")
        self._api_key = api_key
        self._agent = None          # deepagents CompiledStateGraph (build_agent 후 생성)
        self._checkpointer = MemorySaver()  # 세션 내 상태 유지
        self._thread_id: str | None = None
        self._chat_model = self._init_chat_model()

    # ──────────────────────────────────────────────────────────────────────────
    # 초기화
    # ──────────────────────────────────────────────────────────────────────────

    def _init_chat_model(self):
        """LangChain 채팅 모델 초기화 (Q&A / 요약 스트리밍용)."""
        if self.provider == "anthropic":
            from langchain_anthropic import ChatAnthropic
            return ChatAnthropic(anthropic_api_key=self._api_key, model_name=self.model_name)

        elif self.provider == "openai":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(api_key=self._api_key, model=self.model_name)

        elif self.provider == "deepseek":
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                api_key=self._api_key,
                model=self.model_name,
                base_url="https://api.deepseek.com/v1",
            )

        elif self.provider == "gemini":
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(google_api_key=self._api_key, model=self.model_name)

        raise ValueError(f"지원하지 않는 프로바이더: {self.provider}")

    def build_agent(self, session_id: str, session_service, send_fn) -> None:
        """
        deepagents 에이전트 빌드.
        session_id, session_service, send_fn을 클로저로 캡처해 도구 내에서 직접 사용.
        """
        self._thread_id = session_id

        async def add_concept(name: str, definition: str) -> str:
            """강의에서 새로운 핵심 개념을 추출합니다. 이미 추출한 개념은 다시 추가하지 마세요."""
            session_service.add_concept(session_id, {"name": name, "definition": definition})
            session = session_service.get_session(session_id)
            await send_fn({"type": "concept_update", "concepts": session["concepts"]})
            return f"추가됨: {name}"

        async def send_message(text: str) -> str:
            """학습자에게 능동적으로 메시지를 전달합니다. 꼭 필요할 때만 호출하세요."""
            await send_fn({"type": "agent_proactive", "text": text})
            return "전송됨"

        async def note_confusion(description: str) -> str:
            """학습자가 혼동할 수 있는 포인트를 기록하고 채팅창에 알립니다."""
            session = session_service.get_session(session_id)
            if description not in session.get("confusion_points", []):
                session["confusion_points"].append(description)
            await send_fn({"type": "agent_proactive", "text": f"⚠️ 혼동 포인트: {description}", "is_confusion": True})
            return "기록됨"

        self._agent = create_deep_agent(
            model=self._chat_model,
            tools=[add_concept, send_message, note_confusion],
            system_prompt=_SYSTEM_ANALYSIS,
            checkpointer=self._checkpointer,
        )

    # ──────────────────────────────────────────────────────────────────────────
    # 에이전트 루프
    # ──────────────────────────────────────────────────────────────────────────

    async def prime_history(self, transcript: str, concepts_str: str) -> None:
        """
        이어 녹음 시 에이전트에 이전 세션 맥락 주입.
        MemorySaver의 thread_id에 컨텍스트 메시지를 추가해 에이전트가 기억하게 함.
        """
        if self._agent is None:
            return
        context_msg = (
            "[이전 세션 복원 — 컨텍스트 전용, 도구를 호출하지 마세요]\n"
            f"지금까지의 전사 내용:\n{transcript[-2000:]}\n\n"
            f"이미 추출된 개념:\n{concepts_str}\n\n"
            "위 내용은 이미 처리된 것입니다. 같은 개념을 다시 추출하지 마세요."
        )
        config = {"configurable": {"thread_id": self._thread_id}}
        async for _ in self._agent.astream(
            {"messages": [{"role": "user", "content": context_msg}]},
            stream_mode="values",
            config=config,
        ):
            pass

    async def process_transcript(self, chunk: str) -> None:
        """
        deepagents 루프로 전사 청크 처리.
        도구 호출(add_concept, send_message, note_confusion)이 사이드 이펙트로 자동 발생.
        MemorySaver가 청크 간 대화 히스토리를 유지하므로 중복 개념 추출 없음.
        """
        if self._agent is None:
            return
        config = {"configurable": {"thread_id": self._thread_id}}
        async for _ in self._agent.astream(
            {"messages": [{"role": "user", "content": f"[전사]\n{chunk}"}]},
            stream_mode="values",
            config=config,
        ):
            pass

    # ──────────────────────────────────────────────────────────────────────────
    # Q&A 스트리밍 (LangChain 직접 호출)
    # ──────────────────────────────────────────────────────────────────────────

    async def stream_answer_question(
        self,
        question: str,
        session_context: dict,
        on_keyword: Optional[Callable[[str], Awaitable[None]]] = None,
    ) -> AsyncGenerator[str, None]:
        from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
        from langchain_core.tools import tool

        rolling = session_context.get("transcript", "")[-3000:]
        concepts = session_context.get("concepts", [])
        keywords = session_context.get("keywords", [])
        concepts_list = (
            "\n".join(f"- {c['name']}: {c.get('definition','')}" for c in concepts) or "없음"
        )
        keywords_list = ", ".join(keywords) if keywords else "없음"
        messages = [
            SystemMessage(content=_SYSTEM_QA),
            HumanMessage(content=(
                f"강의 전사 맥락 (최근 3000자):\n{rolling}\n\n"
                f"추출된 개념:\n{concepts_list}\n\n"
                f"현재 Whisper 키워드 힌트: {keywords_list}\n\n"
                f"질문: {question}"
            )),
        ]

        # 키워드 추가 의도가 있는 경우에만 tool binding (불필요한 지연 방지)
        if on_keyword and _KEYWORD_INTENT_RE.search(question):
            @tool
            def add_keyword(keyword: str) -> str:
                """사용자가 요청한 키워드를 Whisper 전사 힌트 목록에 추가합니다."""
                return keyword

            model_with_tools = self._chat_model.bind_tools([add_keyword])
            response = await model_with_tools.ainvoke(messages)

            # tool_calls 처리
            if hasattr(response, "tool_calls") and response.tool_calls:
                tool_messages = []
                for tc in response.tool_calls:
                    if tc["name"] == "add_keyword":
                        kw = tc["args"].get("keyword", "")
                        if kw and on_keyword:
                            await on_keyword(kw)
                    tool_messages.append(
                        ToolMessage(content="추가됨", tool_call_id=tc["id"])
                    )
                # tool 결과 포함해서 최종 답변 스트리밍
                async for chunk in self._chat_model.astream(messages + [response] + tool_messages):
                    if chunk.content:
                        yield str(chunk.content)
                return

        # 일반 스트리밍
        async for chunk in self._chat_model.astream(messages):
            if chunk.content:
                yield str(chunk.content)

    # ──────────────────────────────────────────────────────────────────────────
    # 세션 요약
    # ──────────────────────────────────────────────────────────────────────────

    async def generate_session_summary(self, session_context: dict) -> dict:
        from langchain_core.messages import HumanMessage, SystemMessage

        transcript = session_context.get("transcript", "")
        concepts = session_context.get("concepts", [])
        user_questions = session_context.get("user_questions", [])
        confusion_points = session_context.get("confusion_points", [])

        concepts_text = (
            "\n".join(f"- {c['name']}: {c.get('definition','')}" for c in concepts) or "없음"
        )
        questions_text = (
            "\n".join(f"Q: {q['question']}\nA: {q['answer']}" for q in user_questions) or "없음"
        )
        confusion_text = "\n".join(f"- {p}" for p in confusion_points) or "없음"

        messages = [
            SystemMessage(content=_SYSTEM_SUMMARY),
            HumanMessage(content=(
                f"전체 전사:\n{transcript}\n\n"
                f"추출된 개념:\n{concepts_text}\n\n"
                f"혼동 포인트:\n{confusion_text}\n\n"
                f"Q&A:\n{questions_text}\n\n"
                "다음 키를 가진 JSON 반환:\n"
                '"summary" (str), '
                '"key_concepts" (list of {"name": str, "definition": str}), '
                '"unclear_points" (list of str), '
                '"review_questions" (list of {"question": str, "answer": str}), '
                '"prerequisites" (list of str).'
            )),
        ]
        response = await self._chat_model.ainvoke(messages)
        raw = _strip_fences(
            response.content if isinstance(response.content, str) else str(response.content)
        )
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
