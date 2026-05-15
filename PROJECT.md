# Anagraph — полный профайл проекта

> Документ описывает текущее состояние репозитория `anagraph` (KG Builder): что это, как устроено, какие технологии используются, как разворачивается, как работает пайплайн и что доступно в UI. Все факты сверены с кодом в этой ветке.

---

## 1. Что это и зачем

**Anagraph** — open-source-инструмент для автоматического построения **графа знаний (Knowledge Graph)** из неструктурированного текста и для последующего **общения с этим графом на естественном языке** (вопрос-ответ через text-to-Cypher).

Идея — приватная альтернатива закрытым решениям (LlamaIndex + OpenAI, Microsoft GraphRAG): пользователь разворачивает систему у себя, подключает свой LLM и получает навигируемый граф сущностей и связей, который можно фильтровать, искать, расширять и спрашивать. Провайдер LLM выбирается флагом `LLM_PROVIDER`: по умолчанию **Groq** (облачный OpenAI-совместимый API на LLaMA), либо **локальная Ollama** — тогда данные не покидают контур.

**Ключевые сценарии:**
1. Загрузить документ (PDF/DOCX/TXT) или вставить произвольный текст в поле.
2. Дождаться фоновой обработки (LLM извлекает триплеты, они нормализуются и кладутся в Neo4j).
3. Изучать получившийся граф визуально (vis-network), фильтровать по типам, искать узлы, открывать соседство, удалять узлы.
4. Настраивать **реестр типов сущностей** (добавлять/редактировать/удалять типы с описаниями для LLM) и при необходимости **переизвлекать весь граф** с новым набором типов.
5. Задавать вопросы на естественном языке — ответ строится через LLM-сгенерированный Cypher + LLM-обобщение результатов.

---

## 2. Стек технологий

### Backend (`/backend`)
- **Язык/рантайм**: Python 3.11 (slim-образ).
- **Web-framework**: FastAPI 0.115, ASGI-сервер `uvicorn[standard]` 0.34.
- **Конфиг**: `pydantic-settings` 2.7 (read из `.env` в корне проекта).
- **БД (граф)**: Neo4j 5 Community (драйвер `neo4j` 5.27, async).
- **БД (метаданные)**: **SQLite** через `aiosqlite` 24/0.20 — персистентное хранилище документов и реестра типов сущностей.
- **LLM**: OpenAI-совместимый клиент (`openai` 1.59) — `OpenAICompatibleLLMClient` работает с любым OpenAI-совместимым endpoint'ом. По умолчанию Groq (`https://api.groq.com/openai/v1`, модель `llama-3.3-70b-versatile`); альтернатива — локальная Ollama (`http://localhost:11434/v1`, модель `llama3.1:8b`). Выбор — через `LLM_PROVIDER`.
- **Парсинг файлов**: `PyPDF2` 3.0 (PDF), `python-docx` 1.1 (DOCX), `chardet` 5.2 (кодировка TXT), `aiofiles` 24.1.
- **HTTP**: `httpx` 0.28, `python-multipart` 0.0.20 (multipart upload).
- **Тесты**: `pytest` 8.3, `pytest-asyncio` 0.25.

### Frontend (`/frontend`)
- **Язык/рантайм**: TypeScript ~5.6 (strict, `noUncheckedIndexedAccess`), React 18.3, ESM-модули.
- **Сборка/dev-сервер**: Vite 6.
- **Серверный рендеринг отсутствует** — это SPA.
- **Запросы**: `axios` 1.7, кэширование/инвалидация — `@tanstack/react-query` 5.62.
- **Граф-визуализация**: `vis-network` 9.1 + `vis-data` 7.1.
- **Стили**: один глобальный CSS-файл (`App.css`) + inline-styles в компонентах. Нет CSS-фреймворков.
- **Иконок и UI-китов нет** — всё нативно (button, input, кастомные модалки/тосты).

### Инфраструктура
- **Docker / docker-compose** для local-deployment всех компонент.
- **Nginx alpine** как раздатчик статики фронтенда + обратный прокси на бэкенд (внутри сети compose).
- **Опциональные сервисы Ollama** (`ollama` + `ollama-pull`) под compose-профилем `ollama` — поднимаются только при `docker compose --profile ollama up` и автоматически тянут модель.
- **Volumes**: `neo4j_data` (персистенс графа), `uploads` (исходные файлы документов), `app_data` (SQLite-база), `ollama_data` (модели Ollama).

### Что в репозитории НЕ используется
- Нет ORM (с Neo4j — чистый Cypher через async-driver, с SQLite — сырой SQL через `aiosqlite`).
- Нет очередей сообщений (Celery/RabbitMQ/Redis) — фоновая обработка через `asyncio.create_task`.
- Нет миграций — Neo4j-индексы и SQLite-схема (`CREATE TABLE IF NOT EXISTS`) создаются на старте (lifespan).
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
└──────────────────────┘             │   EntityTypeService    │ ──┐ SQLite (aiosqlite)
                                     │   SqliteDocumentRepo   │ ──┴► data/anagraph.db
                                     │   OpenAICompatibleLLM ─────► Groq | Ollama
                                     └────────────────────────┘
```

### Слои бэкенда
- `api/` — HTTP-роуты FastAPI и DI (`Depends`), валидация входа.
- `services/` — бизнес-логика (LLM-клиент, чанкинг, экстракция, нормализация, граф, QA, реестр типов, SQLite-репозиторий, инициализация БД).
- `models/` — Pydantic-схемы (DTO для API + внутренние): `Document`, `Chunk`, `Triplet`, `ExtractionResult`, `Node`, `Edge`, `GraphData`, `GraphStats`, `QARequest`, `QAResponse`, `EntityType` (+ `EntityTypeCreate`/`EntityTypeUpdate`).
- `prompts/` — текстовые шаблоны промптов (RU/EN extraction, text-to-Cypher, answer-generation).
- `config/aliases.json` — справочник алиасов сущностей и предикатов.
- `settings.py` — `pydantic-settings`, читает `.env` из корня репозитория.
- `services/storage.py` — DDL-схема SQLite и `init_database()`.

### Слои фронтенда
- `api/client.ts` — типизированная обёртка над всеми REST + SSE-эндпоинтами через axios.
- `components/` — React-компоненты экранов и панелей.
- `hooks/useEntityTypes.ts` — react-query-хук над реестром типов: данные + хелперы `getColor`/`getLabel`/`isKnown` + мутации create/update/remove/reset.
- `types/index.ts` — общие TS-типы (зеркалят бэкенд) + константы `ORPHAN_TYPE_COLOR`, `OTHER_TYPE_NAME`.
- `utils/` — `useLocalStorage` (versioned wrapper, используется историей QA), `formatRelative` (Intl.RelativeTimeFormat).

### Подходы и паттерны
- **DI через FastAPI `Depends` + `lru_cache`** — синглтоны сервисов на процесс (graph driver, doc repo, entity-type service, pipeline, LLM client).
- **Async/await везде**: Neo4j-драйвер async, SQLite через `aiosqlite`, OpenAI-клиент async, обработка чанков в `for`-цикле без параллелизма (последовательно, чтобы не упереться в rate-limit провайдера).
- **Strategy/Protocol**: `LLMClient` и `DocumentRepository` оформлены как `typing.Protocol`. LLM-провайдер выбирается одним флагом; репозиторий документов имеет две реализации — `SqliteDocumentRepository` (используется) и `InMemoryDocumentRepository` (запасная).
- **SSE для прогресса** вместо WebSocket — проще, односторонний канал «обработано N из M чанков» (как для одиночной загрузки, так и для переизвлечения всего графа).
- **Идемпотентный апсерт** в Neo4j через `MERGE` по имени сущности и по `RELATES{type}`.
- **Read-only защита** для пользовательских Cypher (см. `_validate_readonly` в `graph_service.py`) — запрещены `CREATE/DELETE/DETACH/SET/REMOVE/MERGE/DROP/CALL dbms`.
- **Персистентность**: граф — в Neo4j; документы и реестр типов — в SQLite (переживают рестарт). Только состояние фоновых задач (`pipeline.jobs`, `pipeline.re_extract_job`) живёт в памяти процесса.

---

## 4. Доменная модель

### Сущность (узел `Entity`)
- Все сущности имеют label `:Entity` плюс динамический label по типу (`:Person`, `:Organization`, ...).
- Свойства: `name`, `type`, `created_at` (datetime).
- Уникальность — по `name` (через `MERGE (e:Entity {name: ...})`).

### Связь (`-[:RELATES]->`)
- Все рёбра одного типа `RELATES`, конкретный предикат хранится в свойстве `type` (например, `developed`, `part_of`).
- Свойства ребра: `type`, `source` (id документа-источника), `context` (предложение из чанка, где встретились и субъект, и объект — до 400 символов), `confidence`, `created_at`.
- Дубликаты сливаются: `MERGE (s)-[r:RELATES {type: t.predicate}]->(o)`.

### Реестр типов сущностей (SQLite, таблица `entity_types`)
Типы сущностей — это **глобальный реестр**, который пользователь редактирует через UI/API, а не список, передаваемый при каждой загрузке. Каждый тип: `name` (латиница, идентификатор), `label` (отображаемое имя, обычно по-русски), `color` (hex), `description` (краткое определение — подставляется в промпт извлечения и влияет на качество), `visible` (флаг фильтра в UI), `is_default`, `position`.

Стандартный набор (`is_default=true`), которым реестр сидится при первом старте: `Person, Organization, Technology, Concept, Location, Date, Event, Product` + зарезервированный тип **`Other`** — fallback для сущностей, которые LLM не смог отнести ни к одному типу. `Other` нельзя удалить.

При загрузке документа в него **снимается снапшот текущего реестра** (поле `used_type_names`) — чтобы потом можно было обнаружить документы, извлечённые со «старым» набором типов, и переизвлечь их.

### Индексы Neo4j
Создаются при старте приложения (lifespan):
- Fulltext index `entityNameIndex` на `Entity.name` — для нечеткого поиска (`/api/graph/search`).
- B-tree `entityNameIdx` на `name`, `entityTypeIdx` на `type` — для быстрых фильтров.

### Документы (SQLite, таблица `documents`)
Хранятся в SQLite (`data/anagraph.db`) и **переживают рестарт backend**. Поля: `id`, `filename`, `text_length`, `num_chunks`, `status`, `created_at`, `triplets_extracted`, `error_message`, `source_path` (путь к загруженному файлу), `raw_text` (текст для документов из вставленного текста), `language`, `used_type_names` (JSON-снапшот реестра типов на момент загрузки). `source_path`/`raw_text` нужны для переизвлечения; в API-ответах они исключаются.

---

## 5. Пайплайн извлечения (от текста до графа)

Реализован в `services/extraction_pipeline.py:ExtractionPipeline.run`. Шаги:

1. **Приём** — пользователь загружает файл (`POST /api/documents`) или вставляет текст (`POST /api/documents/text`). Файл сохраняется в `uploads/{doc_id}_{filename}`; вставленный текст кладётся в колонку `raw_text`.
2. **Извлечение текста** (`DocumentService.extract_text`):
   - `txt` — чтение байтов, автодетект кодировки `chardet`, decode.
   - `pdf` — `PyPDF2.PdfReader.pages`, конкатенация `extract_text()`.
   - `docx`/`doc` — `python-docx`, текст параграфов через `\n`.
3. **Определение языка** — счётчик кириллических кодпойнтов в первой 1000 символов. Если > 20% — `ru`, иначе `en`. Можно прислать явно.
4. **Создание `Document`** в SQLite со статусом `pending`; в `used_type_names` снимается снапшот текущего реестра типов; запускается фоновая задача (`asyncio.create_task(pipeline.run(...))`). HTTP отвечает `202 Accepted` + `{id, filename, status:"processing"}`.
5. **Чанкинг** (`ChunkingService.split`):
   - Разбивка на предложения регулярным выражением `(?<=[.!?])\s+`.
   - Накопление предложений в чанк, пока приблизительная длина в токенах (`len // 4`) не превысит `chunk_size` (по умолчанию 1200).
   - **Overlap** между соседними чанками (по умолчанию 150 «токенов») — несколько последних предложений предыдущего чанка попадают в начало следующего, чтобы LLM не терял контекст на стыках.
6. **LLM-экстракция** (`ExtractionService.extract_from_chunk`):
   - Берётся промпт `extraction_ru.txt` или `extraction_en.txt` (длинный детальный промпт с правилами и примерами правильных/неправильных триплетов, см. `backend/prompts/`).
   - В промпт подставляются `{text}`, `{entity_types}` (список имён типов), `{type_definitions}` (строки `name — description` из реестра) и `{example_type}`. Тип `Other` всегда добавляется в набор.
   - Запрос к LLM в JSON-mode (`response_format=json_object`, `temperature=0.1`).
   - **Retry** до `MAX_RETRIES` (по умолчанию 3) при `JSONDecodeError`/`KeyError`.
   - Парсятся триплеты `(subject, subject_type, predicate, object, object_type)`. Типы валидируются по реестру: всё, что не в списке разрешённых имён, заменяется на `Other`.
   - **Контекст** триплета — предложение из чанка, в котором встретились и субъект, и объект (или хотя бы один из них), обрезанное до 400 символов.
7. **Нормализация** (`NormalizationService.normalize_triplets`):
   - **Алиасы сущностей и предикатов** грузятся из `config/aliases.json` (`вшэ → НИУ ВШЭ`, `Google Brain/Research → Google`, `создал → разработал`, `created/invented/built → developed` и т.п.).
   - **Дедупликация** по нижнему регистру тройки `(s, p, o)`.
   - **Слияние похожих сущностей**: `difflib.SequenceMatcher` ≥ `SIMILARITY_THRESHOLD` (0.85) ⇒ канонизировать к более длинному имени. Спец-правило для пар `Organization`/`Organization`: совпадение первого слова длиной ≥ 3 (например, «Yandex Self-Driving» → «Yandex»).
8. **Запись в Neo4j** (`GraphService.save_triplets`):
   - Один `UNWIND $triplets` с `MERGE` сущностей и `MERGE` ребра `RELATES{type}`.
   - **Динамические labels** добавляются отдельным запросом на каждую сущность (Neo4j не позволяет dynamic labels внутри `UNWIND`). Имена санитизируются регуляркой `[^a-zA-Z0-9_]`.
   - В свойствах ребра сохраняются `source = doc_id`, `context`, `confidence`.
9. **Прогресс** обновляется в `ExtractionPipeline.jobs[doc_id]` (`processed_chunks`, `triplets_so_far`, `status`). Этот словарь живёт в памяти процесса.
10. **Ошибки** ловятся одним `except Exception` — статус документа становится `error`, `error_message` сохраняется в SQLite.

> **Важная характеристика**: чанки обрабатываются **последовательно**. Это упрощает наблюдение прогресса и не «душит» провайдера LLM, но не использует параллелизм. Узкое место — LLM-вызовы.

### Переизвлечение всего графа (re-extract)

`ExtractionPipeline.re_extract_all` + роуты `/api/graph/re-extract`. Нужно, когда пользователь поменял реестр типов и хочет, чтобы граф соответствовал новому набору:
1. Граф полностью очищается (`MATCH (n) DETACH DELETE n`).
2. Перебираются все документы, у которых есть `raw_text` или `source_path`. Для каждого текст берётся из `raw_text` либо заново извлекается из файла по `source_path`; если источник недоступен — документ пропускается и попадает в `errors`.
3. Документ перезапускается через тот же `run(...)` с актуальным реестром типов; `used_type_names` обновляется.
4. Прогресс (`ReExtractJobState`: текущий документ, чанк, всего документов, триплетов) отдаётся по SSE.
- Повторный запуск, пока идёт переизвлечение, отклоняется (`409`).
- `GET /api/graph/types-snapshot` отдельно сверяет `used_type_names` каждого завершённого документа с текущим реестром и возвращает список «устаревших» документов — UI показывает по нему предупреждение.

---

## 6. Question Answering (text-to-Cypher → ответ)

Реализован в `services/qa_service.py:QAService.ask`. Алгоритм:

1. **Определение языка** вопроса (по доле кириллицы в первых 500 символов).
2. **Генерация Cypher** через LLM (`prompts/text_to_cypher.txt`):
   - Промпт описывает схему графа (`:Entity {name, type}`, `:RELATES {type}`), типы сущностей и правила (LIMIT 25, `toLower`, `CONTAINS`).
   - `temperature=0.0`, `response_format=text`. Ответ — голый Cypher, обрезаются ```code-fences```.
3. **Валидация и выполнение**: Cypher проходит проверку `_validate_readonly` (нет `CREATE/DELETE/DETACH/SET/REMOVE/MERGE/DROP/CALL dbms`) и выполняется в Neo4j-сессии.
4. **Fallback при ошибке или пустом результате** (`QAService._fallback_query`):
   - **Эвристики по ключевым словам** (`person/people/человек/люди → Person`, `organization/company/организаци/компани → Organization`, `technology/технолог → Technology`).
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
| `POST` | `/api/documents` | multipart: `file`, `language=auto` | Загрузка файла. Валидация: расширение ∈ `pdf/docx/doc/txt`. Реестр типов снимается снапшотом автоматически. Возвращает `202 {id, filename, status:"processing"}`. |
| `POST` | `/api/documents/text` | JSON `{text, language?}` | То же, но текст вставлен напрямую. Создаётся «документ» с filename `[pasted text]`, текст хранится в `raw_text`. |
| `GET`  | `/api/documents` | — | Список документов (из SQLite), отсортирован по `created_at` desc. Поля `raw_text`/`source_path` исключены. |
| `GET`  | `/api/documents/{doc_id}` | — | Детали документа (без `raw_text`/`source_path`). |
| `DELETE` | `/api/documents/{doc_id}` | — | Удаляет документ из SQLite + удаляет из Neo4j все рёбра с `r.source = doc_id` + чистит «осиротевшие» узлы (`WHERE NOT (n)--()`) + удаляет загруженный файл с диска. |

### Graph (`/api/graph`)
| Метод | Путь | Параметры | Поведение |
|-------|------|-----------|-----------|
| `GET` | `/api/graph` | `limit=500 (1..2000)`, `types[]?` | Возвращает узлы (отсортированы по числу связей desc) и рёбра (до `limit*2`). |
| `GET` | `/api/graph/stats` | — | Возвращает `{total_nodes, total_edges, types_distribution[], top_connected[10], documents_processed}`. |
| `DELETE` | `/api/graph/clear` | — | `MATCH (n) DETACH DELETE n` + удаление всех документов из SQLite. **Деструктивно**. |
| `GET` | `/api/graph/search` | `q (≥1 символ)`, `limit=20 (1..100)` | Fulltext-поиск по `entityNameIndex` (с fuzzy `~`). |
| `GET` | `/api/graph/node/{node_name}/neighbors` | `depth=1 (1..3)` | Возвращает соседство узла (`GraphData`: узлы + рёбра) до глубины 3. |
| `DELETE` | `/api/graph/node/{node_name}` | — | Удаляет узел и все его рёбра (`DETACH DELETE`). `404`, если узла нет. |
| `GET` | `/api/graph/types-snapshot` | — | Сверяет `used_type_names` завершённых документов с текущим реестром. Возвращает `{is_consistent, stale_doc_ids[], current_type_names[]}`. |
| `POST` | `/api/graph/re-extract` | — | Запускает фоновое переизвлечение всего графа с текущим реестром типов. `202 {status, total_docs}`. `409`, если переизвлечение уже идёт; `400`, если нет документов с доступным источником. |
| `GET` | `/api/graph/re-extract/status` | — | **SSE-стрим** прогресса переизвлечения: `progress`/`complete`/`error`. |

### QA (`/api/qa`)
| Метод | Путь | Тело | Поведение |
|-------|------|------|-----------|
| `POST` | `/api/qa` | `{question, language="auto"}` | Возвращает `{answer, cypher_query, raw_results, method}`. |

### Extraction (`/api/extraction`)
| Метод | Путь | Параметры | Поведение |
|-------|------|-----------|-----------|
| `GET` | `/api/extraction/{doc_id}/status` | — | **SSE-стрим**. События: `progress {chunk, total, triplets_so_far}` каждую секунду; `complete {total_triplets, total_chunks}` при успехе; `error {error}` при ошибке. Стрим закрывается при complete/error. |

### Entity Types (`/api/entity-types`)
| Метод | Путь | Тело | Поведение |
|-------|------|------|-----------|
| `GET` | `/api/entity-types` | — | Текущий реестр типов (из SQLite), отсортирован по `position`, затем `name`. |
| `GET` | `/api/entity-types/defaults` | — | Стандартный набор типов (без обращения к БД) — для справки. |
| `POST` | `/api/entity-types` | `{name, label?, description?, color?}` | Создаёт тип. Валидация: `name` — латиница/цифры/подчёркивания, начинается с буквы, ≤ 50 символов, не `Other`, не дубликат. Цвет — `#rrggbb` (если не задан, берётся из палитры). `201`. |
| `PATCH` | `/api/entity-types/{name}` | `{label?, description?, color?, visible?, position?}` | Частичное обновление типа. |
| `DELETE` | `/api/entity-types/{name}` | — | Удаляет тип из реестра (`Other` удалить нельзя). Узлы этого типа остаются в графе. |
| `POST` | `/api/entity-types/reset` | — | Сбрасывает реестр к стандартному набору. |

### Прочее
- Заголовок `Cache-Control: no-cache` на SSE-стримах.
- Нет аутентификации, нет rate-limit, нет API-ключей.

---

## 8. UI: страницы, компоненты, поведение

Приложение **одностраничное**. Вся работа на одном экране, разделённом на header + sidebar + main + footer:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Anagraph     [текст для анализа...] [Анализировать] [Файл]           │  <- header
├───────────┬──────────────────────────────────────────────────────────┤
│ Типы      │                                                          │
│ сущностей │                                                          │
│           │                                                          │
│ Фильтр    │                Граф (vis-network)                        │
│ по типу   │                                                          │
│           │                                                          │
│ Поиск     │                                                          │
│           │                                                          │
│ Документы ├──────────────────────────────────────────────────────────┤
│           │  [Спросить...] [Спросить][Сбросить]                       │  <- QA
│ Статистика│   ▶ История (N)                                          │
│  • types  │   <ответ>  [Показать Cypher]                             │
│  • top10  │                                                          │
│ [Очистить]│                                                          │
└───────────┴──────────────────────────────────────────────────────────┘
│ ● Имя_узла (Тип) — 15 связей  → developed → BERT  ...  [Удалить] [✕] │  <- footer (если узел выбран)
└──────────────────────────────────────────────────────────────────────┘
```

### Header — `DocumentUpload`
- **Поле «Вставьте текст для анализа»** + кнопка **Анализировать** (Enter тоже работает).
- **Кнопка «Файл»** — открывает file picker (`.pdf,.docx,.txt`).
- **Drag-and-drop любого файла в окно** — на весь экран показывается оверлей `«Перетащите файл для анализа»`.
- **Прогресс** в виде `[bar] N/M | K триплетов` пока идёт SSE-обработка.
- **Валидация на клиенте**: расширение ∈ {pdf, docx, doc, txt}, размер ≤ 10 МБ, иначе показывается inline-ошибка.
- **Toast-уведомления** через `ToastProvider` — `«Добавлено N триплетов из M чанков»` (зелёный) / ошибка (красный).
- Управление типами сущностей вынесено в отдельную панель сайдбара (см. ниже) — кнопки «Типы» в шапке больше нет.

### Sidebar (5 панелей)

#### `EntityTypesPanel` — «Типы сущностей»
- Чипы всех типов реестра с цветной точкой и `label`. Клик по чипу — раскрывает форму редактирования (label, описание для LLM, цвет из палитры).
- **«+ Добавить тип»** — форма создания (имя, label, описание, цвет).
- На каждом чипе (кроме `Other`) — крестик удаления с подтверждением; узлы удалённого типа остаются в графе.
- **«↺ Сбросить»** — реестр возвращается к стандартному набору (с подтверждением).
- **«↻ Переизвлечь весь граф (N док.)»** — запускает re-extract, показывает прогресс-бар по SSE (`Документ i/N · чанк k/m`, число триплетов).
- Если есть документы, извлечённые со старым набором типов (`types-snapshot.is_consistent === false`) — показывается жёлтое предупреждение «N док. извлечены со старым набором типов».

#### `FilterPanel` — «Фильтр по типу»
- Чекбоксы по типам реестра с цветными индикаторами. Переключение `visible` сразу сохраняется на бэкенд (`PATCH /api/entity-types/{name}`); граф фильтруется по этому флагу на клиенте.
- Отдельный блок «Удалённые типы» — типы, которые есть в графе, но отсутствуют в реестре (orphan). Рядом кнопка `+`, добавляющая такой тип обратно в реестр.

#### `SearchBar` — «Поиск»
- Инкрементальный поиск (`enabled: query.length >= 2`), TanStack Query кэширует.
- Список результатов: цветная точка типа + имя + label типа. Клик — выделяет узел (открывается `NodeDetails` внизу).

#### `DocumentList` — «Документы»
- Подгружается через `useQuery(["documents", refreshKey])`.
- **Авто-polling**: пока хотя бы один документ в `pending/processing` — `refetchInterval: 2000`. Останавливается, когда всё `completed/error`.
- На каждой строке: имя файла, цветной бейдж статуса (`ожидает/обработка/готово/ошибка`), относительное время («5 минут назад»), число извлечённых триплетов, кнопка удалить (двухкликовая: первый клик — `✕` становится `✓` подтверждением).
- При ошибке показывается `error_message` под строкой.

#### `StatsPanel` — «Статистика»
- Показывает: `Узлов`, `Связей`, `Документов`.
- Распределение по типам (цвет и label берутся из реестра, для неизвестных типов — серый).
- Топ-10 самых связанных узлов с рангом, цветом типа и числом связей. Клик — выделяет узел.
- Кнопка **«Очистить граф»** (двухкликовая, красная) — `DELETE /api/graph/clear`.

### Main area

#### `GraphViewer` — основная зона
- Тянет данные `getGraph(500)`; видимость по типам фильтруется на клиенте по флагу `visible` из реестра.
- Использует **vis-network**: physics solver `barnesHut` (gravConstant `-3000`, springLength 150).
- Размер узла: `min(10 + connections * 2, 40)`. Цвет — из реестра типов (`useEntityTypes().getColor`); для типов не из реестра — `ORPHAN_TYPE_COLOR`.
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
- Цветная точка + имя + тип (label из реестра; если тип удалён из реестра — пометка «· удалён») + число связей.
- Подгружает `getNodeNeighbors(name)` и показывает первые 8 связей в виде `→ predicate → target_name`.
- Кнопка **«Удалить»** — удаляет узел вместе с рёбрами (`DELETE /api/graph/node/{name}`), с поповером-подтверждением.
- Кнопка `✕` закрывает панель.

### Глобальные UX-механики
- **Тосты** (`Toast.tsx`, контекст `ToastProvider`) — всплывают снизу-справа, TTL 4 секунды, анимация slide-in.
- **`useLocalStorage<T>`** — обёртка с версионированием схемы (`{v:1, data}`) — если версия не совпадает, возвращается `initial`. Используется историей QA.
- **Тёмная тема** только (Catppuccin-подобные цвета: `#1e1e2e`, `#cdd6f4`, акценты `#89b4fa/#a6e3a1/#fab387/#f38ba8`).

---

## 9. Конфигурация (.env)

Все ключи (см. `.env.example`; файл `.env` лежит в корне репозитория):

| Переменная | По умолчанию | Назначение |
|------------|--------------|------------|
| `NEO4J_URI` | `bolt://neo4j:7687` (в compose) / `bolt://localhost:7687` (локальный dev) | URI Neo4j |
| `NEO4J_USER` | `neo4j` | Логин |
| `NEO4J_PASSWORD` | `changeme` | Пароль |
| `LLM_PROVIDER` | `groq` | Провайдер LLM: `groq` (облако) или `ollama` (локально) |
| `GROQ_API_KEY` | — | Ключ Groq Cloud (под капотом — LLaMA) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Имя модели Groq |
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` (в compose перебивается на `http://ollama:11434/v1`) | OpenAI-совместимый endpoint Ollama |
| `OLLAMA_MODEL` | `llama3.1:8b` | Имя модели Ollama |
| `CHUNK_SIZE` | `1200` | Целевая длина чанка в «токенах» (длина_строки / 4) |
| `CHUNK_OVERLAP` | `150` | Размер пересечения соседних чанков |
| `MAX_RETRIES` | `3` | Повторы при невалидном JSON от LLM |
| `EXTRACTION_TEMPERATURE` | `0.1` | LLM temperature на извлечении |
| `QA_TEMPERATURE` | `0.0` | (зарезервирована — в QAService используется hardcoded) |
| `QA_MAX_TOKENS` | `1024` | (зарезервирована) |
| `CYPHER_FALLBACK_ENABLED` | `true` | (зарезервирована — в текущем коде fallback всегда включён) |
| `SIMILARITY_THRESHOLD` | `0.85` | Порог схожести для слияния похожих сущностей |
| `ALLOWED_ORIGINS` | `["http://localhost:3000"]` | CORS-список (JSON) |

Дополнительно в `settings.py` есть ключи с дефолтами, которые обычно не выносят в `.env`: `GROQ_BASE_URL` (`https://api.groq.com/openai/v1`) и `DATABASE_PATH` (`data/anagraph.db`).

Типы сущностей **больше не задаются в `.env`** и не передаются при загрузке — это персистентный реестр в SQLite, управляемый через UI/API (`/api/entity-types`). Стандартный набор зашит в `entity_type_service.DEFAULT_TYPES`.

---

## 10. Варианты деплоя

### A. Полностью в Docker (`docker-compose up`)
Самый простой и рекомендуемый путь.
- `docker-compose.yml` по умолчанию поднимает три сервиса:
  - **neo4j** (`neo4j:5-community`, плагин APOC, healthcheck через `cypher-shell`).
  - **backend** (build из `./backend`) — переопределяет `NEO4J_URI=bolt://neo4j:7687` и `OLLAMA_BASE_URL=http://ollama:11434/v1`, `depends_on: neo4j healthy`. Тома `uploads` (исходные файлы) и `app_data` (SQLite-база `/app/data`).
  - **frontend** (build из `./frontend`) — Nginx alpine на порту 3000. Внутри сети compose делает `proxy_pass /api/ → http://backend:8000`.
- **Опциональный профиль `ollama`**: `docker compose --profile ollama up` дополнительно поднимает `ollama` и одноразовый `ollama-pull` (тянет `OLLAMA_MODEL`). Для использования также нужно `LLM_PROVIDER=ollama` в `.env`.
- Порты наружу: **3000** (UI), **8000** (API), **7474** (Neo4j Browser), **7687** (Bolt), **11434** (Ollama, если поднят).
- `.env` подкладывается через `env_file: .env` в backend и переменную `NEO4J_PASSWORD` в neo4j.
- Volumes: `neo4j_data` (граф), `uploads` (загруженные файлы), `app_data` (SQLite), `ollama_data` (модели Ollama).

### B. Локально для разработки
1. **Neo4j**: поднять через docker (`docker run --rm -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/changeme -e NEO4J_PLUGINS='["apoc"]' neo4j:5-community`).
2. **Backend**: `python -m venv .venv && .venv/bin/pip install -r backend/requirements.txt`, заполнить `.env` в корне (`NEO4J_URI=bolt://localhost:7687`, `LLM_PROVIDER` + ключ/URL провайдера), запустить `uvicorn main:app --reload --app-dir backend`. SQLite-база создастся автоматически в `data/anagraph.db`.
3. **Frontend**: `cd frontend && npm install && npm run dev` — Vite на 3000, проксирует `/api → http://localhost:8000`.
4. Для полностью локального LLM: `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434/v1`, поднять Ollama и скачать модель (`ollama pull llama3.1:8b`).

### C. Production-варианты (НЕ настроены, требуют ручной работы)
- Перед UI поставить TLS-терминатор (Caddy/Traefik/CloudFront).
- SQLite (`data/anagraph.db`) подходит для одиночного инстанса; для нескольких воркеров заменить `SqliteDocumentRepository` и `EntityTypeService` на реализацию поверх Postgres.
- Внешний Neo4j Aura/AuraDB (поменять `NEO4J_URI`, добавить TLS scheme `neo4j+s://`).
- Добавить аутентификацию перед API (FastAPI dependency или edge-proxy).
- Заменить `asyncio.create_task` на очередь (Celery + Redis или RQ) для устойчивости и масштабирования воркеров.
- Прописать `ALLOWED_ORIGINS` под прод-домен.

---

## 11. Тесты и dev-tooling

### Что есть (`backend/tests`, pytest)
- `test_chunking.py` — 5 тестов: короткий текст → 1 чанк, длинный → > 1, контроль размера, последовательность индексов, пустой текст → 0 чанков.
- `test_extraction.py` — 5 async-тестов с `MockLLMClient`: успешный JSON, типы, битый JSON, пустой массив, пропуск incomplete-триплетов.
- `test_normalization.py` — 5 тестов: алиасы сущностей и предикатов, дедуп, full-pipeline normalize, слияние похожих имён (`TensorFlow`/`Tensorflow`).
- `conftest.py` — `MockLLMClient` + фикстуры `mock_llm`, `mock_llm_with_triplets`.
- Запуск: `cd backend && pytest`.

### Чего нет
- Нет тестов `graph_service`/`qa_service`/`entity_type_service`.
- Нет интеграционных тестов с настоящим Neo4j или SQLite.
- Нет тестов API-роутов.
- Нет тестов фронтенда (vitest/playwright и т.п.).
- Нет линтера/форматтера в репозитории (нет `ruff.toml`, `eslint.config.*`, `pyproject.toml`).

### Скрипт `scripts/seed_example.py`
Загружает в запущенный backend короткий русский тестовый текст про BERT/Google/OpenAI/Meta (через `requests`), поллит статус и в конце печатает stats графа. Полезен для быстрой проверки end-to-end.

### Дополнительные ресурсы в репо
- `KG_Builder_Technical_Specification.md` — исходное техническое задание/спека.
- `KG_Test_Texts.md` — тестовые тексты для построения графов.

---

## 12. Безопасность и ограничения (трезвый список)

- **Read-only Cypher для QA** — есть валидация по чёрному списку ключевых слов (`CREATE/DELETE/DETACH/SET/REMOVE/MERGE/DROP/CALL dbms`). Это базовая защита, не пуленепробиваемая (не парсер) — в проде стоит ставить отдельного read-only Neo4j-пользователя.
- **Динамические labels** добавляются через f-string — имя типа санитизируется регуляркой `[^a-zA-Z0-9_]`, что закрывает basic Cypher injection. Имя сущности подставляется параметром.
- **Загрузка файлов**: проверка расширения и размера — на клиенте (10 МБ) и расширения — на сервере. Размер на сервере не ограничен (можно завалить памятью). MIME-тип не валидируется.
- **Аутентификация** отсутствует — любой, у кого есть доступ к API, может загрузить документ, отредактировать реестр типов или очистить граф.
- **Persistent state**: Neo4j (граф) и SQLite (документы + реестр типов) переживают рестарт. Только состояние фоновых задач (`pipeline.jobs`, `pipeline.re_extract_job`) живёт в памяти — рестарт во время обработки теряет трекинг прогресса, хотя уже записанные триплеты остаются в Neo4j.
- **CORS**: контролируется списком, по умолчанию разрешён только `localhost:3000`.
- **Нет rate-limit** — провайдер LLM упрётся в свой rate-limit, на стороне приложения это не учтено.
- **Приватность данных**: при `LLM_PROVIDER=groq` тексты документов и вопросы уходят в облако Groq. При `LLM_PROVIDER=ollama` данные не покидают контур.
- **Параллелизм**: чанки документа обрабатываются последовательно. Переизвлечение всего графа защищено от повторного запуска (`409`). Несколько одновременно загруженных документов — независимые background-task'и, граф пишется конкурентно, но дедуплицируется через MERGE.
- **Ошибки LLM**: после `MAX_RETRIES=3` чанк просто отбрасывается без триплетов (логирования нет).

---

## 13. Структура репозитория (с пояснениями)

```
anagraph/
├── docker-compose.yml              # neo4j + backend + frontend (+ ollama под профилем)
├── .env.example                    # шаблон конфигурации
├── KG_Builder_Technical_Specification.md  # исходное ТЗ
├── KG_Test_Texts.md                # тестовые корпуса
├── scripts/
│   └── seed_example.py             # быстрый smoke-test через HTTP
├── backend/
│   ├── Dockerfile                  # python:3.11-slim, uvicorn
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app + lifespan (init SQLite, seed типов, индексы Neo4j) + CORS
│   ├── settings.py                 # pydantic-settings (.env из корня репозитория)
│   ├── api/
│   │   ├── dependencies.py         # DI: graph, llm, doc repo, entity-type service, pipeline (lru_cache)
│   │   └── routes/
│   │       ├── documents.py        # CRUD документов + upload (file + text)
│   │       ├── graph.py            # graph/stats/clear/search/neighbors/node-delete/types-snapshot/re-extract
│   │       ├── qa.py               # POST /qa
│   │       ├── extraction.py       # SSE статус извлечения документа
│   │       └── entity_types.py     # CRUD реестра типов сущностей
│   ├── services/
│   │   ├── llm_client.py           # Protocol + OpenAICompatibleLLMClient (Groq/Ollama/vLLM)
│   │   ├── chunking_service.py     # sentence-aware split + overlap
│   │   ├── extraction_service.py   # промпт + JSON-mode + retry + валидация типов + контекст-предложение
│   │   ├── normalization_service.py# aliases (config/aliases.json) + dedup + similarity merge
│   │   ├── extraction_pipeline.py  # orchestrator: run() + re_extract_all(), in-memory progress
│   │   ├── graph_service.py        # async Neo4j: save_triplets, get_graph, search, neighbors, stats,
│   │   │                           #   delete node/by-source, clear, readonly cypher
│   │   ├── document_service.py     # PDF/DOCX/TXT → text
│   │   ├── document_repository.py  # Protocol + SqliteDocumentRepository + InMemoryDocumentRepository
│   │   ├── entity_type_service.py  # реестр типов в SQLite: CRUD, дефолты, палитра, валидация
│   │   ├── storage.py              # DDL-схема SQLite + init_database()
│   │   └── qa_service.py           # text-to-cypher + fallback + answer
│   ├── models/                     # Pydantic DTO (document, triplet, graph, qa, entity_type)
│   ├── prompts/                    # extraction_ru/en, text_to_cypher, answer_generation
│   ├── config/aliases.json         # entity & predicate aliases
│   └── tests/                      # pytest (chunking, extraction, normalization)
└── frontend/
    ├── Dockerfile                  # node build → nginx alpine
    ├── nginx.conf                  # serve / + proxy /api → backend:8000
    ├── vite.config.ts              # dev proxy /api → localhost:8000
    ├── package.json                # react/vite/vis-network/tanstack-query
    ├── tsconfig.json               # strict, noUncheckedIndexedAccess, react-jsx
    ├── index.html
    └── src/
        ├── main.tsx                # React root, QueryClient, ToastProvider
        ├── App.tsx                 # layout + state (selectedNode, refreshKey)
        ├── App.css                 # тёмная тема
        ├── api/client.ts           # axios + SSE (документы, граф, QA, типы, re-extract)
        ├── types/index.ts          # типы + ORPHAN_TYPE_COLOR / OTHER_TYPE_NAME
        ├── hooks/
        │   └── useEntityTypes.ts   # react-query над реестром типов + getColor/getLabel/isKnown
        ├── components/
        │   ├── DocumentUpload.tsx  # text/file/dnd
        │   ├── DocumentList.tsx    # список с polling
        │   ├── GraphViewer.tsx     # vis-network + highlighting + edge tooltip
        │   ├── QAPanel.tsx         # вопрос/ответ + история
        │   ├── StatsPanel.tsx      # статистика + clear
        │   ├── SearchBar.tsx       # incremental поиск
        │   ├── FilterPanel.tsx     # фильтр по типам + orphan-типы
        │   ├── EntityTypesPanel.tsx# CRUD реестра типов + re-extract
        │   ├── NodeDetails.tsx     # footer выбранного узла + удаление узла
        │   └── Toast.tsx           # ToastProvider + useToast
        └── utils/
            ├── time.ts             # formatRelative (Intl.RelativeTimeFormat)
            └── useLocalStorage.ts  # versioned wrapper
```

---

## 14. Ключевые сильные стороны и осознанные компромиссы

**Сильные стороны**
- **Чистое разделение слоёв и Protocol-абстракции** — LLM-клиент и репозиторий документов сменяемы (Groq ↔ Ollama одним флагом, SQLite ↔ Postgres через реализацию Protocol).
- **End-to-end pipeline в одной коробке**: парсинг → чанкинг → LLM → нормализация → граф → QA → визуализация. Ничего не нужно «дописывать сбоку».
- **Управляемый реестр типов сущностей** с описаниями, влияющими на промпт, плюс возможность переизвлечь весь граф под новый набор типов.
- **Двуязычность** на уровне промптов и распознавания языка вопроса.
- **Хорошие промпты с примерами правильных/неправильных триплетов** — это видно по `extraction_ru.txt`/`extraction_en.txt`.
- **Персистентность**: документы и реестр типов в SQLite, граф в Neo4j — всё переживает рестарт.
- **UX-фишки**: анимация «свежих» узлов, подсветка связности, drag-and-drop, история QA, удаление узлов, предупреждение о рассинхроне типов.

**Осознанные компромиссы (для MVP)**
- Состояние фоновых задач (`pipeline.jobs`, `re_extract_job`) — только в памяти процесса.
- Последовательная обработка чанков — детерминированный прогресс важнее скорости.
- Один общий процесс backend без воркеров — простота вместо масштабируемости.
- SQLite как метаданных-хранилище — отлично для одиночного инстанса, но не для горизонтального масштабирования.
- Нет аутентификации — рассчитано на локальный/доверенный запуск.
- Кастомные labels пишутся доп-запросами — компромисс между удобством Neo4j-типизации и ограничениями Cypher.

---

## 15. Быстрая шпаргалка «как запустить и попробовать»

```bash
# 1. Подготовить .env
cp .env.example .env
# для Groq: вписать GROQ_API_KEY=... (получить на console.groq.com)
# для локального LLM: LLM_PROVIDER=ollama
# (опционально) поменять NEO4J_PASSWORD

# 2. Поднять всё в Docker
docker compose up --build
# либо с локальной Ollama:
# docker compose --profile ollama up --build

# 3. Открыть UI
open http://localhost:3000

# 4. (опционально) Залить пример через скрипт
python scripts/seed_example.py

# 5. Посмотреть в Neo4j Browser напрямую
open http://localhost:7474
# логин/пароль из .env
```

После загрузки документа — следить за прогресс-баром в шапке, по завершении в графе появятся узлы и связи. Реестр типов сущностей настраивается в панели «Типы сущностей» слева; после изменения типов можно нажать «Переизвлечь весь граф». Спрашивать в QA-панели снизу можно сразу, например: «Какие технологии разработала Google?» — увидишь сгенерированный Cypher и ответ.
