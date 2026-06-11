# MCP 카탈로그 조사 (2026-05-19)

> Agent Studio 에 사전 등록할 인기 MCP 후보 정리 — Phase 9 `mcp-catalog.ts` 입력 데이터.
> 출처: Context7 (`/modelcontextprotocol/servers`, `/punkpeye/awesome-mcp-servers`, `/appcypher/awesome-mcp-servers`) + 2026년 4~5월 게시 블로그 6편 + 검색 API 벤치마크 1편.

---

## 1. Top 50 인기 순위 (검색량 기반, 2026-03)

> 출처: [50 Most Popular MCP Servers in 2026 — MCP Manager](https://mcpmanager.ai/blog/most-popular-mcp-servers/) (2026-04 게시, USA + 글로벌 월간 검색량 합산)

| 순위 | MCP | 검색량/월 | 카테고리 |
|-----:|------|----------:|----------|
| 1 | **Playwright** | 82,000 | 브라우저 자동화 |
| 2 | **Figma** | 74,000 | 디자인 |
| 3 | **GitHub** | 69,000 | 개발 |
| 4 | **Jira / Atlassian / Confluence** | 40,000 | 프로젝트 관리 |
| 5 | **Context7** | 32,000 | 컨텍스트/문서 |
| 6 | **Supabase** | 26,000 | DB |
| 7 | **Notion** | 23,000 | 생산성 |
| 8 | **Serena** | 19,000 | DevOps/코드 분석 |
| 9 | **Slack** | 17,700 | 커뮤니케이션 |
| 10 | **Browser** (general) | 16,100 | 브라우저 |
| 11 | **AWS** | 16,000 | 클라우드 |
| 12 | **Azure** | 13,000 | 클라우드 |
| 13 | **Sequential Thinking** | 13,000 | 추론 |
| 14 | **Zapier** | 10,800 | 통합/자동화 |
| 15 | **Linear** | 10,600 | 이슈 트래킹 |
| 16 | **Docker** | 10,300 | 컨테이너 |
| 17 | **GitLab** | 9,700 | 개발 |
| 18 | **Obsidian** | 8,100 | 노트 |
| 19 | **Postgres** | 7,900 | DB |
| 20 | **Puppeteer** | 7,300 | 브라우저 자동화 |
| 21 | **Firecrawl** | 7,200 | 웹 크롤링 |
| 22 | **Datadog** | 6,900 | 모니터링 |
| 23 | **Salesforce** | 6,500 | CRM |
| 24 | **Grafana** | 6,100 | 모니터링 |
| 25 | **Google Drive** | 5,900 | 클라우드 스토리지 |
| 26 | **Stripe** | 5,700 | 결제 |
| 27 | **Gmail** | 5,600 | 메일 |
| 28 | **Shopify** | 5,400 | 이커머스 |
| 29 | **Filesystem** | 4,900 | 로컬 스토리지 |
| 30 | **Sentry** | 4,700 | 에러 트래킹 |
| 31 | **Brave Search** | 4,300 | 검색 |
| 32 | **MySQL** | 4,200 | DB |
| 33 | **HubSpot** | 3,800 | CRM |
| 34 | **Snowflake** | 3,600 | 데이터 웨어하우스 |
| 35 | **Exa** | 3,500 | 검색/리서치 |
| 36 | **Google Calendar** | 3,500 | 생산성 |
| 37 | **WordPress** | 3,500 | CMS |
| 38 | **Terraform** | 3,200 | IaC |
| 39 | **Vercel** | 3,100 | 배포 |
| 40 | **Memory** (knowledge graph) | 3,000 | 상태/메모리 |
| 41 | **Fetch** | 2,900 | HTTP |
| 42 | **Tavily** | 2,900 | 웹 검색 |
| 43 | **Asana** | 2,800 | 프로젝트 관리 |
| 44 | **Cloudflare** | 2,300 | CDN/보안 |
| 45 | **Airtable** | 2,200 | DB/스프레드시트 |
| 46 | **Kubernetes** | 2,100 | 오케스트레이션 |
| 47 | **Google Sheets** | 2,100 | 스프레드시트 |
| 48 | **dbt** | 1,900 | 데이터 변환 |
| 49 | **Desktop Commander** | 1,900 | 시스템 제어 |
| 50 | **Redis** | 1,400 | 캐시/DB |

**시그널:** Top 50 중 42개가 엔지니어 대상 도구. 디자인(Figma)·생산성(Notion)·CRM(Salesforce/HubSpot)을 제외하면 대부분 개발/인프라 영역.

---

## 2. 카테고리별 분류 — Agent Studio 추천 카탈로그 후보

> 각 카테고리에서 Tier 1 (강력 추천) / Tier 2 (선택) 구분.

### 2-1. 개발 / 코드 / 버전 관리
- **Tier 1**: GitHub, GitLab, Git (로컬), Sentry, Context7 (문서 조회)
- **Tier 2**: Serena (semantic code search), Docker, Datadog

### 2-2. 검색 / 크롤링 / 브라우저 (별도 비교표 — §3 참조)

#### 2-2-a. 일반 웹 검색 / 크롤링
- **Tier 1**: Playwright, Firecrawl, Brave Search
- **Tier 2**: Puppeteer, Exa, Tavily

#### 2-2-b. 라이브러리 문서 검색 (전용 도메인)
- **Tier 1**: **Context7** — OSS 라이브러리 문서·예제 RAG. 일반 웹 검색과 도메인이 다르지만 "이름·키워드로 검색해서 결과를 받는다" 는 점에서 동일 카테고리로 분리.
- (Tier 2 없음 — 동일 도메인 경쟁자 부재)

### 2-3. DB / 데이터
- **Tier 1**: Postgres, Supabase
- **Tier 2**: MySQL, MongoDB, Redis, Snowflake, dbt, Airtable

### 2-4. 협업 / 생산성 / 지식 베이스
- **Tier 1**: Slack, Notion, Linear, Jira, Gmail
- **Tier 2**: Google Drive, Google Calendar, Google Sheets, Obsidian, Asana

### 2-5. 디자인 / 프론트엔드
- **Tier 1**: Figma
- **Tier 2**: (없음 — Figma 가 압도적)

### 2-6. 인프라 / 배포 / 클라우드
- **Tier 1**: AWS, Vercel, Cloudflare
- **Tier 2**: Azure, Terraform, Kubernetes

### 2-7. 결제 / 비즈니스
- **Tier 1**: Stripe
- **Tier 2**: Shopify, Salesforce, HubSpot

### 2-8. 샌드박스 / 코드 실행
- **Tier 1**: E2B (Code Interpreter 류)
- **Tier 2**: Desktop Commander

### 2-9. 메타 / 통합 허브
- **Tier 1**: Zapier (수천 개 앱 노출), Composio (250+ 통합)
- **Tier 2**: (자체 우선 — 직접 등록 권장)

### 2-10. 공식 reference 서버 (modelcontextprotocol/servers)
- filesystem, fetch, git, memory, sequential-thinking, time, everything (7개)
- DB·SaaS 류 reference 서버는 외부 third-party 레포로 이전됨 (2026 기준).

---

## 3. 검색 / 크롤링 / 브라우저 MCP 비교

> Agent Studio 사용자가 가장 많이 헷갈리는 영역. 각 MCP 의 "어떤 일을 잘 하는가" 와 "겹칠 때 무엇이 다른가" 를 명확히 한다.

### 3-1. 한눈에 보기

| MCP | 분류 | 핵심 역할 | 자격증명 | 가격 (참고) |
|-----|------|-----------|----------|------------|
| **Playwright** | 브라우저 자동화 | 실제 브라우저 제어 (탐색·클릭·스크린샷·JS 실행) | 불필요 (로컬) | 무료 |
| **Puppeteer** | 브라우저 자동화 | Playwright 와 유사하나 Chrome 한정·기능 단순 | 불필요 (로컬) | 무료 |
| **Firecrawl** | 크롤링 + 검색 | 웹페이지 → LLM-ready 마크다운 변환 + 사이트맵·자율 에이전트 | API Key | $83 / 100K pages |
| **Brave Search** | 검색 API | 독립 검색 인덱스 기반 SERP (privacy-first) | API Key | $5~9 / 1K 요청 |
| **Exa** | 시맨틱 검색 | 신경망 인덱스 — "사람이 공유할 만한 URL 예측" | API Key | 자체 가격 |
| **Tavily** | 검색 API | AI 에이전트 전용 검색 (요약·필터링 내장) | API Key | ~$800 / 100K pages |
| **Context7** | **라이브러리 문서 RAG** | OSS 라이브러리·프레임워크 공식 문서·예제를 버전별로 즉시 조회 | 불필요 (Free tier) | 무료 (rate limit 시 API Key) |

### 3-2. 벤치마크 (2026 Agentic Search Benchmark)

> 출처: [Agentic Search in 2026: Benchmark 8 Search APIs for Agents — AIMultiple](https://aimultiple.com/agentic-search)

| MCP | Agent Score | 평균 지연(ms) | Mean Relevance |
|-----|-----------:|--------------:|----------------:|
| Brave Search | **14.89** | **669** | — |
| Firecrawl | ~14 (근접) | 중간 | **4.30** (1위) |
| Exa | ~14 (근접) | 중간 | — |
| Tavily | ~13.9 (Brave 보다 1점↓) | 중간 | — |
| Parallel Pro | ~14 (근접) | 13,600 (느림) | — |

- **Brave** 가 종합 점수·지연 1위지만 Firecrawl/Exa 와의 격차는 측정 노이즈 수준.
- **Firecrawl** 은 "full-page content 추출 품질" 에서 1위 — 결과 클린 정도가 압도적.
- **Tavily** 는 인지도(다운로드 1M+)는 높지만 리더 그룹보다 1점 가량 낮음.

### 3-3. "비슷한데 뭐가 다른가" — 비교 매트릭스

#### Playwright vs Puppeteer
- **둘 다**: 헤드리스 브라우저로 페이지 탐색·자동화.
- **다른 점**:
  - Playwright 는 Chrome / Firefox / Safari (WebKit) 모두 지원, Puppeteer 는 Chrome/Chromium 만.
  - Playwright MCP 는 **accessibility tree** 기반 (스크린샷 없이 빠르고 신뢰성↑), Puppeteer 는 보통 스크린샷 기반.
  - Playwright 가 검색량 11배 (#1 vs #20) — 신규 등록 시 Playwright 우선.

#### Firecrawl vs Brave Search
- **둘 다**: "웹에서 정보 가져오기" — 검색 결과 + 본문.
- **다른 점**:
  - **Brave Search** = SERP 만 (제목 + URL + 스니펫). 본문은 따로 fetch 필요.
  - **Firecrawl** = SERP + 본문 한 번에 (clean markdown 으로). 즉, "검색→스크레이핑→파싱" 을 하나로 묶음.
  - 사용 패턴: **Brave** 는 "여러 후보 URL 빠르게 보고 결정" 용도, **Firecrawl** 은 "결정된 URL/주제의 전체 본문이 필요할 때".
  - 추천 조합: **Brave + Firecrawl** 병행 (Brave 로 후보 검색 → Firecrawl 로 본문 추출).

#### Firecrawl vs Puppeteer / Playwright
- **둘 다**: 웹페이지에서 데이터 추출.
- **다른 점**:
  - Firecrawl 은 **호스티드 API** (서버 인프라 불필요, 안티봇 우회·JS 렌더링 자동), 결과는 markdown.
  - Puppeteer/Playwright 는 **로컬 실행** (직접 브라우저 띄움, 무료지만 인프라 책임). 클릭·폼 제출 같은 **인터랙티브 자동화** 필요할 때 강함.
  - 단순 "본문만 깔끔히 추출" → Firecrawl. "로그인 후 사용자 액션 시뮬레이션" → Playwright/Puppeteer.

#### Exa vs Brave Search vs Tavily
- **셋 다**: 검색 API.
- **다른 점**:
  - **Brave** = 전통 키워드 검색 (privacy-first, 자체 인덱스). 일반 웹 탐색 default.
  - **Exa** = **시맨틱 / 신경망 검색**. "AI 에이전트가 좋아할 만한 링크" 를 link prediction 모델로 추천. GitHub·StackOverflow·docs·기업 프로필 70M+ / 1B+ 인덱싱. 리서치·전문 자료 탐색에 강함.
  - **Tavily** = **에이전트 전용 검색** — 결과를 자동 요약·정제해 LLM 입력에 바로 쓰기 쉽게 가공. 통합 편의성 vs 결과 품질 trade-off.
  - 추천: 일반 검색 = Brave, 학술·심층 리서치 = Exa, 빠른 통합·요약 필요 = Tavily.

#### Tavily vs Firecrawl
- **둘 다**: 에이전트 친화적 출력 (LLM 입력용 가공된 결과).
- **다른 점**:
  - Tavily 는 **검색 위주** (요약된 짧은 결과), Firecrawl 은 **본문 추출 위주** (긴 full-content markdown).
  - 가격: Firecrawl 이 약 10배 저렴 (100K 페이지 기준 $83 vs $800) — 비용 최적화 시 Firecrawl 유리.

#### Context7 vs 다른 검색 도구 (도메인 차이)
- **공통점**: "키워드로 검색해서 결과를 받는" 구조.
- **결정적 차이**: Context7 은 **OSS 라이브러리 공식 문서·예제 코드** 만 인덱싱. 일반 웹 검색이 아님.
  - Brave/Tavily/Exa 는 전체 웹을 다루지만, "Next.js v16 의 새 라우팅 API 시그니처" 같은 정확한 코드 정답을 못 찾는 경우가 많음.
  - Context7 은 버전별 공식 문서를 직접 RAG 해서 **정답 시그니처 + 코드 예제** 를 즉시 반환.
- **언제 쓰는가**:
  - "X 라이브러리의 Y 함수 시그니처/사용법" → **Context7** (정확도 1순위).
  - "X 라이브러리 출시 후 사용자 반응·블로그·튜토리얼" → Brave / Tavily.
  - "X 공식 마이그레이션 가이드 본문 전부" → Firecrawl.
- **출처**: AGENTS.md 의 deepagents 작업 규칙도 "구현 전 Context7 으로 공식 문서 먼저 조회" 를 의무화한 이유 = 다른 검색 도구로는 API 시그니처 정답을 얻기 어렵기 때문.

### 3-4. 권장 조합 (Agent Studio default 추천)

```
일반 사용자 default:
  - 검색: Brave Search
  - 본문 추출: Firecrawl
  - 인터랙티브: Playwright
  - 라이브러리 문서: Context7 (코드 작성·기술 질문 시 1순위)

리서치·심층 분석:
  - Exa (시맨틱 검색) + Firecrawl (본문)

빠른 프로토타입 / 단일 API:
  - Tavily (검색+요약 한 방)

코딩 에이전트 (Agent Assistant 등):
  - Context7 (라이브러리 문서) + execute (샌드박스) + read_file/write_file (vfs)
```

---

## 4. 자격증명 / OAuth 매핑 (Phase 9 mcp-catalog.ts 입력)

| MCP | 자격증명 종류 | tool-credential-map 슬롯 |
|-----|--------------|--------------------------|
| GitHub | OAuth (App / PAT) | `oauth:github` |
| GitLab | OAuth | `oauth:gitlab` |
| Slack | OAuth | `oauth:slack` |
| Notion | OAuth | `oauth:notion` |
| Linear | OAuth | `oauth:linear` |
| Jira / Confluence | OAuth | `oauth:atlassian` |
| Gmail | OAuth (Google) | `oauth:google` |
| Google Drive / Calendar / Sheets | OAuth (Google) | `oauth:google` |
| Figma | OAuth / PAT | `oauth:figma` |
| Sentry | OAuth | `oauth:sentry` |
| Stripe | API Key | `tool:stripe` |
| Supabase | API Key + URL | `tool:supabase` |
| Postgres / MySQL | DSN | `tool:postgres` / `tool:mysql` |
| Firecrawl | API Key | `tool:firecrawl` |
| Brave Search | API Key | `tool:brave` |
| Exa | API Key | `tool:exa` |
| Tavily | API Key | `tool:tavily` |
| Context7 | 선택 (Free tier 무인증) | `tool:context7` (rate limit 시) |
| Playwright | 불필요 | — |
| Puppeteer | 불필요 | — |
| Cloudflare | API Token | `tool:cloudflare` |
| AWS | Access Key + Secret | `tool:aws` |
| E2B | API Key | `tool:e2b` |

---

## 5. 보안 주의사항

> 출처: [The Best MCP Servers for Developers in 2026 — Builder.io](https://www.builder.io/blog/best-mcp-servers-2026)

- 2026년 1~2월에 MCP 서버 대상 CVE 30+ 건 신고됨.
- 인기 MCP 서버의 **66% 가 보안 결함 발견** (SQL injection, path traversal, credential leak 등).
- **권장 운용 방침**: 처음에는 read-only 권한으로만 시작 → 사용 패턴 안정화 후 write 권한 단계적 확대.
- Agent Studio 적용: `Tool.permissions` 필드로 read-only / write 구분 가능하게 카탈로그 메타에 표기 권장.

---

## 6. 출처 (정리)

### Context7
- `/modelcontextprotocol/servers` — 공식 reference (84 snippets, Source Reputation High)
- `/punkpeye/awesome-mcp-servers` — 커뮤니티 큐레이션 (2,123 snippets, High)
- `/appcypher/awesome-mcp-servers` — 보조 큐레이션 (167 snippets, High)

### 2026년 블로그
- [50 Most Popular MCP Servers in 2026 — MCP Manager](https://mcpmanager.ai/blog/most-popular-mcp-servers/) — 검색량 기반 Top 50 랭킹
- [10 Best MCP Servers for Developers in 2026 — Firecrawl Blog](https://www.firecrawl.dev/blog/best-mcp-servers-for-developers) — 카테고리별 상세 설명
- [The Best MCP Servers for Developers in 2026 — Builder.io](https://www.builder.io/blog/best-mcp-servers-2026) — 보안 분석 포함
- [Best MCP Servers in 2026: Complete Directory by Category — SkillsLLM](https://skillsllm.com/blog/best-mcp-servers-2026)
- [Top 15 MCP Servers — Effloow](https://effloow.com/articles/top-mcp-servers-developer-guide-2026)
- [15 Best MCP Servers for AI Developers in 2026 — Taskade](https://www.taskade.com/blog/mcp-servers)

### 검색 API 벤치마크
- [Agentic Search in 2026: Benchmark 8 Search APIs — AIMultiple](https://aimultiple.com/agentic-search) — Brave/Firecrawl/Exa/Tavily 정량 비교

---

## 7. 다음 액션 (Phase 9 연결)

1. 본 카탈로그를 기반으로 `apps/api/src/modules/tools/mcp-catalog.ts` 시드 데이터 작성.
2. 카테고리·Tier 기준은 §2, 자격증명 슬롯은 §4 그대로 사용.
3. 검색/크롤링 카테고리는 §3 의 비교표를 그대로 frontend 카드 description 에 노출 — 사용자가 선택 시 차이를 즉시 이해할 수 있게.
4. 원클릭 install 시 §5 의 권장사항대로 read-only 권한 default 적용.
