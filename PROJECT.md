# Anagraph — полный профайл проекта

> Документ описывает текущее состояние репозитория `anagraph` (KG Builder): что это, как устроено, какие технологии используются, как разворачивается, как работает пайплайн и что доступно в UI. Все факты сверены с кодом в этой ветке.

---

## 1. Что это и зачем

**Anagraph** — open-source-инструмент для автоматического построения **графа знаний (Knowledge Graph)** из неструктурированного текста и для последующего **общения с этим графом на естественном языке** (вопрос-ответ через text-to-Cypher).

Идея — локальная и приватная альтернатива закрытым решениям (LlamaIndex + OpenAI, Microsoft GraphRAG): пользователь может развернуть систему у себя, подключить свой LLM (по умолчанию — Groq, OpenAI-совместимый API на LLaMA), скормить документы и получить навигируемый граф сущностей и связей, который можно фильтровать, искать, расширять и спрашивать.

**Ключевые сценарии:**
1. Загрузить документ (PDF/DOCX/TXT) или вставить произвольный текст в поле.
2. Дождаться фоновой обработки (LLM извлекает триплеты, они нормализуются и кладутся в Neo4j).
3. Изучать получившийся граф визуально (vis-network), фильтровать по типам, искать узлы, открывать соседство.
4. Задавать вопросы на естественном языке — ответ строится через LLM-сгенерированный Cypher + LLM-обобщение результатов.

---

## 2. Стек технологий

### Backend (`/backend`)
- **Язык/рантайм**: Python 3.11 (slim-образ).
- **Web-framework**: FastAPI 0.115, ASGI-сервер `uvicorn[standard]` 0.34.
- **Конфиг**: `pydantic-settings` 2.7 (read из `.env`).
- **БД (граф)**: Neo4j 5 Community (драйвер `neo4j` 5.27, async).
- **LLM**: OpenAI-совместимый клиент (`openai` 1.59) → Groq endpoint (`https://api.groq.com/openai/v1`), модель по умолчанию `llama-3.3-70b-versatile`.
- **Парсинг файлов**: `PyPDF2` 3.0 (PDF), `python-docx` 1.1 (DOCX), `chardet` 5.2 (кодировка TXT), `aiofiles` 24.1.
- **HTTP**: `httpx` 0.28, `python-multipart` 0.0.20 (multipart upload).
- **Тесты**: `pytest` 8.3, `pytest-asyncio` 0.25.

### Frontend (`/frontend`)
- **Язык/рантайм**: TypeScript ~5.6, React 18.3, ESM-модули.
- **Сборка/dev-сервер**: Vite 6.
- **Серверный рендеринг отсутствует** — это SPA.
- **Запросы**: `axios` 1.7, кэширование/инвалидация — `@tanstack/react-query` 5.62.
- **Граф-визуализация**: `vis-network` 9.1 + `vis-data` 7.1.
- **Стили**: один глобальный CSS-файл (`App.css`) + inline-styles в компонентах. Нет CSS-фреймворков.
- **Иконок и UI-китов нет** — всё нативно (button, input, кастомные модалки/тосты).

### Инфраструктура
- **Docker / docker-compose** для local-deployment всех трёх компонент.
- **Nginx alpine** как раздатчик статики фронтенда + обратный прокси на бэкенд (внутри сети compose).
- **Volumes**: `neo4j_data` (персистенс БД), `uploads` (исходные файлы документов).

### Что в репозитории НЕ используется
- Нет ORM (с Neo4j общение чистым Cypher через async-driver).
- Нет очередей сообщений (Celery/RabbitMQ/Redis) — фоновая обработка через `asyncio.create_task`.
- Нет миграций — Neo4j-индексы создаются на старте (`create_indexes`).
- Нет аутентификации/авторизации.
- Нет CI/CD конфигов (нет `.github/workflows`, нет Dockerfile-релизов и т.п.).
- Нет тестов фронтенда.

---

## 3. Архитектура верхнего уровня

```
┌──────────────────────┐  HTTP/SSE   ┌────────────────────────┐  Bolt    ┌───────────┐
│   Frontend (SPA)     │ ─────────►  │   Backend (FastAPI)    │ ───────► │  Neo4j 5  │
│   React + vis-network│             │   ExtractionPipeline   │          │  + APOC   │
│   TanStack Query     │             │   QAService            │          └───────────┘
│   Nginx static       │             │   GraphService         │
└──────────────────────┘             │   GroqLLMClient ──────────► Groq LLM (cloud)
                                     │   InMemoryDocumentRepo │
                                     └────────────────────────┘
```

### Слои бэкенда
- `api/` — HTTP-роуты FastAPI и DI (`Depends`), валидация входа.
- `services/` — бизнес-логика (LLM-клиент, чанкинг, экстракция, нормализация, граф, QA).
- `models/` — Pydantic-схемы (DTO для API + внутренние): `Document`, `Chunk`, `Triplet`, `ExtractionResult`, `Node`, `Edge`, `GraphData`, `GraphStats`, `QARequest`, `QAResponse`.
- `prompts/` — текстовые шаблоны промптов (RU/EN extraction, text-to-Cypher, answer-generation).
- `config/` — справочник алиасов сущностей и предикатов (`aliases.json`).

### Слои фронтенда
- `api/client.ts` — типизированная обёртка над всеми REST + SSE-эндпоинтами через axios.
- `components/` — React-компоненты экранов и панелей.
- `types/index.ts` — общие TS-типы (зеркалят бэкенд) + цветовая палитра типов сущностей.
- `utils/` — `useLocalStorage` (versioned wrapper), `formatRelative` (Intl.RelativeTimeFormat).

### Подходы и паттерны
- **DI через FastAPI `Depends` + `lru_cache`** — синглтоны сервисов на процесс (graph driver, doc repo, pipeline, LLM client).
- **Async/await везде**: Neo4j-драйвер async, OpenAI-клиент async, обработка чанков в `for`-цикле без параллелизма (последовательно, чтобы не упереться в rate-limit Groq).
- **Strategy/Protocol**: `LLMClient` и `DocumentRepository` оформлены как `typing.Protocol` — провайдер легко заменим (например, Ollama вместо Groq, Postgres-репозиторий вместо in-memory).
- **SSE для прогресса** вместо WebSocket — простее, односторонний канал «обработано N из M чанков».
- **Идемпотентный апсерт** в Neo4j через `MERGE` по имени сущности и по `RELATES{type}`.
- **Read-only защита** для пользовательских Cypher (см. `_validate_readonly` в `graph_service.py`) — запрещены `CREATE/DELETE/SET/MERGE/...`.

---

## 4. Доменная модель (что хранится в графе)

### Сущность (узел `Entity`)
- Все сущности имеют label `:Entity` плюс динамический label по типу (`:Person`, `:Organization`, ...).
- Свойства: `name`, `type`, `created_at` (datetime).
- Уникальность — по `name` (через `MERGE (e:Entity {name: ...})`).

### Связь (`-[:RELATES]->`)
- Все рёбра одного типа `RELATES`, конкретный предикат хранится в свойстве `type` (например, `developed`, `part_of`).
- Свойства ребра: `type`, `source` (id документа-источника), `context` (первые 200 символов чанка, откуда извлечён триплет), `confidence`, `created_at`.
- Дубликаты сливаются: `MERGE (s)-[r:RELATES {type: t.predicate}]->(o)`.

### Типы сущностей по умолчанию
`Person, Organization, Technology, Concept, Location, Date, Event, Product`. Пользователь может прислать **свой кастомный список** при загрузке (`entity_types`), он подставляется в промпт извлечения вместо дефолтов (например, для медицины: `Drug, Disease, Gene`).

### Индексы Neo4j
Создаются при старте приложения (lifespan `create_indexes`):
- Fulltext index `entityNameIndex` на `Entity.name` — нужен для нечеткого поиска (`/api/graph/search`).
- B-tree `entityNameIdx` на `name`, `entityTypeIdx` на `type` — для быстрых фильтров.

### Документы
Хранятся **в памяти процесса** (`InMemoryDocumentRepository`). При перезапуске backend — список документов теряется, но граф остаётся (он в Neo4j). Это сознательный компромисс ради простоты MVP.

---

## 5. Пайплайн извлечения (от текста до графа)

Реализован в `services/extraction_pipeline.py:ExtractionPipeline.run`. Шаги:

1. **Приём** — пользователь загружает файл (`POST /api/documents`) или вставляет текст (`POST /api/documents/text`). Файл сохраняется в `/app/uploads/{doc_id}_{filename}`.
2. **Извлечение текста** (`DocumentService.extract_text`):
   - `txt` — чтение байтов, автодетект кодировки `chardet`, decode.
   - `pdf` — `PyPDF2.PdfReader.pages`, конкатенация `extract_text()`.
   - `docx`/`doc` — `python-docx`, текст параграфов через `\n`.
3. **Определение языка** — простой счётчик кириллических кодпойнтов в первой 1000 символов. Если ≥ 20% — `ru`, иначе `en`. Можно прислать явно.
4. **Создание `Document`** в репо со статусом `pending`, **запуск фоновой задачи** (`asyncio.create_task(pipeline.run(...))`). HTTP отвечает `202 Accepted` + `doc_id`.
5. **Чанкинг** (`ChunkingService.split`):
   - Разбивка на предложения регулярным выражением `(?<=[.!?])\s+`.
   - Накопление предложений в чанк, пока приблизительная длина в токенах (`len // 4`) не превысит `chunk_size` (по умолчанию 1200).
   - **Overlap** между соседними чанками (по умолчанию 150 «токенов») — несколько последних предложений предыдущего чанка попадают в начало следующего, чтобы LLM не терял контекст на стыках.
6. **LLM-экстракция** (`ExtractionService.extract_from_chunk`):
   - Берётся промпт `extraction_ru.txt` или `extraction_en.txt` (длинный детальный системный промпт с правилами и примерами правильных/неправильных триплетов, см. `backend/prompts/`).
   - Подставляются `{text}` и `{entity_types}`.
   - Запрос к Groq в JSON-mode (`response_format=json_object`, `temperature=0.1`).
   - **Retry** до `MAX_RETRIES` (по умолчанию 3) при `JSONDecodeError`/`KeyError`.
   - Парсятся триплеты `(subject, subject_type, predicate, object, object_type)` + сохраняется первые 200 символов чанка как `context`.
7. **Нормализация** (`NormalizationService.normalize_triplets`):
   - **Алиасы сущностей** (`config/aliases.json`): `вшэ → НИУ ВШЭ`, `Google Brain/Research → Google`, `Meta AI Research → Meta AI` и т.п.
   - **Алиасы предикатов**: `создал → разработал`, `created/invented/built → developed` и т.п.
   - **Дедупликация** по нижнему регистру тройки `(s, p, o)`.
   - **Слияние похожих сущностей**: `difflib.SequenceMatcher` ≥ `SIMILARITY_THRESHOLD` (0.85) ⇒ канонизировать к более длинному имени. Спец-правило для `Organization`: совпадение первого слова длиной ≥ 3 (например, «Yandex Self-Driving» → «Yandex»).
8. **Запись в Neo4j** (`GraphService.save_triplets`):
   - Один `UNWIND $triplets` с `MERGE` сущностей и `MERGE` ребра `RELATES{type}`.
   - **Динамические labels** добавляются отдельным запросом на каждую сущность (Neo4j не позволяет dynamic labels внутри `UNWIND`). Имена санитизируются регуляркой `[^a-zA-Z0-9_]`.
   - В свойствах ребра сохраняются `source = doc_id`, `context`, `confidence`.
9. **Прогресс** обновляется в `ExtractionPipeline.jobs[doc_id]` (`processed_chunks`, `triplets_so_far`, `status`). Этот словарь живёт в памяти процесса.
10. **Ошибки** ловятся одним `except Exception` — статус документа становится `error`, `error_message` сохраняется.

> **Важная характеристика**: чанки обрабатываются **последовательно**. Это упрощает наблюдение прогресса и не «душит» Groq, но не использует параллелизм. Узкое место — LLM-вызовы.

---

## 6. Question Answering (text-to-Cypher → ответ)

Реализован в `services/qa_service.py:QAService.ask`. Алгоритм:

1. **Определение языка** вопроса (по доле кириллицы в первых 500 символов).
2. **Генерация Cypher** через LLM (`prompts/text_to_cypher.txt`):
   - Промпт описывает схему графа (`:Entity {name, type}`, `:RELATES {type}`), типы сущностей и правила (LIMIT 25, `toLower`, `CONTAINS`).
   - `temperature=0.0`. Ответ — голый Cypher, обрезаются ```code-fences```.
3. **Валидация и выполнение**: Cypher проходит проверку `_validate_readonly` (нет `CREATE/DELETE/SET/MERGE/REMOVE/DROP/CALL dbms`) и выполняется в Neo4j-сессии.
4. **Fallback при ошибке или пустом результате** (`QAService._fallback_query`):
   - **Эвристики по ключевым словам** (`person/people/человек/люди → Person`, `organization/компания → Organization`, `technology/технолог → Technology`).
   - **Generic fallback** — берёт «слова длиной > 3» из вопроса и ищет узлы по `CONTAINS` на каждое слово.
   - Используются шаблоны `FALLBACK_TEMPLATES`: `all_of_type`, `connections_of`, `path_between`.
5. **Формирование ответа** (`prompts/answer_generation.txt`):
   - LLM получает оригинальный вопрос + JSON c первыми 20 строками результата.
   - Пишет связный ответ на языке вопроса. Если данных нет — честно об этом сообщает.
6. Возвращается `QAResponse {answer, cypher_query, raw_results, method}` (`method` ∈ `text_to_cypher | fallback`).

---

## 7. REST API (контракт)

База: `/api`. Все ответы — JSON, кодировка UTF-8. CORS настраивается через `ALLOWED_ORIGINS` (по умолчанию `http://localhost:3000`).

### Documents (`/api/documents`)
| Метод | Путь | Тело/параметры | Поведение |
|-------|------|----------------|-----------|
| `POST` | `/api/documents` | multipart: `file`, `language=auto`, `entity_types?` (JSON-массив строк) | Загрузка файла. Валидация: расширение ∈ `pdf/docx/doc/txt`, `entity_types` ≤ 30 штук, имя ≤ 50 символов. Возвращает `202 {id, filename, status:"processing"}`. |
| `POST` | `/api/documents/text` | JSON `{text, language?, entity_types?}` | То же, но текст вставлен напрямую. Создаётся «документ» с filename `[pasted text]`. |
| `GET`  | `/api/documents` | — | Список документов (in-memory), отсортирован по `created_at` desc. |
| `GET`  | `/api/documents/{doc_id}` | — | Детали документа. |
| `DELETE` | `/api/documents/{doc_id}` | — | Удаляет документ из репо + удаляет из Neo4j все рёбра с `r.source = doc_id` + чистит «осиротевшие» узлы (`WHERE NOT (n)--()`). |

### Graph (`/api/graph`)
| Метод | Путь | Параметры | Поведение |
|-------|------|-----------|-----------|
| `GET` | `/api/graph` | `limit=500 (1..2000)`, `types[]?` | Возвращает узлы (отсортированы по числу связей desc) и рёбра (до `limit*2`). |
| `GET` | `/api/graph/stats` | — | Возвращает `{total_nodes, total_edges, types_distribution[], top_connected[10], documents_processed}`. |
| `DELETE` | `/api/graph/clear` | — | `MATCH (n) DETACH DELETE n` + удаление всех документов из репо. **Деструктивно**. |
| `GET` | `/api/graph/search` | `q (≥1 символ)`, `limit=20 (1..100)` | Fulltext-поиск по `entityNameIndex` (с fuzzy `~`). |
| `GET` | `/api/graph/node/{node_name}/neighbors` | `depth=1 (1..3)` | Возвращает соседство узла (вход/выход) до глубины 3. |

### QA (`/api/qa`)
| Метод | Путь | Тело | Поведение |
|-------|------|------|-----------|
| `POST` | `/api/qa` | `{question, language="auto"}` | Возвращает `{answer, cypher_query, raw_results, method}`. |

### Extraction (`/api/extraction`)
| Метод | Путь | Параметры | Поведение |
|-------|------|-----------|-----------|
| `GET` | `/api/extraction/{doc_id}/status` | — | **SSE-стрим**. События: `progress {chunk, total, triplets_so_far}` каждую секунду; `complete {total_triplets, total_chunks}` при успехе; `error {error}` при ошибке. Стрим закрывается при complete/error. |

### Прочее
- Заголовок `Cache-Control: no-cache` на SSE-стриме.
- Нет аутентификации, нет rate-limit, нет API-ключей.

---

## 8. UI: страницы, компоненты, поведение

Приложение **одностраничное**. Вся работа на одном экране, разделённом на header + sidebar + main + footer:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Anagraph     [текст для анализа...] [Анализировать] [Файл] [Типы]   │  <- header
├───────────┬──────────────────────────────────────────────────────────┤
│ Фильтр    │                                                          │
│ по типу   │                                                          │
│           │                Граф (vis-network)                        │
│ Поиск     │                                                          │
│           │                                                          │
│ Документы │                                                          │
│           ├──────────────────────────────────────────────────────────┤
│ Статистика│  [Спросить...] [Спросить][Сбросить]                       │  <- QA
│  • types  │   ▶ История (N)                                          │
│  • top10  │   <ответ>  [Показать Cypher]                             │
│ [Очистить]│                                                          │
└───────────┴──────────────────────────────────────────────────────────┘
│ ● Имя_узла (Тип) — 15 связей  → developed → BERT  → ...     [✕]      │  <- footer (если узел выбран)
└──────────────────────────────────────────────────────────────────────┘
```

### Header — `DocumentUpload`
- **Поле «Вставьте текст для анализа»** + кнопка **Анализировать** (Enter тоже работает).
- **Кнопка «Файл»** — открывает file picker (`.pdf,.docx,.txt`).
- **Drag-and-drop любого файла в окно** — на весь экран показывается оверлей `«Перетащите файл для анализа»`.
- **Кнопка «Типы»** — раскрывает поле для ввода кастомных типов сущностей через запятую (например, `Drug, Disease, Gene`). Сохраняется в `localStorage` (versioned wrapper).
- **Прогресс** в виде `[bar] N/M | K триплетов` пока идёт SSE-обработка.
- **Валидация на клиенте**: расширение ∈ {pdf, docx, doc, txt}, размер ≤ 10 МБ, иначе показывается inline-ошибка.
- **Toast-уведомления** через `ToastProvider` — `«Добавлено N триплетов из M чанков»` (зелёный) / ошибка (красный).

### Sidebar (4 панели)

#### `FilterPanel` — «Фильтр по типу»
- Чекбоксы по 8 предустановленным типам с цветными индикаторами.
- Если ни один не выбран — показываются все. Иначе фильтрация передаётся в `getGraph(limit, types)`.

#### `SearchBar` — «Поиск»
- Инкрементальный поиск (`enabled: query.length >= 2`), TanStack Query кэширует.
- Список результатов: цветная точка типа + имя + лейбл типа. Клик — выделяет узел (открывается `NodeDetails` внизу).

#### `DocumentList` — «Документы»
- Подгружается через `useQuery(["documents", refreshKey])`.
- **Авто-polling**: пока хотя бы один документ в `pending/processing` — `refetchInterval: 2000`. Закрывается, когда всё `completed/error`.
- На каждой строке: имя файла, цветной бейдж статуса (`ожидает/обработка/готово/ошибка`), относительное время («5 минут назад»), число извлечённых триплетов, кнопка удалить (двухкликовая: первый клик — `✕` становится `✓` подтверждением).
- При ошибке показывается `error_message` под строкой.

#### `StatsPanel` — «Статистика»
- Показывает: `Узлов`, `Связей`, `Документов`.
- Распределение по типам (с цветной точкой и счётчиком).
- Топ-10 самых связанных узлов с рангом, цветом типа и числом связей. Клик — выделяет узел.
- Кнопка **«Очистить граф»** (двухкликовая, красная) — `DELETE /api/graph/clear`.

### Main area

#### `GraphViewer` — основная зона
- Тянет данные `getGraph(500, activeTypes?)`.
- Использует **vis-network**: physics solver `barnesHut` (gravConstant `-3000`, springLength 150).
- Размер узла: `min(10 + connections * 2, 40)`. Цвет — по типу (палитра в `types/index.ts`).
- **«Свежие» узлы** (`created_at` < 30 секунд назад) подсвечиваются оранжевой обводкой `#fab387` и более толстой границей. Через 30 секунд оформление возвращается к обычному.
- **Клик по узлу**: открывает `NodeDetails` снизу + диммирует все нерелевантные узлы и рёбра (highlighting connected).
- **Клик по ребру**: показывает плавающий tooltip с типом связи и сохранённым `context` (или «Контекст не сохранён»). Также диммирует не связанное.
- **Двойной клик по узлу**: фокус-зум с анимацией.
- **Esc**: сбрасывает выделение и закрывает tooltip.
- **Клик в пустоту**: сброс.

#### `QAPanel` — вопрос-ответ снизу под графом
- Поле ввода + кнопка **«Спросить»** (Enter без Shift = отправить). При наличии ответа — кнопка **«Сбросить»**.
- Когда ответа ещё нет — пять предзаготовленных кнопок-примеров (например, «Какие сущности есть в графе?»).
- При ответе показывается текст ответа + раскрывающийся **«Показать Cypher (метод)»** — pre-блок с самим запросом и пометкой `text_to_cypher` или `fallback`.
- **История вопросов** в `localStorage` (последние 10), сворачиваемая «▶ История (N)». Клик по элементу истории восстанавливает ответ. Очистка истории — двухкликовая.

### Footer

#### `NodeDetails`
- Появляется, когда какой-то узел выбран (через клик в графе, поиск или топ-10 в статистике).
- Цветная точка + имя + тип + число связей.
- Подгружает `getNodeNeighbors(name)` и показывает первые 8 связей в виде `→ predicate → target_name`.
- Кнопка `✕` закрывает.

### Глобальные UX-механики
- **Тосты** (`Toast.tsx`, контекст `ToastProvider`) — всплывают снизу-справа, TTL 4 секунды, анимация slide-in. Используются после загрузки документа.
- **`useLocalStorage<T>`** — обёртка с версионированием схемы (`{v:1, data}`) — если версия не совпадает, возвращается `initial`.
- **Тёмная тема** только (Catppuccin-подобные цвета: `#1e1e2e`, `#cdd6f4`, акценты `#89b4fa/#a6e3a1/#fab387/#f38ba8`).

---

## 9. Конфигурация (.env)

Все ключи (см. `.env.example`):

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `NEO4J_URI` | `bolt://localhost:7687` (для backend на хосте) / `bolt://neo4j:7687` (compose автоматически) | URI Neo4j |
| `NEO4J_USER` | `neo4j` | Логин |
| `NEO4J_PASSWORD` | `changeme` | Пароль |
| `GROQ_API_KEY` | — | Ключ Groq Cloud (под капотом — LLaMA) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Имя модели |
| `CHUNK_SIZE` | `1200` | Целевая длина чанка в «токенах» (длина_строки / 4) |
| `CHUNK_OVERLAP` | `150` | Размер пересечения соседних чанков |
| `MAX_RETRIES` | `3` | Повторы при невалидном JSON от LLM |
| `EXTRACTION_TEMPERATURE` | `0.1` | LLM temperature на извлечении |
| `QA_TEMPERATURE` | `0.0` | (зарезервирована, используется hardcoded в QAService) |
| `QA_MAX_TOKENS` | `1024` | (зарезервирована) |
| `CYPHER_FALLBACK_ENABLED` | `true` | (зарезервирована — в текущем коде fallback всегда включён) |
| `SIMILARITY_THRESHOLD` | `0.85` | Порог схожести для слияния похожих сущностей |
| `ALLOWED_ORIGINS` | `["http://localhost:3000"]` | CORS-список (JSON) |

Дефолтные типы сущностей зашиты в `Settings.default_entity_types` (8 типов) — пользователь может перебить через UI/API.

---

## 10. Варианты деплоя

### A. Полностью в Docker (`docker-compose up`)
Самый простой и рекомендуемый путь.
- `docker-compose.yml` поднимает три сервиса:
  - **neo4j** (`neo4j:5-community`, плагин APOC, healthcheck через `cypher-shell`).
  - **backend** (build из `./backend`) — переопределяет `NEO4J_URI=bolt://neo4j:7687`, `depends_on: neo4j healthy`. Том `uploads` для исходных файлов.
  - **frontend** (build из `./frontend`) — Nginx alpine на порту 3000. Внутри сети compose делает `proxy_pass /api/ → http://backend:8000`.
- Порты наружу: **3000** (UI), **8000** (API), **7474** (Neo4j Browser), **7687** (Bolt).
- `.env` подкладывается через `env_file: .env` в backend и переменную `NEO4J_PASSWORD` в neo4j.
- Volumes: `neo4j_data` (граф), `uploads` (загруженные файлы).

### B. Локально для разработки
1. **Neo4j**: поднять через docker (`docker run --rm -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/changeme -e NEO4J_PLUGINS='["apoc"]' neo4j:5-community`).
2. **Backend**: `python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt`, заполнить `.env` (`NEO4J_URI=bolt://localhost:7687`, `GROQ_API_KEY=...`), запустить `uvicorn main:app --reload --app-dir backend`.
3. **Frontend**: `cd frontend && npm install && npm run dev` — Vite на 3000, проксирует `/api → http://localhost:8000`.

### C. Production-варианты (НЕ настроены, требуют ручной работы)
- Перед UI поставить TLS-терминатор (Caddy/Traefik/CloudFront).
- Заменить `InMemoryDocumentRepository` на персистентный (Postgres/SQLite) — реализовать `DocumentRepository` Protocol.
- Внешний Neo4j Aura/AuraDB (поменять `NEO4J_URI`, добавить TLS scheme `neo4j+s://`).
- Добавить аутентификацию перед API (FastAPI dependency или edge-proxy).
- Заменить `asyncio.create_task` на очередь (Celery + Redis или RQ) для устойчивости и масштабирования воркеров.
- Прописать `ALLOWED_ORIGINS` под прод-домен.

---

## 11. Тесты и dev-tooling

### Что есть (`backend/tests`, pytest)
- `test_chunking.py` — 5 тестов: короткий текст → 1 чанк, длинный → > 1, контроль размера, последовательность индексов, пустой текст.
- `test_extraction.py` — 5 async-тестов с `MockLLMClient`: успешный JSON, типы, битый JSON, пустой массив, пропуск incomplete-триплетов.
- `test_normalization.py` — 5 тестов: алиасы сущностей и предикатов, дедуп, full-pipeline normalize, слияние похожих имён (`TensorFlow`/`Tensorflow`).
- `conftest.py` — фикстуры `mock_llm`, `mock_llm_with_triplets`.
- Запуск: `cd backend && pytest`.

### Чего нет
- Нет интеграционных тестов с настоящим Neo4j.
- Нет тестов API-роутов.
- Нет тестов фронтенда (vitest/playwright и т.п.).
- Нет линтера/форматтера в репозитории (нет `ruff.toml`, `eslint.config.*`, `pyproject.toml`).

### Скрипт `scripts/seed_example.py`
Загружает в запущенный backend короткий русский тестовый текст про BERT/Google/OpenAI/Meta, поллит статус и в конце печатает stats графа. Полезен для быстрой проверки end-to-end.

### Дополнительные ресурсы в репо
- `KG_Builder_Technical_Specification.md` (~75 KB) — исходное техническое задание/спека.
- `KG_Test_Texts.md` (~38 KB) — тестовые тексты для построения графов.

---

## 12. Безопасность и ограничения (трезвый список)

- **Read-only Cypher для QA** — есть валидация по чёрному списку ключевых слов (`CREATE/DELETE/SET/MERGE/REMOVE/DROP/CALL dbms`). Это базовая защита, не пуленепробиваемая (не парсер) — в проде стоит ставить отдельного read-only Neo4j-пользователя.
- **Динамические labels** добавляются через f-string — имя типа санитизируется регуляркой `[^a-zA-Z0-9_]`, что закрывает basic Cypher injection. Имя сущности подставляется параметром.
- **Загрузка файлов**: проверка расширения и размера — на клиенте (10 МБ) и расширения — на сервере. Размер на сервере не ограничен (можно завалить памятью). MIME-тип не валидируется.
- **Аутентификация** отсутствует — любой, у кого есть доступ к API, может загрузить документ или очистить граф.
- **Persistent state**: Neo4j переживает рестарт, документы (in-memory) — нет. Прогресс (`pipeline.jobs`) — тоже только в памяти процесса.
- **CORS**: контролируется списком, по умолчанию разрешён только `localhost:3000`.
- **Нет rate-limit** — Groq упрётся в свой rate-limit, на стороне приложения это не учтено.
- **Параллелизм**: чанки документа обрабатываются последовательно. Если двух документов загружают одновременно — это два независимых background-task, граф пишется конкурентно, но дедуплицируется через MERGE.
- **Ошибки LLM**: после `MAX_RETRIES=3` чанк просто отбрасывается без триплетов (логирования нет).

---

## 13. Структура репозитория (с пояснениями)

```
anagraph/
├── docker-compose.yml              # neo4j + backend + frontend
├── .env.example                    # шаблон конфигурации
├── KG_Builder_Technical_Specification.md  # исходное ТЗ
├── KG_Test_Texts.md                # тестовые корпуса
├── scripts/
│   └── seed_example.py             # быстрый smoke-test через HTTP
├── backend/
│   ├── Dockerfile                  # python:3.11-slim, uvicorn
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app + lifespan + CORS
│   ├── config.py                   # pydantic-settings
│   ├── api/
│   │   ├── dependencies.py         # DI: graph, llm, repo, pipeline (lru_cache singletons)
│   │   └── routes/
│   │       ├── documents.py        # CRUD документов + upload (file + text)
│   │       ├── graph.py            # graph/stats/clear/search/neighbors
│   │       ├── qa.py               # POST /qa
│   │       └── extraction.py       # SSE статус
│   ├── services/
│   │   ├── llm_client.py           # Protocol + GroqLLMClient (OpenAI-совместимый)
│   │   ├── chunking_service.py     # sentence-aware split + overlap
│   │   ├── extraction_service.py   # промпт + JSON-mode + retry
│   │   ├── normalization_service.py# aliases + dedup + similarity merge
│   │   ├── extraction_pipeline.py  # orchestrator, in-memory progress
│   │   ├── graph_service.py        # async Neo4j: save_triplets, get_graph, search, neighbors, stats, readonly cypher
│   │   ├── document_service.py     # PDF/DOCX/TXT → text
│   │   ├── document_repository.py  # Protocol + InMemory implementation
│   │   └── qa_service.py           # text-to-cypher + fallback + answer
│   ├── models/                     # Pydantic DTO
│   ├── prompts/                    # extraction_ru/en, text_to_cypher, answer_generation
│   ├── config/aliases.json         # entity & predicate aliases
│   └── tests/                      # pytest
└── frontend/
    ├── Dockerfile                  # node build → nginx alpine
    ├── nginx.conf                  # serve / + proxy /api → backend:8000
    ├── vite.config.ts              # dev proxy /api → localhost:8000
    ├── package.json                # react/vite/vis-network/tanstack-query
    ├── tsconfig.json               # strict, noUnchecked, react-jsx
    ├── index.html
    └── src/
        ├── main.tsx                # React root, QueryClient, ToastProvider
        ├── App.tsx                 # layout + state (selectedNode, activeTypes, refreshKey)
        ├── App.css                 # тёмная тема
        ├── api/client.ts           # axios + SSE
        ├── types/index.ts          # типы + цветовая палитра
        ├── components/
        │   ├── DocumentUpload.tsx  # text/file/dnd/types
        │   ├── DocumentList.tsx    # список с polling
        │   ├── GraphViewer.tsx     # vis-network + highlighting + edge tooltip
        │   ├── QAPanel.tsx         # вопрос/ответ + история
        │   ├── StatsPanel.tsx      # статистика + clear
        │   ├── SearchBar.tsx       # incremental поиск
        │   ├── FilterPanel.tsx     # типы-фильтр
        │   ├── NodeDetails.tsx     # footer выбранного узла
        │   └── Toast.tsx           # ToastProvider + useToast
        └── utils/
            ├── time.ts             # formatRelative (Intl.RelativeTimeFormat)
            └── useLocalStorage.ts  # versioned wrapper
```

---

## 14. Ключевые сильные стороны и осознанные компромиссы

**Сильные стороны**
- **Чистое разделение слоёв и Protocol-абстракции** — LLM-клиент и репозиторий документов сменяемы (Groq → Ollama, in-memory → Postgres).
- **End-to-end pipeline в одной коробке**: парсинг → чанкинг → LLM → нормализация → граф → QA → визуализация. Ничего не нужно «дописывать сбоку».
- **Двуязычность** на уровне промптов и распознавания языка вопроса.
- **Хорошие промпты с примерами правильных/неправильных триплетов** — это видно по `extraction_ru.txt`.
- **UX-фишки**: анимация «свежих» узлов, подсветка связности, drag-and-drop, история QA, custom entity types с памятью.

**Осознанные компромиссы (для MVP)**
- In-memory репозиторий документов и in-memory job-state — переживает только текущий процесс.
- Последовательная обработка чанков — детерминированный прогресс важнее скорости.
- Один общий процесс backend без воркеров — простота вместо масштабируемости.
- Нет аутентификации — рассчитано на локальный запуск.
- Кастомные labels пишутся доп-запросами — компромисс между удобством Neo4j-типизации и ограничениями Cypher.

---

## 15. Быстрая шпаргалка «как запустить и попробовать»

```bash
# 1. Подготовить .env
cp .env.example .env
# вписать GROQ_API_KEY=... (получить на console.groq.com)
# (опционально) поменять NEO4J_PASSWORD

# 2. Поднять всё в Docker
docker compose up --build

# 3. Открыть UI
open http://localhost:3000

# 4. (опционально) Залить пример через скрипт
python scripts/seed_example.py

# 5. Посмотреть в Neo4j Browser напрямую
open http://localhost:7474
# логин/пароль из .env
```

После загрузки документа — следить за прогресс-баром в шапке, по завершении в графе появятся узлы и связи. Можно сразу спрашивать в QA-панели снизу, например: «Какие технологии разработала Google?» — увидишь сгенерированный Cypher и ответ.
