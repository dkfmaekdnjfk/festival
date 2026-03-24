# festival

실시간 강의 청취, 전사, 이해 보조, 지식 저장, 복습 자동화를 통합한 개인 맞춤형 학습 에이전트 시스템.

> **"사용자의 학습 효율을 높이는 개인 맞춤형 지능형 학습 동반자"**

---

## 구조

```
festival/
├── backend/                    # Python (FastAPI + Anthropic)
│   ├── main.py                 # FastAPI 앱, WebSocket + REST
│   ├── requirements.txt
│   ├── .env.example
│   ├── agents/
│   │   └── learning_agent.py   # Claude 기반 학습 에이전트
│   └── services/
│       ├── obsidian_service.py # Obsidian vault 파일 저장
│       └── session_service.py  # 세션 상태 관리 (in-memory)
├── frontend/                   # React + Vite + Tailwind
│   └── src/
│       ├── pages/
│       │   ├── Dashboard.tsx       # 홈, 세션 시작 모달
│       │   ├── SessionPage.tsx     # 실시간 세션 (3패널)
│       │   ├── Settings.tsx        # API key, Obsidian 경로 설정
│       │   └── SessionHistory.tsx  # 세션 기록
│       ├── components/
│       │   └── layout/Sidebar.tsx
│       ├── hooks/
│       │   ├── useSpeechRecognition.ts  # Web Speech API
│       │   └── useWebSocket.ts          # 실시간 통신
│       └── store/appStore.ts           # Zustand 전역 상태
└── docs/
    └── idea.md                 # 프로젝트 기획 원문
```

---

## 시작하기

### 요구사항

- Python 3.11+
- Node.js 18+
- Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- (선택) Obsidian vault 경로

### 백엔드 설치 및 실행

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 프론트엔드 설치 및 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속.

---

## 사용 방법

1. **Settings** 페이지에서 Anthropic API key 입력
2. (선택) Obsidian vault 경로 설정 — 세션 종료 후 자동 저장
3. **Dashboard**에서 "새 세션 시작" 클릭
4. 제목, 발표자, 세션 유형 입력 후 시작
5. 마이크 버튼으로 녹음 시작 → 실시간 전사 + 개념 추출
6. 중간에 질문 입력 → Claude가 강의 맥락 기반으로 답변
7. 이해도 체크 버튼 (이해됨 / 애매함 / 모르겠음)
8. "세션 종료" → 요약, 핵심 개념, 복습 질문 자동 생성
9. Obsidian 경로 설정 시 → 자동으로 Markdown 노트 저장

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Python, FastAPI, Uvicorn |
| AI 에이전트 | Anthropic Claude (claude-sonnet-4-6) |
| 실시간 통신 | WebSocket |
| 프론트엔드 | React 18, TypeScript, Vite |
| 스타일링 | Tailwind CSS |
| 상태 관리 | Zustand (localStorage 퍼시스트) |
| 음성 인식 | Web Speech API (브라우저 내장) |
| 노트 저장 | Obsidian Markdown (로컬 파일 직접 쓰기) |

---

## WebSocket 프로토콜

### Client → Server

```jsonc
{ "type": "session_start", "title": "...", "speaker": "...", "session_type": "세미나", "api_key": "sk-ant-...", "obsidian_path": "/path/to/vault" }
{ "type": "transcript",    "text": "...", "is_final": true }
{ "type": "question",      "text": "이 개념이 뭔가요?" }
{ "type": "understanding_check", "level": 1 }   // 1=이해 2=애매 3=모름
{ "type": "session_end" }
```

### Server → Client

```jsonc
{ "type": "status",          "message": "..." }
{ "type": "concept_update",  "concepts": [{ "name": "...", "definition": "..." }] }
{ "type": "agent_response",  "text": "...", "streaming": true }
{ "type": "session_summary", "data": { "summary": "...", "key_concepts": [...], "unclear_points": [...], "review_questions": [...] } }
{ "type": "obsidian_saved",  "path": "/path/to/file.md" }
{ "type": "error",           "message": "..." }
```

---

## Obsidian 저장 구조

세션 종료 시 다음 경로에 자동 저장됩니다:

```
{vault}/
├── Lectures/
│   └── 2026-03-24_강의제목.md   ← 강의 노트 (요약, 개념, 복습질문, 전사본)
└── Concepts/
    └── 개념이름.md              ← 개념별 노트 (정의, 선행지식 등)
```

---

## 개발 로드맵

### Phase 1 (현재 — MVP)
- [x] 실시간 전사 (Web Speech API)
- [x] 실시간 Q&A (Claude 스트리밍)
- [x] 개념 자동 추출
- [x] 세션 요약 + 복습 질문 생성
- [x] Obsidian Markdown 저장

### Phase 2 (Adaptive Learning)
- [ ] 사용자 이해도 모델링 (Concept State 추적)
- [ ] 선행지식 결손 감지 및 보완
- [ ] Spaced repetition 복습 스케줄링
- [ ] [deepagents](https://github.com/langchain-ai/deepagents) 미들웨어 통합
- [ ] [obsidian-skills](https://github.com/kepano/obsidian-skills) 연동

### Phase 3 (Fully Agentic)
- [ ] 발표자 자동 식별
- [ ] 웹 검색 / 논문 조회 자동화
- [ ] 강의 자료(PDF/슬라이드) 자동 연결
- [ ] 장기 학습 그래프 구축

---

## 라이선스

MIT
