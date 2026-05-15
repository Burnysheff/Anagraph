# Техническое задание: Система построения графа знаний на основе LLM

## Версия: 1.1 | Дата: 04.04.2026 (ред. сверена с реализацией)

> Документ изначально написан как ТЗ. В версии 1.1 факты, код-примеры, API и
> структура приведены в соответствие с реальной реализацией репозитория
> `anagraph`. Сводный профайл текущего состояния — в `PROJECT.md`.

---

## Содержание

1. [Общие сведения](#1-общие-сведения)
2. [Цели и задачи системы](#2-цели-и-задачи-системы)
3. [Пользователи и сценарии использования](#3-пользователи-и-сценарии-использования)
4. [Архитектура системы](#4-архитектура-системы)
5. [Компоненты системы](#5-компоненты-системы)
6. [Модели данных](#6-модели-данных)
7. [Pipeline извлечения знаний](#7-pipeline-извлечения-знаний)
8. [QA-компонент (Text-to-Cypher)](#8-qa-компонент-text-to-cypher)
9. [API спецификация](#9-api-спецификация)
10. [Веб-интерфейс](#10-веб-интерфейс)
11. [Конфигурация и настройка](#11-конфигурация-и-настройка)
12. [Развёртывание](#12-развёртывание)
13. [Тестирование](#13-тестирование)
14. [Ограничения и компромиссы](#14-ограничения-и-компромиссы)
15. [Дорожная карта](#15-дорожная-карта)

---

## 1. Общие сведения

### 1.1. Название проекта

**Anagraph** — KnowledgeGraph Builder (репозиторий: `anagraph`)

### 1.2. Суть проекта

Система автоматического построения графа знаний из неструктурированного текста на основе open-source больших языковых моделей (LLM). Пользователь загружает текстовый документ, система извлекает сущности и связи, сохраняет их в графовой базе данных, предоставляет интерактивную визуализацию и позволяет задавать вопросы к графу на естественном языке.

### 1.3. Ключевые принципы

- **Конфигурируемая приватность**: провайдер LLM выбирается флагом `LLM_PROVIDER`. С `ollama` система работает полностью локально, данные не покидают контур; с `groq` (по умолчанию) запросы уходят в облако.
- **Модульность**: каждый компонент заменяем. LLM-провайдер — любой OpenAI-совместимый endpoint; репозиторий документов оформлен как `Protocol`.
- **Универсальность**: работает с произвольными текстами без привязки к домену; набор типов сущностей редактируется пользователем.
- **Простота развёртывания**: `docker compose up` — и система работает.

### 1.4. Стек технологий

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Backend | Python 3.11 / FastAPI | Экосистема ML, async, автодокументация |
| LLM-клиент | `openai` SDK к OpenAI-совместимому endpoint'у | Groq (по умолчанию) или локальная Ollama — один и тот же код |
| Графовая БД | Neo4j 5 Community Edition | Cypher, зрелая экосистема, open-source |
| Метаданные | SQLite через `aiosqlite` | Персистентное хранилище документов и реестра типов сущностей |
| Frontend | React 18 + TypeScript | Интерактивный UI |
| Визуализация графа | vis.js (vis-network) | Force-directed layout, интерактивность |
| Контейнеризация | Docker + Docker Compose | Простота развёртывания |
| Извлечение текста | PyPDF2, python-docx, chardet | Поддержка PDF, DOCX, TXT |
| Драйвер Neo4j | neo4j (official Python driver, async) | Официальный драйвер, async поддержка |

---

## 2. Цели и задачи системы

### 2.1. Бизнес-цели

1. Предоставить исследователям и аналитикам инструмент для автоматического структурирования знаний из текстовых документов.
2. Дать возможность полностью локального развёртывания (`LLM_PROVIDER=ollama`) — тогда данные не покидают контур пользователя.
3. Снизить порог входа в построение графов знаний — пользователю не нужно знать NLP, Cypher или программирование.
4. Создать самостоятельную альтернативу проприетарным решениям (LlamaIndex + OpenAI, Microsoft GraphRAG): развёртывается одной командой, провайдер LLM выбирается флагом.

### 2.2. Технические цели

1. Сквозной pipeline: текст → триплеты → граф → визуализация → QA.
2. Обработка документа 10 000 слов за разумное время (определяется скоростью LLM-провайдера).
3. Поддержка инкрементального обновления графа (добавление новых документов без перестроения) и переизвлечения всего графа под изменённый набор типов.
4. QA-компонент с точностью генерации корректных Cypher-запросов ≥ 70% на типичных вопросах.

---

## 3. Пользователи и сценарии использования

### 3.1. Целевые пользователи

| Роль | Описание | Ключевая потребность |
|------|----------|---------------------|
| Исследователь | Анализирует научные статьи | Найти скрытые связи между концепциями |
| Корпоративный аналитик | Работает с внутренними документами | Построить базу знаний компании |
| Разработчик | Интегрирует систему в свой pipeline | Использовать API для извлечения триплетов |
| Студент | Изучает предметную область | Визуализировать и исследовать тему |

### 3.2. Пользовательские сценарии (User Stories)

#### US-1: Загрузка документа и построение графа
```
КАК пользователь
Я ХОЧУ загрузить текстовый документ (PDF/DOCX/TXT)
ЧТОБЫ система автоматически извлекла из него сущности и связи 
и построила граф знаний
```

**Acceptance Criteria:**
- Пользователь загружает файл через веб-интерфейс
- Система показывает прогресс обработки (чанки обработаны / всего)
- По завершении отображается граф знаний
- В случае ошибки показывается информативное сообщение

#### US-2: Визуализация и исследование графа
```
КАК пользователь
Я ХОЧУ интерактивно исследовать построенный граф знаний
ЧТОБЫ находить связи между сущностями и понимать структуру знаний
```

**Acceptance Criteria:**
- Граф отображается с физической симуляцией (force-directed layout)
- Можно масштабировать, перетаскивать узлы
- Клик по узлу показывает его свойства и связи
- Работает фильтрация по типам сущностей
- Работает поиск узлов по имени (с автодополнением)
- Узлы разных типов имеют разные цвета

#### US-3: Вопросы к графу на естественном языке
```
КАК пользователь
Я ХОЧУ задать вопрос о содержимом графа на русском или английском языке
ЧТОБЫ получить ответ, основанный на извлечённых знаниях
```

**Acceptance Criteria:**
- Поле ввода для вопроса в веб-интерфейсе
- Система преобразует вопрос в Cypher-запрос
- Отображается и текстовый ответ, и сгенерированный Cypher (для прозрачности)
- При ошибке генерации Cypher срабатывает fallback
- Релевантная часть графа подсвечивается

#### US-4: Добавление нового документа к существующему графу
```
КАК пользователь
Я ХОЧУ добавить ещё один документ к уже построенному графу
ЧТОБЫ обогатить базу знаний новой информацией
```

**Acceptance Criteria:**
- Новые триплеты интегрируются в существующий граф
- Дубликаты не создаются (MERGE-логика)
- Пользователь видит, какие сущности и связи добавлены

#### US-5: Просмотр статистики
```
КАК пользователь
Я ХОЧУ видеть статистику по построенному графу
ЧТОБЫ оценить полноту и качество извлечения
```

**Acceptance Criteria:**
- Количество узлов, рёбер, типов
- Распределение узлов по типам (диаграмма)
- Список обработанных документов с датами
- Топ-10 наиболее связанных узлов

---

## 4. Архитектура системы

### 4.1. Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Compose                        │
│                                                              │
│  ┌──────────┐    ┌──────────────┐    ┌─────────────────┐    │
│  │ Frontend │◄──►│   Backend    │◄──►│     Neo4j       │    │
│  │ React    │    │   FastAPI    │    │  (Bolt: 7687)   │    │
│  │ :3000    │    │   :8000      │    │  (HTTP: 7474)   │    │
│  └──────────┘    └──┬────────┬──┘    └─────────────────┘    │
│                     │        │                              │
│                     ▼        ▼                              │
│           ┌──────────────┐  ┌───────────────────────┐      │
│           │ SQLite       │  │  LLM provider:         │      │
│           │ data/        │  │  Groq (cloud)  ИЛИ     │      │
│           │ anagraph.db  │  │  Ollama :11434 (профиль│      │
│           └──────────────┘  │  compose "ollama")     │      │
│                             └───────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

SQLite хранит документы и реестр типов сущностей (переживают рестарт), Neo4j —
сам граф. LLM-провайдер — внешний Groq или локальный контейнер Ollama
(поднимается под профилем `ollama`); код клиента общий.

### 4.2. Взаимодействие компонентов

```
Пользователь                Frontend              Backend                  LLM                Neo4j
     │                         │                     │                      │                   │
     │── загрузить файл ──────►│                     │                      │                   │
     │                         │── POST /documents ─►│                      │                   │
     │                         │   (доп.: запись в SQLite)                  │                   │
     │                         │                     │── читает файл ──────►│                   │
     │                         │                     │── чанкинг ──────────►│                   │
     │                         │                     │                      │                   │
     │                         │                     │── chat.completions   │                   │
     │                         │                     │   (промпт + чанк) ──►│                   │
     │                         │                     │◄── JSON триплеты ────│                   │
     │                         │                     │                      │                   │
     │                         │                     │── нормализация ─────►│                   │
     │                         │                     │── UNWIND MERGE ──────────────────────────►│
     │                         │                     │                      │                   │
     │                         │── SSE: GET /extraction/{id}/status ────────►│ (опрос pipeline.jobs)
     │◄── обновление UI ──────│◄── progress / complete ──────────────────────│                   │
     │                         │                     │                      │                   │
     │── задать вопрос ───────►│                     │                      │                   │
     │                         │── POST /qa ─────────►│                      │                   │
     │                         │                     │── chat.completions   │                   │
     │                         │                     │   (вопрос→Cypher) ──►│                   │
     │                         │                     │◄── Cypher-запрос ────│                   │
     │                         │                     │── readonly Cypher ───────────────────────►│
     │                         │                     │◄── результат ────────────────────────────│
     │                         │                     │── chat.completions   │                   │
     │                         │                     │   (формирование ──── │                   │
     │                         │                     │    ответа)           │                   │
     │                         │◄── ответ + Cypher ──│                      │                   │
     │◄── отображение ────────│                     │                      │                   │
```

### 4.3. Структура проекта

```
anagraph/
├── docker-compose.yml              # neo4j + backend + frontend (+ ollama под профилем)
├── .env.example
├── PROJECT.md                      # сводный профайл текущего состояния
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app, lifespan (init SQLite, seed типов, индексы Neo4j)
│   ├── settings.py                 # Конфигурация (pydantic-settings, .env из корня репозитория)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── documents.py        # POST/GET/DELETE /documents (+ /documents/text)
│   │   │   ├── graph.py            # /graph, /stats, /clear, /search, /node/*, /types-snapshot, /re-extract
│   │   │   ├── qa.py               # POST /qa
│   │   │   ├── extraction.py       # GET /extraction/{doc_id}/status (SSE)
│   │   │   └── entity_types.py     # CRUD реестра типов сущностей
│   │   └── dependencies.py         # DI: graph, llm, doc repo, entity-type service, pipeline
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── document_service.py     # Извлечение текста из PDF/DOCX/TXT
│   │   ├── chunking_service.py     # Разбиение текста на чанки
│   │   ├── extraction_service.py   # Вызов LLM, парсинг и валидация триплетов
│   │   ├── normalization_service.py # Нормализация, дедупликация (алиасы из config/aliases.json)
│   │   ├── extraction_pipeline.py  # Оркестратор: run() + re_extract_all(), прогресс в памяти
│   │   ├── graph_service.py        # Запись/чтение Neo4j
│   │   ├── qa_service.py           # Text-to-Cypher + формирование ответа
│   │   ├── llm_client.py           # Protocol + OpenAICompatibleLLMClient (Groq/Ollama)
│   │   ├── document_repository.py  # Protocol + SqliteDocumentRepository (+ InMemory запасной)
│   │   ├── entity_type_service.py  # Реестр типов сущностей в SQLite (CRUD, дефолты)
│   │   └── storage.py              # DDL-схема SQLite + init_database()
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── triplet.py              # Pydantic: Triplet, ExtractionResult
│   │   ├── document.py             # Pydantic: Document, Chunk
│   │   ├── graph.py                # Pydantic: Node, Edge, GraphData, GraphStats
│   │   ├── qa.py                   # Pydantic: QARequest, QAResponse
│   │   └── entity_type.py          # Pydantic: EntityType, EntityTypeCreate, EntityTypeUpdate
│   │
│   ├── prompts/
│   │   ├── extraction_ru.txt       # Промпт извлечения (русский)
│   │   ├── extraction_en.txt       # Промпт извлечения (английский)
│   │   ├── text_to_cypher.txt      # Промпт Text-to-Cypher
│   │   └── answer_generation.txt   # Промпт формирования ответа
│   │
│   ├── config/
│   │   └── aliases.json            # Алиасы сущностей и предикатов
│   │
│   └── tests/
│       ├── test_chunking.py
│       ├── test_extraction.py
│       ├── test_normalization.py
│       └── conftest.py             # Фикстуры: MockLLMClient
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   │
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── api/
│       │   └── client.ts           # Axios-обёртки + SSE для backend API
│       ├── components/
│       │   ├── DocumentUpload.tsx   # Форма загрузки документа (текст/файл/dnd)
│       │   ├── DocumentList.tsx     # Список документов с polling
│       │   ├── GraphViewer.tsx      # vis.js визуализация
│       │   ├── NodeDetails.tsx      # Панель свойств узла + удаление узла
│       │   ├── FilterPanel.tsx      # Фильтрация по типам + orphan-типы
│       │   ├── EntityTypesPanel.tsx # CRUD реестра типов + переизвлечение графа
│       │   ├── SearchBar.tsx        # Поиск узлов
│       │   ├── QAPanel.tsx          # Вопрос-ответ интерфейс + история
│       │   ├── StatsPanel.tsx       # Статистика графа
│       │   └── Toast.tsx            # ToastProvider + useToast
│       ├── hooks/
│       │   └── useEntityTypes.ts    # react-query над реестром типов
│       ├── utils/
│       │   ├── time.ts              # formatRelative
│       │   └── useLocalStorage.ts   # versioned wrapper (история QA)
│       └── types/
│           └── index.ts             # TypeScript типы
│
└── scripts/
    └── seed_example.py              # Загрузка примера для демонстрации
```

---

## 5. Компоненты системы

### 5.1. Backend (FastAPI)

#### 5.1.1. Точка входа (`main.py`)

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.dependencies import get_entity_type_service, get_graph_service
from api.routes import documents, entity_types, graph, qa, extraction
from services.storage import init_database
from settings import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_database(settings.database_path)            # схема SQLite
    await get_entity_type_service().ensure_initialized()   # сид реестра типов
    graph_service = get_graph_service()
    await graph_service.create_indexes()                   # индексы Neo4j
    yield
    await graph_service.close()

app = FastAPI(
    title="Anagraph API",
    description="Knowledge Graph Builder from unstructured text",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
app.include_router(qa.router, prefix="/api/qa", tags=["qa"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["extraction"])
app.include_router(entity_types.router, prefix="/api/entity-types", tags=["entity-types"])
```

#### 5.1.2. Конфигурация (`settings.py`)

```python
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Neo4j
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"

    # LLM provider: "groq" | "ollama"
    llm_provider: str = "groq"

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1:8b"

    # Extraction
    chunk_size: int = 1200          # токенов
    chunk_overlap: int = 150        # токенов
    max_retries: int = 3            # повторных попыток при невалидном JSON
    extraction_temperature: float = 0.1

    # QA
    qa_temperature: float = 0.0
    qa_max_tokens: int = 1024
    cypher_fallback_enabled: bool = True

    # Normalization
    similarity_threshold: float = 0.85  # порог для дедупликации

    # SQLite (документы + реестр типов сущностей)
    database_path: str = "data/anagraph.db"

    allowed_origins: list[str] = ["http://localhost:3000"]

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        extra = "ignore"

settings = Settings()
```

> Файл называется `settings.py` (не `config.py`), `.env` читается из корня
> репозитория. Набор типов сущностей в `settings` больше не хранится — это
> отдельный персистентный реестр в SQLite (см. §5.4 и §6.4), который пользователь
> редактирует через UI/API.

### 5.2. LLM Client (`llm_client.py`)

`LLMClient` — это `typing.Protocol`; единственная реализация `OpenAICompatibleLLMClient`
работает с любым OpenAI-совместимым endpoint'ом (Groq, Ollama, vLLM и т.п.).
Конкретный провайдер выбирается в `dependencies.py` по `settings.llm_provider`.

```python
from typing import Protocol, runtime_checkable
from openai import AsyncOpenAI

@runtime_checkable
class LLMClient(Protocol):
    async def generate(
        self, prompt: str, system: str = "", temperature: float = 0.1,
        max_tokens: int = 4096, response_format: str = "json",
    ) -> str: ...
    async def close(self) -> None: ...


class OpenAICompatibleLLMClient:
    """Универсальный клиент для любых OpenAI-совместимых endpoint'ов."""

    def __init__(self, api_key: str, base_url: str, model: str):
        self.model = model
        self.client = AsyncOpenAI(api_key=api_key or "not-needed", base_url=base_url)

    async def generate(
        self, prompt: str, system: str = "", temperature: float = 0.1,
        max_tokens: int = 4096, response_format: str = "json",
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "model": self.model, "messages": messages,
            "temperature": temperature, "max_tokens": max_tokens,
        }
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    async def close(self) -> None:
        await self.client.close()
```

**Ключевое решение:** один и тот же код обслуживает облачный Groq и локальную
Ollama — оба предоставляют OpenAI-совместимый `chat.completions`. На извлечении
запрос идёт в JSON-mode (`response_format={"type": "json_object"}`), что заставляет
модель генерировать валидный JSON и упрощает парсинг триплетов; для text-to-Cypher
и генерации ответа используется обычный текстовый режим.

### 5.3. Neo4j Service (`graph_service.py`)

```python
import re
from neo4j import AsyncGraphDatabase
from models.triplet import Triplet
from models.graph import Node, Edge, GraphData, GraphStats

class GraphService:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = AsyncGraphDatabase.driver(uri, auth=(user, password))

    async def create_indexes(self):
        """Индексы создаются на старте приложения (lifespan)."""
        async with self.driver.session() as session:
            await session.run("CREATE FULLTEXT INDEX entityNameIndex IF NOT EXISTS "
                              "FOR (n:Entity) ON EACH [n.name]")
            await session.run("CREATE INDEX entityNameIdx IF NOT EXISTS "
                              "FOR (n:Entity) ON (n.name)")
            await session.run("CREATE INDEX entityTypeIdx IF NOT EXISTS "
                              "FOR (n:Entity) ON (n.type)")

    async def save_triplets(self, triplets: list[Triplet], source_id: str):
        """Батчевое сохранение: один UNWIND + MERGE на все триплеты."""
        if not triplets:
            return
        query = """
        UNWIND $triplets AS t
        MERGE (s:Entity {name: t.subject_name})
        ON CREATE SET s.type = t.subject_type, s.created_at = datetime()
        ON MATCH SET s.type = COALESCE(s.type, t.subject_type)
        MERGE (o:Entity {name: t.object_name})
        ON CREATE SET o.type = t.object_type, o.created_at = datetime()
        ON MATCH SET o.type = COALESCE(o.type, t.object_type)
        MERGE (s)-[r:RELATES {type: t.predicate}]->(o)
        ON CREATE SET r.source = $source, r.context = t.context,
                      r.confidence = t.confidence, r.created_at = datetime()
        """
        async with self.driver.session() as session:
            await session.run(query, {"triplets": [...], "source": source_id})
        # Динамические labels — отдельными запросами (Neo4j не умеет dynamic
        # labels внутри UNWIND); имя типа санитизируется регуляркой.
        for t in triplets:
            ...  # MATCH (n:Entity {name: $name}) SET n:`<sanitized_type>`

    # get_all_nodes(limit, types_filter) / get_all_edges(limit) / get_graph()
    #   -> возвращают Pydantic-модели Node/Edge/GraphData; id узлов и рёбер —
    #      строковый elementId(); у узла также отдаётся created_at.
    # get_stats(documents_processed) -> GraphStats
    # search_nodes(query, limit) -> fulltext-поиск по entityNameIndex (fuzzy '~')
    # get_node_neighborhood(name, depth) -> GraphData (узлы + рёбра соседства)
    # execute_cypher_readonly(cypher) -> прогоняет _validate_readonly() и
    #   выполняет запрос (используется QA)
    # delete_node_by_name(name) -> DETACH DELETE узла, bool «найден ли»
    # delete_by_source(source_id) -> удаляет рёбра документа + осиротевшие узлы
    # clear_all() -> MATCH (n) DETACH DELETE n

    async def close(self):
        await self.driver.close()


_FORBIDDEN = re.compile(
    r'\b(CREATE|DELETE|DETACH|SET|REMOVE|MERGE|DROP|CALL\s+dbms)\b', re.IGNORECASE)

def _validate_readonly(cypher: str):
    if _FORBIDDEN.search(cypher):
        raise ValueError("Only read-only Cypher queries are allowed")
```

**Ключевые решения**:
- Единый label `Entity` + свойство `type` + дополнительный label по типу — гибкость произвольных типов и производительность индексов.
- Все триплеты чанка пишутся одним `UNWIND ... MERGE` (а не по одному на запрос).
- `id` узлов и рёбер в API — строковый `elementId()` Neo4j.
- Пользовательский Cypher из QA проходит проверку `_validate_readonly` по чёрному списку ключевых слов.

### 5.4. Хранилище метаданных (SQLite)

Документы и реестр типов сущностей хранятся в SQLite (`data/anagraph.db`, доступ
через `aiosqlite`). Схема создаётся на старте (`services/storage.py:init_database`,
`CREATE TABLE IF NOT EXISTS` — без отдельных миграций):

- Таблица `documents` — поля документа (см. §6.1), включая `source_path`,
  `raw_text`, `language`, `used_type_names` (JSON-снапшот реестра типов на момент
  загрузки) — нужны для переизвлечения графа.
- Таблица `entity_types` — реестр типов сущностей.

`DocumentRepository` оформлен как `Protocol` с двумя реализациями:
`SqliteDocumentRepository` (используется) и `InMemoryDocumentRepository` (запасная).
Благодаря этому хранилище заменяемо (например, на Postgres) без правок остального кода.

> **Изменение относительно исходного ТЗ**: документы больше не живут только в
> памяти процесса — они персистентны и переживают рестарт backend. В памяти
> остаётся лишь состояние фоновых задач (`ExtractionPipeline.jobs`,
> `re_extract_job`).

### 5.5. Реестр типов сущностей (`entity_type_service.py`)

`EntityTypeService` управляет таблицей `entity_types`. Каждый тип:
`name` (латинский идентификатор), `label` (отображаемое имя), `color` (hex),
`description` (краткое определение — подставляется в промпт извлечения),
`visible` (флаг фильтра в UI), `is_default`, `position`.

- При первом старте реестр сидится стандартным набором: `Person, Organization,
  Technology, Concept, Location, Date, Event, Product` + зарезервированный тип
  `Other` (fallback для неклассифицируемых сущностей; удалить нельзя).
- CRUD-операции с валидацией (имя — латиница/цифры/`_`, цвет — `#rrggbb`,
  ограничения длины), автоподбор цвета из палитры, `reset_to_defaults()`.
- Реестр — глобальный: при загрузке документа используется его текущее состояние,
  а не список типов из запроса. Изменения применяются к новым документам;
  чтобы пересобрать весь граф под новый набор — используется переизвлечение (§7.5).

---

## 6. Модели данных

### 6.1. Pydantic-модели (Backend)

```python
# models/triplet.py
from pydantic import BaseModel

class Triplet(BaseModel):
    subject: str
    subject_type: str = "Concept"
    predicate: str
    object: str
    object_type: str = "Concept"
    context: str = ""            # предложение-источник из чанка
    confidence: float = 1.0      # оценка достоверности

class ExtractionResult(BaseModel):
    triplets: list[Triplet]
    chunk_index: int
    total_chunks: int
    raw_text: str                # исходный чанк


# models/document.py
from datetime import datetime
from pydantic import BaseModel

class Chunk(BaseModel):
    index: int
    text: str
    start_char: int
    end_char: int

class Document(BaseModel):
    id: str
    filename: str
    text_length: int
    num_chunks: int
    status: str                  # "pending" | "processing" | "completed" | "error"
    created_at: datetime
    triplets_extracted: int = 0
    error_message: str | None = None
    source_path: str | None = None      # путь к загруженному файлу
    raw_text: str | None = None         # текст для документов из вставленного текста
    language: str | None = None
    used_type_names: list[str] | None = None  # снапшот реестра типов при загрузке


# models/graph.py — id узлов и рёбер строковые (elementId Neo4j)
from pydantic import BaseModel

class Node(BaseModel):
    id: str
    name: str
    type: str
    connections: int
    created_at: str | None = None

class Edge(BaseModel):
    id: str
    source: str
    target: str
    type: str
    context: str | None = None

class GraphData(BaseModel):
    nodes: list[Node]
    edges: list[Edge]

class GraphStats(BaseModel):
    total_nodes: int
    total_edges: int
    types_distribution: list[dict]
    top_connected: list[dict]
    documents_processed: int


# models/qa.py
from pydantic import BaseModel

class QARequest(BaseModel):
    question: str
    language: str = "auto"       # "auto" | "ru" | "en"

class QAResponse(BaseModel):
    answer: str
    cypher_query: str            # для прозрачности
    raw_results: list[dict]      # сырые данные из Neo4j
    method: str                  # "text_to_cypher" | "fallback" | "error"


# models/entity_type.py
from pydantic import BaseModel

class EntityType(BaseModel):
    name: str
    label: str
    color: str
    description: str = ""
    visible: bool = True
    is_default: bool = False
    position: int = 0

class EntityTypeCreate(BaseModel):
    name: str
    label: str | None = None
    description: str | None = None
    color: str | None = None

class EntityTypeUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None
    visible: bool | None = None
    position: int | None = None
```

### 6.2. Модель данных Neo4j

```
(:Entity {
    name: String,        // уникальное каноническое имя (MERGE по name)
    type: String,        // "Person", "Organization", "Technology", ...
    created_at: DateTime
})
// + динамический label по типу: :Person, :Organization, ...

-[:RELATES {
    type: String,        // нормализованный предикат
    source: String,      // ID документа-источника
    context: String,     // предложение-источник из чанка (до 400 символов)
    confidence: Float,   // 0.0 - 1.0
    created_at: DateTime
}]->
```

**Индексы** (создаются на старте, см. `GraphService.create_indexes`):
```cypher
-- Полнотекстовый поиск по имени
CREATE FULLTEXT INDEX entityNameIndex IF NOT EXISTS
FOR (n:Entity) ON EACH [n.name];

-- B-tree по имени (быстрый MERGE/поиск)
CREATE INDEX entityNameIdx IF NOT EXISTS
FOR (n:Entity) ON (n.name);

-- Индекс по типу
CREATE INDEX entityTypeIdx IF NOT EXISTS
FOR (n:Entity) ON (n.type);
```

> Уникальность имени обеспечивается семантикой `MERGE (e:Entity {name: ...})`,
> а не отдельным `CONSTRAINT`.

### 6.3. TypeScript типы (Frontend)

```typescript
// types/index.ts

export interface GraphNode {
  id: string;            // elementId Neo4j
  name: string;
  type: string;
  connections: number;
  created_at?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  context?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Document {
  id: string;
  filename: string;
  text_length: number;
  num_chunks: number;
  status: "pending" | "processing" | "completed" | "error";
  created_at: string;
  triplets_extracted: number;
  error_message?: string | null;
  language?: string | null;
  used_type_names?: string[] | null;
}

export interface QAResponse {
  answer: string;
  cypher_query: string;
  raw_results: Record<string, unknown>[];
  method: string;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  types_distribution: { type: string; count: number }[];
  top_connected: { name: string; type: string; connections: number }[];
  documents_processed: number;
}

export interface EntityType {
  name: string;
  label: string;
  color: string;
  description: string;
  visible: boolean;
  is_default: boolean;
  position: number;
}

export const ORPHAN_TYPE_COLOR = "#585b70";  // тип есть в графе, но не в реестре
export const OTHER_TYPE_NAME = "Other";
```

> Цвета типов больше не зашиты в `types/index.ts` константой — они приходят из
> реестра типов (`EntityType.color`) и читаются через хук `useEntityTypes`.

---

## 7. Pipeline извлечения знаний

### 7.1. Этап 1: Извлечение текста из документа

```python
# services/document_service.py

import chardet
from PyPDF2 import PdfReader
from docx import Document as DocxDocument

class DocumentService:
    
    @staticmethod
    def extract_text(file_path: str, filename: str) -> str:
        ext = filename.lower().rsplit(".", 1)[-1]
        
        if ext == "txt":
            with open(file_path, "rb") as f:
                raw = f.read()
                encoding = chardet.detect(raw)["encoding"] or "utf-8"
                return raw.decode(encoding)
        
        elif ext == "pdf":
            reader = PdfReader(file_path)
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        
        elif ext in ("docx", "doc"):
            doc = DocxDocument(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        
        else:
            raise ValueError(f"Unsupported file format: {ext}")
```

### 7.2. Этап 2: Чанкинг

```python
# services/chunking_service.py

from models.document import Chunk

class ChunkingService:
    
    def __init__(self, chunk_size: int = 1200, overlap: int = 150):
        self.chunk_size = chunk_size
        self.overlap = overlap
    
    def split(self, text: str) -> list[Chunk]:
        """
        Разбиение текста на чанки с перекрытием.
        
        Стратегия: разбиваем по предложениям, накапливаем до chunk_size,
        затем откатываемся на overlap токенов для следующего чанка.
        
        Упрощение: считаем 1 токен ≈ 4 символа (для русского/английского текста).
        """
        sentences = self._split_sentences(text)
        chunks = []
        current_sentences = []
        current_length = 0
        char_offset = 0
        
        for sentence in sentences:
            sentence_tokens = len(sentence) // 4  # приблизительная токенизация
            
            if current_length + sentence_tokens > self.chunk_size and current_sentences:
                chunk_text = " ".join(current_sentences)
                chunks.append(Chunk(
                    index=len(chunks),
                    text=chunk_text,
                    start_char=char_offset,
                    end_char=char_offset + len(chunk_text),
                ))
                
                # Overlap: оставляем последние N токенов
                overlap_sentences = []
                overlap_length = 0
                for s in reversed(current_sentences):
                    s_tokens = len(s) // 4
                    if overlap_length + s_tokens > self.overlap:
                        break
                    overlap_sentences.insert(0, s)
                    overlap_length += s_tokens
                
                char_offset += len(chunk_text) - len(" ".join(overlap_sentences))
                current_sentences = overlap_sentences
                current_length = overlap_length
            
            current_sentences.append(sentence)
            current_length += sentence_tokens
        
        # Последний чанк
        if current_sentences:
            chunk_text = " ".join(current_sentences)
            chunks.append(Chunk(
                index=len(chunks),
                text=chunk_text,
                start_char=char_offset,
                end_char=char_offset + len(chunk_text),
            ))
        
        return chunks
    
    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Разбиение текста на предложения (простая эвристика)."""
        import re
        sentences = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in sentences if s.strip()]
```

**Компромисс**: используем приблизительную токенизацию (1 токен ≈ 4 символа) вместо точной (tiktoken), чтобы не добавлять зависимость. Для наших целей точность не критична — ±10% не влияет на качество извлечения.

### 7.3. Этап 3: Извлечение триплетов через LLM

Промпты (`prompts/extraction_ru.txt` / `extraction_en.txt`) — детальные:
помимо базовых правил они содержат раздел «обязательно извлекать», примеры
правильных и **неправильных** триплетов (объект-описание вместо сущности),
примеры извлечения из перечислений и из одного предложения. Шаблон содержит
плейсхолдеры, которые `ExtractionService` подставляет из реестра типов:
`{text}`, `{entity_types}` (список имён типов), `{type_definitions}` (строки
`name — description`) и `{example_type}`.

#### 7.3.1. Промпт для извлечения (русский, сокращённо)

```
# prompts/extraction_ru.txt

Ты — система извлечения знаний. Твоя задача — прочитать текст и извлечь из него
наиболее значимые сущности и отношения между ними.

Правила:
1. Извлекай только факты, явно присутствующие в тексте. НЕ додумывай.
2. Каждый триплет: (субъект, предикат, объект). Субъект — кто/что действует.
   НЕ инвертируй направление.
3. Имя сущности — собственное имя, аббревиатура или термин из 1–3 слов.
4. Нормализуй имена; для организаций используй наиболее общую форму.
5. Предикаты — глаголы или краткие фразы.
... (раздел «обязательно извлекать», примеры правильных/неправильных триплетов,
    примеры извлечения из перечислений) ...

Типизируй каждую сущность одним из типов: {entity_types}.
Краткие определения типов:
{type_definitions}
Если ни один тип объективно не подходит — используй Other.

Формат ответа (JSON):
{
  "triplets": [
    { "subject": "имя_сущности", "subject_type": "{example_type}",
      "predicate": "отношение",
      "object": "имя_другой_сущности", "object_type": "{example_type}" }
  ]
}

Текст для анализа:
{text}
```

#### 7.3.2. Промпт для извлечения (английский)

`prompts/extraction_en.txt` — точная калька RU-промпта на английском, с теми же
плейсхолдерами `{text}`, `{entity_types}`, `{type_definitions}`, `{example_type}`.

#### 7.3.3. Сервис извлечения

```python
# services/extraction_service.py

import json
from models.entity_type import EntityType
from models.triplet import Triplet, ExtractionResult
from services.entity_type_service import OTHER_TYPE_NAME, get_default_types
from services.llm_client import LLMClient
from settings import settings

class ExtractionService:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.prompt_ru = (PROMPTS_DIR / "extraction_ru.txt").read_text()
        self.prompt_en = (PROMPTS_DIR / "extraction_en.txt").read_text()

    async def extract_from_chunk(
        self,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
        language: str = "ru",
        entity_types: list[EntityType] | None = None,
    ) -> ExtractionResult:
        """Извлечение триплетов из одного чанка."""
        # Реестр типов (+ всегда добавляется Other) подставляется в промпт.
        types = _ensure_other(entity_types or get_default_types())
        allowed_names = {t.name for t in types}

        template = self.prompt_ru if language == "ru" else self.prompt_en
        prompt = (
            template
            .replace("{text}", chunk_text)
            .replace("{entity_types}", ", ".join(t.name for t in types))
            .replace("{type_definitions}", _build_definitions(types))
            .replace("{example_type}", _pick_example_type(types))
        )

        for attempt in range(settings.max_retries):
            try:
                raw_response = await self.llm.generate(
                    prompt=prompt,
                    temperature=settings.extraction_temperature,
                    response_format="json",
                )
                data = json.loads(raw_response)
                triplets = []
                for t in data.get("triplets", []):
                    if not (t.get("subject") and t.get("predicate") and t.get("object")):
                        continue
                    subj, obj = t["subject"].strip(), t["object"].strip()
                    subj_type = (t.get("subject_type") or OTHER_TYPE_NAME).strip()
                    obj_type = (t.get("object_type") or OTHER_TYPE_NAME).strip()
                    # Тип, которого нет в реестре, заменяется на Other.
                    if subj_type not in allowed_names: subj_type = OTHER_TYPE_NAME
                    if obj_type not in allowed_names: obj_type = OTHER_TYPE_NAME
                    triplets.append(Triplet(
                        subject=subj, subject_type=subj_type,
                        predicate=t["predicate"].strip(),
                        object=obj, object_type=obj_type,
                        # context — предложение чанка, где встретились субъект и объект
                        context=_find_context(chunk_text, subj, obj),
                    ))
                return ExtractionResult(
                    triplets=triplets, chunk_index=chunk_index,
                    total_chunks=total_chunks, raw_text=chunk_text,
                )
            except (json.JSONDecodeError, KeyError):
                if attempt == settings.max_retries - 1:
                    return ExtractionResult(
                        triplets=[], chunk_index=chunk_index,
                        total_chunks=total_chunks, raw_text=chunk_text,
                    )
                continue  # Повторная попытка
```

Отличия от исходного ТЗ: в промпт подставляется актуальный **реестр типов**
(с определениями); типы из ответа LLM валидируются по реестру и при несовпадении
заменяются на `Other`; `context` — это предложение чанка, содержащее субъект и
объект (а не первые N символов чанка).

### 7.4. Этап 4: Нормализация и дедупликация

Словари алиасов вынесены из кода в `backend/config/aliases.json`
(`entity_aliases` и `predicate_aliases`) и загружаются в конструкторе.

```python
# services/normalization_service.py

import json
from difflib import SequenceMatcher
from pathlib import Path
from models.triplet import Triplet
from settings import settings

ALIASES_PATH = Path(__file__).parent.parent / "config" / "aliases.json"

class NormalizationService:

    def __init__(self):
        data = json.loads(ALIASES_PATH.read_text())
        self.entity_aliases: dict[str, str] = data.get("entity_aliases", {})
        self.predicate_aliases: dict[str, str] = data.get("predicate_aliases", {})

    def normalize_triplets(self, triplets: list[Triplet]) -> list[Triplet]:
        """Полный цикл нормализации."""
        triplets = [self._normalize_entity_names(t) for t in triplets]
        triplets = [self._normalize_predicate(t) for t in triplets]
        triplets = self._deduplicate(triplets)
        triplets = self._merge_similar_entities(triplets)
        return triplets
    
    def _normalize_entity_names(self, triplet: Triplet) -> Triplet:
        """Нормализация имён сущностей по entity_aliases."""
        subject = self.entity_aliases.get(triplet.subject.lower(), triplet.subject).strip()
        obj = self.entity_aliases.get(triplet.object.lower(), triplet.object).strip()
        return triplet.model_copy(update={"subject": subject, "object": obj})

    def _normalize_predicate(self, triplet: Triplet) -> Triplet:
        """Нормализация предикатов по predicate_aliases."""
        pred = triplet.predicate.lower().strip()
        normalized = self.predicate_aliases.get(pred, pred)
        return triplet.model_copy(update={"predicate": normalized})
    
    def _deduplicate(self, triplets: list[Triplet]) -> list[Triplet]:
        """Удаление точных дубликатов."""
        seen = set()
        unique = []
        for t in triplets:
            key = (t.subject.lower(), t.predicate.lower(), t.object.lower())
            if key not in seen:
                seen.add(key)
                unique.append(t)
        return unique
    
    def _merge_similar_entities(self, triplets: list[Triplet]) -> list[Triplet]:
        """Объединение похожих сущностей (fuzzy matching)."""
        # Собираем все уникальные имена
        all_names = set()
        for t in triplets:
            all_names.add(t.subject)
            all_names.add(t.object)
        
        # Строим маппинг name → canonical_name
        canonical = {}
        sorted_names = sorted(all_names)
        
        for i, name1 in enumerate(sorted_names):
            if name1 in canonical:
                continue
            canonical[name1] = name1
            for name2 in sorted_names[i+1:]:
                if name2 in canonical:
                    continue
                similarity = SequenceMatcher(
                    None, name1.lower(), name2.lower()
                ).ratio()
                if similarity >= settings.similarity_threshold:
                    # Выбираем более длинное имя как каноническое
                    canon = name1 if len(name1) >= len(name2) else name2
                    canonical[name1] = canon
                    canonical[name2] = canon
        
        # Применяем маппинг
        result = []
        for t in triplets:
            result.append(t.model_copy(update={
                "subject": canonical.get(t.subject, t.subject),
                "object": canonical.get(t.object, t.object),
            }))
        
        # Повторная дедупликация после merge
        return self._deduplicate(result)
```

> В реальной реализации решение о слиянии принимает `_should_merge`: помимо
> порога `SequenceMatcher` есть спец-правило для пар `Organization`/`Organization` —
> совпадение первого слова длиной ≥ 3 символа (например, «Yandex Self-Driving» →
> «Yandex»). Каноническим выбирается более длинное имя.

**Компромисс**: для MVP используем строковое сходство (SequenceMatcher). В будущем можно добавить сравнение эмбеддингов или повторный вызов LLM для сложных случаев кореференции.

### 7.5. Оркестрация и переизвлечение

Этапы 1–4 (для одного документа) связывает `ExtractionPipeline.run`: чанкинг →
для каждого чанка извлечение → нормализация → запись в Neo4j; прогресс пишется в
`ExtractionPipeline.jobs[doc_id]` (`ExtractionJobState`, живёт в памяти процесса)
и отдаётся фронтенду по SSE. Документ переводится в статусы
`pending → processing → completed`/`error` (статус и `error_message`
сохраняются в SQLite). Чанки обрабатываются **последовательно**.

`ExtractionPipeline.re_extract_all` пересобирает **весь граф** под текущий реестр
типов: очищает граф (`MATCH (n) DETACH DELETE n`), затем для каждого документа,
у которого доступен источник (`raw_text` или `source_path`), заново берёт текст
и прогоняет `run(...)` с актуальными типами, обновляя `used_type_names`.
Прогресс — `ReExtractJobState` (текущий документ, чанк, всего документов,
триплетов, список ошибок), также по SSE. Повторный запуск во время работы
отклоняется (`409`). Эндпоинт `GET /api/graph/types-snapshot` отдельно сверяет
`used_type_names` завершённых документов с текущим реестром и помечает
«устаревшие» документы — UI показывает по нему предупреждение.

---

## 8. QA-компонент (Text-to-Cypher)

### 8.1. Архитектура QA

```
Вопрос пользователя
        │
        ▼
┌───────────────────┐
│  Определение языка │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌──────────────────────┐
│  Text-to-Cypher   │────►│  _validate_readonly  │
│  (LLM генерирует  │     │  (чёрный список      │
│   Cypher-запрос)  │     │   ключевых слов)     │
└───────────────────┘     └────────┬─────────────┘
                                   │ ok / выполнился без ошибок
                                   │ и вернул непустой результат?
                          ┌────────┴─────────┐
                          │ Да               │ Нет
                          ▼                  ▼
                   ┌──────────┐     ┌──────────────┐
                   │ Выполнить│     │  Fallback:   │
                   │ в Neo4j  │     │  эвристики + │
                   └────┬─────┘     │  шаблоны     │
                        │           └──────┬───────┘
                        │                  │
                        ▼                  ▼
                   ┌──────────────────────────┐
                   │  Формирование ответа     │
                   │  (LLM на основе данных)  │
                   └──────────────────────────┘
                              │
                              ▼
                        Ответ + Cypher
```

> На практике fallback срабатывает не только при ошибке валидации/выполнения, но и
> когда сгенерированный Cypher отработал, но вернул пустой результат.

### 8.2. Промпт Text-to-Cypher

`prompts/text_to_cypher.txt` (в репозитории — на английском; смысл приведён ниже).
Промпт описывает схему графа (`:Entity {name, type}`, `:RELATES {type}`), правила
(`MATCH`, `toLower()` для регистронезависимого сравнения, `CONTAINS` для нечёткого
поиска, `LIMIT 25`, «верни ТОЛЬКО Cypher») и несколько примеров «вопрос → Cypher».
Единственный плейсхолдер — `{question}`. Запрос к LLM идёт в текстовом режиме
(`temperature=0.0`); из ответа срезаются markdown-ограждения ```` ``` ````.

```
You are an assistant that converts natural language questions into Cypher queries for Neo4j.

Graph schema:
- Nodes have label :Entity and properties: name (String), type (String)
- Edges have type :RELATES and property type (String)

Rules: use MATCH; toLower() for case-insensitive comparison; CONTAINS for fuzzy
matching; always RETURN meaningful fields; add LIMIT 25; return ONLY the Cypher query.

Examples:
Question: "What did Google develop?"
Cypher: MATCH (s:Entity)-[r:RELATES]->(o:Entity) WHERE toLower(s.name) CONTAINS 'google' AND toLower(r.type) CONTAINS 'develop' RETURN s.name AS subject, r.type AS relation, o.name AS object LIMIT 25
...

Question: {question}
Cypher:
```

### 8.3. Промпт формирования ответа

`prompts/answer_generation.txt` (в репозитории — на английском). Плейсхолдеры
`{question}` и `{results}` (первые 20 строк результата в JSON). Смысл правил:

```
Based on the knowledge graph data, formulate a clear answer to the user's question.

Question: {question}
Data from the graph (Cypher query result):
{results}

Rules:
1. Answer in the same language as the question.
2. If there is no relevant data, say so honestly.
3. Be concise and informative.
4. List specific facts from the data.
```

### 8.4. Fallback-механизм

`QAService._fallback_query` сначала пробует эвристики по ключевым словам вопроса
(`person/people/человек/люди → Person`, `organization/company/организаци/компани →
Organization`, `technology/технолог → Technology`) с шаблоном `all_of_type`; если
не сработало — берёт из вопроса слова длиной > 3 символов и для каждого пробует
`connections_of`. Шаблоны:

```python
# Шаблонные запросы для типичных паттернов вопросов

FALLBACK_TEMPLATES = {
    "all_of_type": """
        MATCH (n:Entity) WHERE n.type = $type
        RETURN n.name AS name LIMIT 25
    """,
    "connections_of": """
        MATCH (n:Entity)-[r:RELATES]-(m:Entity)
        WHERE toLower(n.name) CONTAINS toLower($name)
        RETURN n.name AS source, r.type AS relation, m.name AS target LIMIT 25
    """,
    "path_between": """
        MATCH path = shortestPath(
            (a:Entity)-[*..5]-(b:Entity)
        )
        WHERE toLower(a.name) CONTAINS toLower($name1)
        AND toLower(b.name) CONTAINS toLower($name2)
        RETURN [n IN nodes(path) | n.name] AS path_nodes,
               [r IN relationships(path) | r.type] AS path_relations
        LIMIT 5
    """,
}
```

---

## 9. API спецификация

### 9.1. Документы

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `POST` | `/api/documents` | Загрузка файла (multipart/form-data) |
| `POST` | `/api/documents/text` | Загрузка вставленного текста (JSON) |
| `GET` | `/api/documents` | Список загруженных документов |
| `GET` | `/api/documents/{id}` | Детали конкретного документа |
| `DELETE` | `/api/documents/{id}` | Удаление документа, его рёбер в Neo4j, осиротевших узлов и файла |

#### POST /api/documents

```
Request: multipart/form-data
  - file: File (PDF, DOCX, TXT)
  - language: string ("ru" | "en" | "auto"), default "auto"

Response 202:
{
  "id": "doc_abc123",
  "filename": "article.pdf",
  "status": "processing"
}
```

> Набор типов сущностей в запросе **не передаётся** — используется текущий
> глобальный реестр (§9.5), снапшот которого сохраняется в документе.
> `POST /api/documents/text` принимает JSON `{text, language?}` и создаёт
> «документ» с filename `[pasted text]`. В ответах списка/деталей поля
> `raw_text` и `source_path` исключены.

### 9.2. Извлечение

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/api/extraction/{doc_id}/status` | Прогресс извлечения документа (SSE) |

#### GET /api/extraction/{doc_id}/status (Server-Sent Events)

```
event: progress
data: {"chunk": 3, "total": 12, "triplets_so_far": 27}

event: progress
data: {"chunk": 4, "total": 12, "triplets_so_far": 35}

...

event: complete
data: {"total_triplets": 89, "total_chunks": 12}
```

### 9.3. Граф

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/api/graph` | Узлы и рёбра (с лимитом и фильтром по типам) |
| `GET` | `/api/graph/stats` | Статистика графа |
| `DELETE` | `/api/graph/clear` | Полная очистка графа + удаление всех документов |
| `GET` | `/api/graph/search?q=...` | Полнотекстовый поиск узлов |
| `GET` | `/api/graph/node/{name}/neighbors?depth=1` | Соседство узла (узлы + рёбра), depth 1..3 |
| `DELETE` | `/api/graph/node/{name}` | Удалить узел и его рёбра (404, если не найден) |
| `GET` | `/api/graph/types-snapshot` | Проверка согласованности `used_type_names` с реестром |
| `POST` | `/api/graph/re-extract` | Запуск переизвлечения всего графа (202; 409, если уже идёт) |
| `GET` | `/api/graph/re-extract/status` | Прогресс переизвлечения (SSE) |

#### GET /api/graph

```
Query params:
  - limit: int (default 500, 1..2000)
  - types: string[] (фильтр по типам)

Response 200:
{
  "nodes": [
    {"id": "4:abc:1", "name": "Google", "type": "Organization",
     "connections": 15, "created_at": "2026-05-14T..."},
    {"id": "4:abc:2", "name": "BERT", "type": "Technology",
     "connections": 8, "created_at": "2026-05-14T..."}
  ],
  "edges": [
    {"id": "5:abc:0", "source": "4:abc:1", "target": "4:abc:2",
     "type": "разработала", "context": "..."}
  ]
}
```

> `id`, `source`, `target` — строковые `elementId()` Neo4j.

### 9.4. QA

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `POST` | `/api/qa` | Задать вопрос к графу |

#### POST /api/qa

```
Request:
{
  "question": "Что разработала компания Google?",
  "language": "auto"
}

Response 200:
{
  "answer": "Согласно данным графа знаний, компания Google разработала следующие технологии: BERT, TensorFlow, Transformer.",
  "cypher_query": "MATCH (s:Entity)-[r:RELATES]->(o:Entity) WHERE toLower(s.name) CONTAINS 'google' AND toLower(r.type) CONTAINS 'разработал' RETURN s.name, r.type, o.name LIMIT 25",
  "raw_results": [...],
  "method": "text_to_cypher"
}
```

### 9.5. Типы сущностей

Глобальный реестр типов сущностей (хранится в SQLite, см. §5.5).

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/api/entity-types` | Текущий реестр типов |
| `GET` | `/api/entity-types/defaults` | Стандартный набор типов (справочно, без обращения к БД) |
| `POST` | `/api/entity-types` | Создать тип `{name, label?, description?, color?}` → 201 |
| `PATCH` | `/api/entity-types/{name}` | Частичное обновление `{label?, description?, color?, visible?, position?}` |
| `DELETE` | `/api/entity-types/{name}` | Удалить тип из реестра (`Other` удалить нельзя) |
| `POST` | `/api/entity-types/reset` | Сбросить реестр к стандартному набору |

#### EntityType (объект)

```json
{
  "name": "Drug",
  "label": "Препарат",
  "color": "#89b4fa",
  "description": "лекарственное средство",
  "visible": true,
  "is_default": false,
  "position": 8
}
```

---

## 10. Веб-интерфейс

### 10.1. Макет основного экрана

```
┌──────────────────────────────────────────────────────────────┐
│  Anagraph        [текст для анализа...] [Анализировать] [Файл]│
├──────────────┬───────────────────────────────────────────────┤
│ ТИПЫ СУЩНОСТЕЙ│         ВИЗУАЛИЗАЦИЯ ГРАФА                    │
│  ●Персона ... │         (vis.js canvas)                       │
│  [+ Добавить] │                                               │
│ ─────────────│         ○──────○                              │
│  ФИЛЬТР       │        /        \                             │
│  ☑ Персона    │       ○──────────○                            │
│  ☑ Технология │        \        /                             │
│ ─────────────│         ○──────○                              │
│  ПОИСК        │                                               │
│  [________]   │                                               │
│ ─────────────│                                               │
│  ДОКУМЕНТЫ    ├───────────────────────────────────────────────│
│ ─────────────│  ВОПРОС К ГРАФУ                                │
│  СТАТИСТИКА   │  [Задайте вопрос...                ] [Спросить]│
│  Узлов: 156   │  ▶ История (3)                                │
│  Связей: 289  │  Ответ: Компания Google разработала BERT...   │
│ [Очистить граф]  [Показать Cypher (text_to_cypher)]           │
├──────────────┴───────────────────────────────────────────────┤
│  ● Google (Организация) — 15 связей  → разработала → BERT ... │
│                                            [Удалить]    [✕]   │
└──────────────────────────────────────────────────────────────┘
```

### 10.2. Цветовая схема узлов

Цвета **не зашиты в код** — каждый тип сущности в реестре (§5.5, §9.5) хранит
свой `color` (hex). UI читает цвета через хук `useEntityTypes` (`getColor`).
Стандартный набор использует Catppuccin-подобную палитру (`#89b4fa` Person,
`#a6e3a1` Organization, `#fab387` Technology, `#cba6f7` Concept и т.д.).
Для типов, которых нет в реестре, но которые встречаются в графе, используется
`ORPHAN_TYPE_COLOR` (`#585b70`).

### 10.3. Ключевые компоненты

#### GraphViewer.tsx
- Использует `vis-network` из vis.js, физическая симуляция `barnesHut`.
- Цвета узлов — из реестра типов; видимость фильтруется на клиенте по флагу `visible` типа.
- «Свежие» узлы (`created_at` < 30 с) подсвечиваются оранжевой обводкой.
- Клик по узлу — подсветка соседства + панель деталей; клик по ребру — tooltip с типом и `context`; двойной клик — фокус-зум; Esc/клик в пустоту — сброс.

#### DocumentUpload.tsx
- Поле вставки текста + кнопка «Анализировать» + кнопка «Файл» + drag-and-drop на всё окно.
- Ограничение на клиенте: PDF, DOCX, TXT, до 10 МБ.
- После загрузки — progress bar с SSE-обновлениями; по завершении — toast и обновление графа.

#### EntityTypesPanel.tsx
- CRUD реестра типов: чипы типов (клик — форма редактирования label/описания/цвета), «+ Добавить тип», удаление, «↺ Сбросить».
- Кнопка «↻ Переизвлечь весь граф» с прогресс-баром по SSE; предупреждение, если есть документы со старым набором типов (`types-snapshot`).

#### FilterPanel.tsx
- Чекбоксы по типам реестра; переключение `visible` сохраняется на бэкенд (`PATCH /api/entity-types/{name}`).
- Блок «orphan»-типов: типы, что есть в графе, но не в реестре, с кнопкой добавить их в реестр.

#### NodeDetails.tsx
- Footer выбранного узла: имя, тип, число связей, первые 8 связей; кнопка «Удалить» (удаляет узел и рёбра, с подтверждением).

#### QAPanel.tsx
- Текстовое поле + «Спросить»; отображение ответа и Cypher-запроса (collapsible) с пометкой метода.
- История вопросов в `localStorage` (последние 10), сворачиваемая.

---

## 11. Конфигурация и настройка

### 11.1. Файл .env

```env
# Neo4j
NEO4J_URI=bolt://localhost:7687     # в docker-compose перебивается на bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme

# LLM provider: "groq" (облако) или "ollama" (локально)
LLM_PROVIDER=groq

# Groq
GROQ_API_KEY=your-groq-api-key-here
GROQ_MODEL=llama-3.3-70b-versatile

# Ollama (для локального backend; в docker-compose перебивается на http://ollama:11434/v1)
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.1:8b

# Extraction
CHUNK_SIZE=1200
CHUNK_OVERLAP=150
MAX_RETRIES=3
EXTRACTION_TEMPERATURE=0.1

# QA
QA_TEMPERATURE=0.0
QA_MAX_TOKENS=1024
CYPHER_FALLBACK_ENABLED=true

# Normalization
SIMILARITY_THRESHOLD=0.85

# CORS (JSON-список)
ALLOWED_ORIGINS=["http://localhost:3000"]
```

Дополнительно в `settings.py` есть ключи с дефолтами, которые обычно не выносят в
`.env`: `GROQ_BASE_URL` и `DATABASE_PATH` (`data/anagraph.db`).

### 11.2. Конфигурация типов сущностей

Типы сущностей **не задаются в `.env`** и **не передаются при загрузке документа**.
Это персистентный глобальный реестр в SQLite, который пользователь редактирует
через UI (панель «Типы сущностей») или API (`/api/entity-types`, §9.5). Стандартный
набор сидится при первом старте; для адаптации под домен (например, `Drug,
Disease, Gene`) типы добавляются/редактируются в реестре. Чтобы пересобрать уже
построенный граф под изменённый набор — используется переизвлечение (§7.5).

---

## 12. Развёртывание

### 12.1. Docker Compose

```yaml
# docker-compose.yml (сокращённо)

services:
  neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-changeme}
      NEO4J_PLUGINS: '["apoc"]'
    volumes: ["neo4j_data:/data"]
    healthcheck: { test: ["CMD", "cypher-shell", ...], interval: 10s, retries: 5 }

  # Опциональные сервисы — поднимаются только с профилем "ollama"
  ollama:
    image: ollama/ollama:latest
    profiles: ["ollama"]
    ports: ["11434:11434"]
    volumes: ["ollama_data:/root/.ollama"]
  ollama-pull:                       # одноразовый: тянет OLLAMA_MODEL
    image: ollama/ollama:latest
    profiles: ["ollama"]
    depends_on: { ollama: { condition: service_healthy } }
    command: ['ollama pull "$OLLAMA_MODEL"']

  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    environment:                     # перебивают значения из .env для контейнера
      NEO4J_URI: bolt://neo4j:7687
      OLLAMA_BASE_URL: http://ollama:11434/v1
    depends_on: { neo4j: { condition: service_healthy } }
    volumes:
      - uploads:/app/uploads         # исходные файлы документов
      - app_data:/app/data           # SQLite-база

  frontend:
    build: ./frontend                # nginx alpine, проксирует /api → backend:8000
    ports: ["3000:3000"]
    depends_on: [backend]

volumes:
  neo4j_data:
  uploads:
  app_data:
  ollama_data:
```

> По умолчанию `docker compose up` поднимает только neo4j + backend + frontend
> (рассчитано на `LLM_PROVIDER=groq`). Локальная Ollama — под профилем:
> `docker compose --profile ollama up` дополнительно поднимает `ollama` и
> одноразовый `ollama-pull`, автоматически скачивающий модель.

### 12.2. Первый запуск

```bash
# 1. Клонировать репозиторий и подготовить конфигурацию
git clone <repo-url> anagraph && cd anagraph
cp .env.example .env
# для Groq: вписать GROQ_API_KEY; для локального LLM: LLM_PROVIDER=ollama

# 2. Запустить
docker compose up -d --build
# либо с локальной Ollama (модель скачается автоматически):
# docker compose --profile ollama up -d --build

# 3. Открыть в браузере
# Frontend:     http://localhost:3000
# API docs:     http://localhost:8000/docs
# Neo4j Browser: http://localhost:7474
```

### 12.3. Системные требования

**С `LLM_PROVIDER=groq`** (по умолчанию) инференс идёт в облаке — локально нужны
только Neo4j, backend и frontend:

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| CPU | 2 ядра | 4 ядра |
| RAM | 4 ГБ | 8 ГБ |
| Диск | 5 ГБ | 20 ГБ |
| OS | Linux/macOS (Docker) | Ubuntu 22.04+ |

**С `LLM_PROVIDER=ollama`** (полностью локально) к этому добавляется контейнер
Ollama: ориентир — 16 ГБ RAM и GPU с 8+ ГБ VRAM для модели уровня 7–8B; без GPU
запуск возможен, но инференс в ~10–20 раз медленнее (CPU mode).

---

## 13. Тестирование

### 13.1. Unit-тесты (реализовано)

В репозитории есть `backend/tests` (pytest + pytest-asyncio), `conftest.py`
содержит `MockLLMClient` и фикстуры `mock_llm` / `mock_llm_with_triplets`:

- `test_chunking.py` — 5 тестов: короткий текст → 1 чанк, длинный → несколько,
  контроль размера чанка, последовательность индексов, пустой текст → 0 чанков.
- `test_extraction.py` — 5 async-тестов с `MockLLMClient`: парсинг JSON, типы
  сущностей, битый JSON → пустой результат, пустой массив, пропуск неполных триплетов.
- `test_normalization.py` — 5 тестов: алиасы сущностей и предикатов,
  дедупликация, полный `normalize_triplets`, слияние похожих имён
  (`TensorFlow`/`Tensorflow`).

```python
# tests/test_extraction.py
@pytest.mark.asyncio
async def test_extraction_parses_json():
    llm = MockLLMClient(
        response='{"triplets": [{"subject": "A", "predicate": "rel", "object": "B"}]}'
    )
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Test text", 0, 1)
    assert len(result.triplets) == 1
    assert result.triplets[0].subject == "A"
```

Запуск: `cd backend && pytest`.

### 13.2. Интеграционные тесты (план, пока не реализованы)

- Поднять Neo4j в Docker (testcontainers).
- Загрузить тестовый документ через API, проверить запись триплетов в Neo4j.
- Проверить, что QA возвращает корректные ответы.

> Также пока нет тестов `graph_service`/`qa_service`/`entity_type_service`,
> тестов API-роутов и тестов фронтенда.

### 13.3. Тестовые тексты

Подготовить 3 типа тестовых текстов:
1. **Простой** (~500 слов): статья про одну технологию с чёткими фактами
2. **Средний** (~2000 слов): научная статья с множеством сущностей и связей
3. **Сложный** (~5000+ слов): длинный документ с кореференциями и аббревиатурами

### 13.4. Метрики качества

Для каждого тестового текста вручную размечаем эталонные триплеты и считаем:
- **Precision**: доля корректных триплетов среди извлечённых
- **Recall**: доля эталонных триплетов, которые удалось извлечь
- **F1-score**: гармоническое среднее Precision и Recall

Целевые показатели для MVP: Precision ≥ 0.75, Recall ≥ 0.60, F1 ≥ 0.65.

---

## 14. Ограничения и компромиссы

### 14.1. Принятые компромиссы

| Решение | Альтернатива | Почему выбрано |
|---------|-------------|----------------|
| OpenAI-совместимый клиент (Groq / Ollama) | Привязка к одному провайдеру | Один код обслуживает облако и локальный запуск; провайдер — флаг в `.env` |
| Приблизительная токенизация | tiktoken | Не добавляем зависимость; ±10% не критично |
| SequenceMatcher для дедупликации | Embedding similarity | Проще, быстрее; эмбеддинги добавим позже |
| Один label Entity + type | Отдельные labels для типов | Проще MERGE-логика; labels добавляем дополнительно |
| SSE для прогресса | WebSocket | Однонаправленный поток, проще реализация |
| JSON-mode у LLM | Ручной парсинг | OpenAI-совместимый `response_format` даёт валидный JSON |
| SQLite для метаданных | Postgres / in-memory | Персистентность без отдельного сервиса; репозиторий заменяем через `Protocol` |
| vis.js | D3.js, Cytoscape.js | Лучший баланс функционала и простоты для force-directed |

### 14.2. Известные ограничения

1. **Качество зависит от модели**: локальные 7–8B модели хуже на сложных текстах. Решение: смена провайдера/модели через `.env`.
2. **Нет OCR**: PDF должны содержать текстовый слой. Сканы не поддерживаются.
3. **Последовательная обработка**: чанки документа обрабатываются по одному; переизвлечение всего графа защищено от повторного запуска.
4. **Кореференция ограничена**: простой fuzzy matching. Сложные случаи ("он", "компания", "этот институт") не разрешаются.
5. **Визуализация масштабируется до ~1000 узлов**: для больших графов нужна серверная фильтрация.
6. **Text-to-Cypher не идеален**: на сложных вопросах может генерировать некорректные запросы (есть fallback).
7. **Состояние фоновых задач — в памяти процесса**: рестарт во время обработки теряет трекинг прогресса (записанные триплеты остаются в Neo4j).
8. **Приватность**: с `LLM_PROVIDER=groq` тексты уходят в облако; полностью локальный режим — только с Ollama.

### 14.3. Что НЕ входит в MVP

- Аутентификация и многопользовательский режим
- GraphRAG (community detection, иерархические суммаризации)
- Дообучение LLM (LoRA/QLoRA)
- Экспорт графа (RDF, CSV) — добавится позже
- Batch-обработка множества документов одним запросом
- Горизонтальное масштабирование (SQLite рассчитан на одиночный инстанс)

---

## 15. Дорожная карта

### Phase 1: MVP — реализовано
- [x] Backend: FastAPI skeleton, settings, CORS
- [x] Document upload + text extraction (PDF, DOCX, TXT) + вставка текста
- [x] Chunking service
- [x] LLM client (OpenAI-совместимый: Groq / Ollama)
- [x] Extraction service + промпты
- [x] Нормализация (aliases из JSON, dedup, similarity merge)
- [x] Neo4j service (save, query, stats, delete)
- [x] API: documents, graph, extraction
- [x] Frontend: upload, граф (vis.js), базовый UI
- [x] Docker Compose

### Phase 2: QA + Polish — реализовано
- [x] QA service (Text-to-Cypher)
- [x] Fallback-механизм
- [x] Answer generation
- [x] Frontend: QA panel, search, filters, stats, document list
- [x] SSE для прогресса извлечения
- [x] Обработка ошибок (bad JSON → retry, статус `error` у документа)

### Phase 3: Тестирование и эксперименты — частично
- [x] Unit-тесты (chunking, normalization, extraction)
- [ ] Интеграционные тесты (Neo4j, full pipeline)
- [ ] Бенчмарк на тестовых текстах
- [ ] Сравнение моделей/провайдеров

### Сверх исходного плана — реализовано
- [x] Персистентность документов в SQLite (переживают рестарт)
- [x] Глобальный реестр типов сущностей (CRUD через UI/API) с описаниями для промпта
- [x] Переизвлечение всего графа под изменённый набор типов + проверка согласованности
- [x] Удаление отдельных узлов из графа

### Phase 4: Расширения (после защиты)
- [ ] GraphRAG (community detection + summaries)
- [ ] Embedding-based дедупликация
- [ ] Экспорт (RDF, CSV, JSON-LD)
- [ ] Batch upload
- [ ] Аутентификация
- [ ] Постоянное хранилище состояния фоновых задач / очередь воркеров

---

## Приложение A: Пример полного прохода

### Входной текст

```
Компания Google разработала модель BERT в 2018 году. BERT использует архитектуру Transformer, 
предложенную Vaswani et al. Transformer является основой большинства современных больших 
языковых моделей, включая GPT-4 от OpenAI и LLaMA от Meta.
```

### Чанки
Один чанк (текст короткий).

### Извлечённые триплеты (raw)

```json
{
  "triplets": [
    {"subject": "Google", "subject_type": "Organization", "predicate": "разработала", "object": "BERT", "object_type": "Technology"},
    {"subject": "BERT", "subject_type": "Technology", "predicate": "создан_в", "object": "2018", "object_type": "Date"},
    {"subject": "BERT", "subject_type": "Technology", "predicate": "использует", "object": "Transformer", "object_type": "Technology"},
    {"subject": "Vaswani et al.", "subject_type": "Person", "predicate": "предложил", "object": "Transformer", "object_type": "Technology"},
    {"subject": "Transformer", "subject_type": "Technology", "predicate": "является_основой", "object": "GPT-4", "object_type": "Technology"},
    {"subject": "OpenAI", "subject_type": "Organization", "predicate": "разработала", "object": "GPT-4", "object_type": "Technology"},
    {"subject": "Transformer", "subject_type": "Technology", "predicate": "является_основой", "object": "LLaMA", "object_type": "Technology"},
    {"subject": "Meta", "subject_type": "Organization", "predicate": "разработала", "object": "LLaMA", "object_type": "Technology"}
  ]
}
```

### После нормализации
Без изменений (в этом примере нет дубликатов/синонимов).

### Cypher-запросы

Все триплеты чанка пишутся одним `UNWIND ... MERGE` (концептуально — для каждого
триплета):

```cypher
UNWIND $triplets AS t
MERGE (s:Entity {name: t.subject_name})
  ON CREATE SET s.type = t.subject_type, s.created_at = datetime()
MERGE (o:Entity {name: t.object_name})
  ON CREATE SET o.type = t.object_type, o.created_at = datetime()
MERGE (s)-[r:RELATES {type: t.predicate}]->(o)
  ON CREATE SET r.source = $source, r.context = t.context,
                r.confidence = t.confidence, r.created_at = datetime()
-- затем отдельными запросами навешиваются динамические labels:
-- MATCH (n:Entity {name: $name}) SET n:`Organization`  и т.п.
```

### QA

**Вопрос**: "Что использует BERT?"

**Сгенерированный Cypher**:
```cypher
MATCH (s:Entity)-[r:RELATES]->(o:Entity) 
WHERE toLower(s.name) CONTAINS 'bert' AND toLower(r.type) CONTAINS 'использует' 
RETURN s.name AS subject, r.type AS relation, o.name AS object LIMIT 25
```

**Результат из Neo4j**: `[{subject: "BERT", relation: "использует", object: "Transformer"}]`

**Ответ**: "Согласно графу знаний, BERT использует архитектуру Transformer."
