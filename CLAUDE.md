# CLAUDE.md — festival

이 파일은 Claude Code가 프로젝트를 이해하고 작업할 때 참조하는 가이드입니다.

---

## 프로젝트 개요

**festival**은 실시간 강의 학습 에이전트 시스템입니다.
- **백엔드**: Python + FastAPI + Anthropic SDK (`backend/`)
- **프론트엔드**: React + TypeScript + Vite + Tailwind CSS (`frontend/`)
- **목표**: 실시간 전사 → 개념 추출 → Q&A → Obsidian 저장 → 복습 자동화

원본 기획 문서: `docs/idea.md`

---

## 디렉토리 구조

```
festival/
├── backend/
│   ├── main.py                      # FastAPI 앱 진입점. WebSocket + REST 라우트
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   └── learning_agent.py        # LearningAgent 클래스. Anthropic API 직접 호출
│   ├── services/
│   │   ├── obsidian_service.py      # ObsidianService. vault 경로에 Markdown 파일 저장
│   │   └── session_service.py       # SessionService. 세션 상태 in-memory 관리
│   └── api/
│       └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx                  # 라우터 루트
│   │   ├── main.tsx                 # React 진입점
│   │   ├── index.css                # Tailwind + 커스텀 애니메이션
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # 홈. 세션 시작 모달 포함
│   │   │   ├── SessionPage.tsx      # 핵심 UI. 3패널 레이아웃 + 세션 요약 뷰
│   │   │   ├── Settings.tsx         # API key, Obsidian 경로 설정
│   │   │   └── SessionHistory.tsx   # 세션 목록
│   │   ├── components/
│   │   │   └── layout/Sidebar.tsx   # 56px 아이콘 사이드바
│   │   ├── hooks/
│   │   │   ├── useSpeechRecognition.ts  # Web Speech API 래퍼
│   │   │   └── useWebSocket.ts          # WebSocket 연결 + 스토어 디스패치
│   │   ├── store/
│   │   │   └── appStore.ts          # Zustand. settings는 localStorage 퍼시스트
│   │   └── lib/
│   │       ├── utils.ts             # cn(), formatTime(), truncate()
│   │       └── api.ts               # REST API 클라이언트
│   ├── package.json
│   ├── vite.config.ts               # /api, /ws 프록시 → localhost:8000
│   └── tailwind.config.js           # 커스텀 색상 토큰
└── docs/
    └── idea.md                      # 원본 기획서 (수정 금지)
```

---

## 실행 방법

### 백엔드
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --port 8000
```

### 프론트엔드
```bash
cd frontend
npm run dev   # http://localhost:5173
```

---

## 핵심 컨벤션

### 백엔드
- **Python 3.11+**, 타입 힌트 사용
- FastAPI 라우트는 `main.py`에 직접 작성 (규모 크면 `api/routes.py`로 분리)
- 비동기 함수는 `async def` 사용. 파일 I/O는 `aiofiles`
- `LearningAgent`는 API key를 생성자에서 받음. 전역 인스턴스 없음 — 세션마다 생성
- 세션 상태는 `SessionService`의 in-memory dict. 서버 재시작 시 초기화됨
- Anthropic 모델: `claude-sonnet-4-6`
- JSON 응답 파싱 시 마크다운 코드펜스(`\`\`\`json`) 제거 처리 포함

### 프론트엔드
- **TypeScript strict mode**
- 컴포넌트: 함수형, named export
- 스타일: Tailwind CSS만 사용. 인라인 `style={}` 지양
- 색상은 Tailwind 커스텀 토큰 사용: `bg-background`, `bg-surface`, `text-text`, `text-muted`, `border-border`, `text-primary` 등
- 전역 상태: Zustand (`appStore.ts`). `settings`만 퍼시스트, 세션 상태는 메모리
- API key는 `localStorage`에만 저장. 서버로 전송 시 WebSocket `session_start` 메시지에 포함

### WebSocket 흐름
```
1. 프론트엔드: sessionId(UUID) 생성 → /ws/{sessionId} 연결
2. 연결 직후: session_start 메시지 전송 (api_key, title, speaker 등 포함)
3. 녹음 중: is_final=true인 transcript 메시지 전송
4. 질문: question 메시지 전송 → streaming agent_response 수신
5. 종료: session_end → session_summary 수신 → (obsidian_saved 수신)
```

---

## 주요 타입 / 인터페이스

### 세션 객체 (백엔드 Python dict)
```python
{
    "id": str,
    "title": str,
    "speaker": str,
    "session_type": str,
    "started_at": str,          # ISO datetime
    "ended_at": str | None,
    "transcript": str,          # 전체 누적 전사 텍스트
    "transcript_chunks": list,  # [{text, is_final, timestamp}]
    "concepts": list,           # [{name, definition, first_seen}]
    "user_questions": list,     # [{question, answer, timestamp}]
    "confusion_points": list,
    "summary": dict | None,
    "status": "active" | "ended"
}
```

### SessionSummary (프론트엔드 TypeScript)
```ts
interface SessionSummary {
  summary: string
  key_concepts: { name: string; definition: string }[]
  unclear_points: string[]
  review_questions: { question: string; answer: string }[]
  prerequisites: string[]
}
```

### Zustand Settings
```ts
type Provider = 'anthropic' | 'openai' | 'deepseek' | 'gemini'

interface Settings {
  provider: Provider   // 선택된 LLM 공급자
  apiKey: string       // 해당 공급자의 API key
  model: string        // 모델명 (기본값: 공급자별 DEFAULT_MODELS)
  obsidianPath: string
  language: 'ko' | 'en'
  autoSave: boolean
}
```

### 공급자별 기본 모델
| 공급자 | 기본 모델 |
|--------|-----------|
| anthropic | claude-sonnet-4-6 |
| openai | gpt-4o |
| deepseek | deepseek-chat |
| gemini | gemini-1.5-pro |

DeepSeek은 OpenAI 호환 API (`base_url="https://api.deepseek.com/v1"`)를 사용합니다.

---

## 개발 시 주의사항

1. **API key 노출 금지**: `.env` 파일은 절대 커밋하지 말 것. `.env.example`만 유지
2. **세션 데이터는 휘발성**: 현재 in-memory 저장. 서버 재시작 시 초기화됨. Phase 2에서 SQLite/파일 기반 퍼시스트 추가 예정
3. **Web Speech API**: Chrome/Edge에서만 지원. Safari 미지원
4. **Obsidian 경로**: 백엔드가 직접 파일 시스템에 접근. 백엔드 실행 환경에서 해당 경로가 존재해야 함
5. **CORS**: 개발 중 `allow_origins=["*"]` 설정. 프로덕션 배포 시 제한 필요

---

## Phase 2 확장 계획 (미구현)

- **deepagents 통합**: `pip install deepagents`. `LearningAgent`를 `create_deep_agent()`로 교체. `SkillsMiddleware`에 obsidian-skills 연결
- **Concept State 모델**: 개념별 `novelty_score`, `estimated_understanding`, `misunderstanding_risk` 추적
- **Spaced repetition**: 복습 스케줄러 서비스 추가. 1/3/7/14일 간격
- **obsidian-skills 연동**: `https://github.com/kepano/obsidian-skills` — SKILL.md 형식 활용

---

## 빠른 참조

| 작업 | 명령 |
|------|------|
| 백엔드 의존성 설치 | `cd backend && pip install -r requirements.txt` |
| 백엔드 실행 | `cd backend && uvicorn main:app --reload` |
| 프론트엔드 의존성 설치 | `cd frontend && npm install` |
| 프론트엔드 실행 | `cd frontend && npm run dev` |
| 프론트엔드 빌드 | `cd frontend && npm run build` |
| API 헬스체크 | `curl http://localhost:8000/health` |
| 세션 목록 조회 | `curl http://localhost:8000/sessions` |
