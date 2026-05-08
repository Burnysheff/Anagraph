# Техническое задание: Система построения графа знаний на основе LLM

## Версия: 1.0 | Дата: 04.04.2026

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

**KnowledgeGraph Builder** (рабочее название: `kg-builder`)

### 1.2. Суть проекта

Система автоматического построения графа знаний из неструктурированного текста на основе open-source больших языковых моделей (LLM). Пользователь загружает текстовый документ, система извлекает сущности и связи, сохраняет их в графовой базе данных, предоставляет интерактивную визуализацию и позволяет задавать вопросы к графу на естественном языке.

### 1.3. Ключевые принципы

- **Полная автономность**: система работает локально, без обращения к внешним API. Все данные остаются на инфраструктуре пользователя.
- **Open-source**: все компоненты (LLM, БД, фреймворки) — свободное ПО.
- **Модульность**: каждый компонент заменяем. LLM можно поменять на другую, не трогая остальной код.
- **Универсальность**: работает с произвольными текстами без привязки к домену.
- **Простота развёртывания**: `docker compose up` — и система работает.

### 1.4. Стек технологий

| Компонент | Технология | Обоснование |
|-----------|-----------|-------------|
| Backend | Python 3.11+ / FastAPI | Экосистема ML, async, автодокументация |
| LLM | Mistral 7B / LLaMA 3 8B (через Ollama) | Баланс качества и ресурсов |
| Графовая БД | Neo4j Community Edition | Cypher, зрелая экосистема, open-source |
| Frontend | React 18 + TypeScript | Интерактивный UI |
| Визуализация графа | vis.js (vis-network) | Force-directed layout, интерактивность |
| Контейнеризация | Docker + Docker Compose | Простота развёртывания |
| Извлечение текста | PyPDF2, python-docx, chardet | Поддержка PDF, DOCX, TXT |
| Работа с LLM | httpx (async HTTP) | Асинхронные вызовы к Ollama API |
| ORM/драйвер Neo4j | neo4j (official Python driver) | Официальный драйвер, async поддержка |

---

## 2. Цели и задачи системы

### 2.1. Бизнес-цели

1. Предоставить исследователям и аналитикам инструмент для автоматического структурирования знаний из текстовых документов.
2. Обеспечить конфиденциальность данных за счёт полностью локального развёртывания.
3. Снизить порог входа в построение графов знаний — пользователю не нужно знать NLP, Cypher или программирование.
4. Создать open-source альтернативу проприетарным решениям (LlamaIndex + OpenAI, Microsoft GraphRAG).

### 2.2. Технические цели

1. Сквозной pipeline: текст → триплеты → граф → визуализация → QA.
2. Обработка документа 10 000 слов за разумное время (определяется скоростью LLM, ориентир: 5–15 минут на GPU уровня RTX 3060).
3. Поддержка инкрементального обновления графа (добавление новых документов без перестроения).
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
│  └──────────┘    └──────┬───────┘    └─────────────────┘    │
│                         │                                    │
│                         ▼                                    │
│                  ┌──────────────┐                            │
│                  │   Ollama     │                            │
│                  │   LLM API   │                            │
│                  │   :11434     │                            │
│                  └──────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

### 4.2. Взаимодействие компонентов

```
Пользователь                Frontend              Backend                 Ollama              Neo4j
     │                         │                     │                      │                   │
     │── загрузить файл ──────►│                     │                      │                   │
     │                         │── POST /documents ─►│                      │                   │
     │                         │                     │── читает файл ──────►│                   │
     │                         │                     │── чанкинг ──────────►│                   │
     │                         │                     │                      │                   │
     │                         │                     │── POST /api/generate │                   │
     │                         │                     │   (промпт + чанк) ──►│                   │
     │                         │                     │◄── JSON триплеты ────│                   │
     │                         │                     │                      │                   │
     │                         │                     │── нормализация ─────►│                   │
     │                         │                     │── MERGE Cypher ──────────────────────────►│
     │                         │                     │                      │                   │
     │                         │◄── SSE: прогресс ───│                      │                   │
     │◄── обновление UI ──────│                     │                      │                   │
     │                         │                     │                      │                   │
     │── задать вопрос ───────►│                     │                      │                   │
     │                         │── POST /qa ─────────►│                      │                   │
     │                         │                     │── POST /api/generate │                   │
     │                         │                     │   (вопрос→Cypher) ──►│                   │
     │                         │                     │◄── Cypher-запрос ────│                   │
     │                         │                     │── выполнить Cypher ──────────────────────►│
     │                         │                     │◄── результат ────────────────────────────│
     │                         │                     │── POST /api/generate │                   │
     │                         │                     │   (формирование ──── │                   │
     │                         │                     │    ответа)           │                   │
     │                         │◄── ответ + Cypher ──│                      │                   │
     │◄── отображение ────────│                     │                      │                   │
```

### 4.3. Структура проекта

```
kg-builder/
├── docker-compose.yml
├── .env.example
├── README.md
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                     # FastAPI app, точка входа
│   ├── config.py                   # Конфигурация (Pydantic Settings)
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes/
│   │   │   ├── documents.py        # POST /documents, GET /documents
│   │   │   ├── graph.py            # GET /graph/nodes, GET /graph/edges, GET /graph/stats
│   │   │   ├── qa.py               # POST /qa
│   │   │   └── extraction.py       # POST /extract, GET /extract/{job_id}/status
│   │   └── dependencies.py         # DI: Neo4j driver, LLM client
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── document_service.py     # Извлечение текста из PDF/DOCX/TXT
│   │   ├── chunking_service.py     # Разбиение текста на чанки
│   │   ├── extraction_service.py   # Вызов LLM, парсинг триплетов
│   │   ├── normalization_service.py # Нормализация, дедупликация
│   │   ├── graph_service.py        # Запись/чтение Neo4j
│   │   ├── qa_service.py           # Text-to-Cypher + формирование ответа
│   │   └── llm_client.py           # Обёртка над Ollama API
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── triplet.py              # Pydantic: Triplet, Entity, Relation
│   │   ├── document.py             # Pydantic: Document, Chunk
│   │   ├── graph.py                # Pydantic: Node, Edge, GraphStats
│   │   └── qa.py                   # Pydantic: QARequest, QAResponse
│   │
│   ├── prompts/
│   │   ├── extraction_ru.txt       # Промпт извлечения (русский)
│   │   ├── extraction_en.txt       # Промпт извлечения (английский)
│   │   ├── text_to_cypher.txt      # Промпт Text-to-Cypher
│   │   └── answer_generation.txt   # Промпт формирования ответа
│   │
│   └── tests/
│       ├── test_chunking.py
│       ├── test_extraction.py
│       ├── test_normalization.py
│       ├── test_graph_service.py
│       ├── test_qa_service.py
│       └── conftest.py             # Фикстуры: mock LLM, test Neo4j
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   │
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── api/
│       │   └── client.ts           # Axios/fetch обёртки для backend API
│       ├── components/
│       │   ├── DocumentUpload.tsx   # Форма загрузки документа
│       │   ├── GraphViewer.tsx      # vis.js визуализация
│       │   ├── NodeDetails.tsx      # Панель свойств узла
│       │   ├── FilterPanel.tsx      # Фильтрация по типам
│       │   ├── SearchBar.tsx        # Поиск узлов
│       │   ├── QAPanel.tsx          # Вопрос-ответ интерфейс
│       │   ├── StatsPanel.tsx       # Статистика графа
│       │   └── ProgressBar.tsx      # Прогресс извлечения
│       ├── hooks/
│       │   ├── useGraph.ts          # Состояние графа
│       │   └── useExtraction.ts     # SSE подключение для прогресса
│       └── types/
│           └── index.ts             # TypeScript типы
│
└── scripts/
    ├── seed_example.py              # Загрузка примера для демонстрации
    └── benchmark.py                 # Бенчмарк: скорость, качество
```

---

## 5. Компоненты системы

### 5.1. Backend (FastAPI)

#### 5.1.1. Точка входа (`main.py`)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from api.routes import documents, graph, qa, extraction
from api.dependencies import init_neo4j, close_neo4j

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_neo4j()      # Подключение к Neo4j, создание индексов
    yield
    await close_neo4j()     # Закрытие соединения

app = FastAPI(
    title="KG Builder API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/documents", tags=["documents"])
app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
app.include_router(qa.router, prefix="/api/qa", tags=["qa"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["extraction"])
```

#### 5.1.2. Конфигурация (`config.py`)

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Neo4j
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"
    
    # Ollama
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "mistral:7b-instruct"
    
    # Extraction
    chunk_size: int = 1200          # токенов
    chunk_overlap: int = 150        # токенов
    max_retries: int = 3            # повторных попыток при невалидном JSON
    extraction_temperature: float = 0.1
    
    # QA
    qa_temperature: float = 0.0
    qa_max_tokens: int = 1024
    cypher_fallback_enabled: bool = True
    
    # Entity types (по умолчанию; пользователь может переопределить)
    default_entity_types: list[str] = [
        "Person", "Organization", "Technology", "Concept",
        "Location", "Date", "Event", "Product"
    ]
    
    # Normalization
    similarity_threshold: float = 0.85  # порог для дедупликации
    
    class Config:
        env_file = ".env"

settings = Settings()
```

### 5.2. LLM Client (`llm_client.py`)

Обёртка над Ollama API (OpenAI-совместимый формат):

```python
import httpx
from config import settings

class LLMClient:
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model = settings.ollama_model
        self.client = httpx.AsyncClient(timeout=120.0)  # LLM может думать долго
    
    async def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        format: str = "json",  # "json" заставляет Ollama возвращать валидный JSON
    ) -> str:
        """Вызов LLM через Ollama API."""
        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "format": format,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                },
            },
        )
        response.raise_for_status()
        return response.json()["message"]["content"]
    
    async def close(self):
        await self.client.aclose()
```

**Ключевое решение:** Ollama поддерживает параметр `"format": "json"`, который заставляет модель генерировать валидный JSON. Это критически важно для надёжного парсинга триплетов и устраняет необходимость сложной обработки ошибок парсинга.

### 5.3. Neo4j Service (`graph_service.py`)

```python
from neo4j import AsyncGraphDatabase
from models.triplet import Triplet
from config import settings

class GraphService:
    def __init__(self):
        self.driver = AsyncGraphDatabase.driver(
            settings.neo4j_uri,
            auth=(settings.neo4j_user, settings.neo4j_password),
        )
    
    async def create_indexes(self):
        """Создание индексов при старте приложения."""
        async with self.driver.session() as session:
            # Уникальный constraint для каждого типа — создаётся динамически
            # Полнотекстовый индекс для поиска
            await session.run("""
                CREATE FULLTEXT INDEX entityNameIndex IF NOT EXISTS
                FOR (n:Entity) ON EACH [n.name]
            """)
            # Индекс по name для быстрого MERGE
            await session.run("""
                CREATE INDEX entityNameIdx IF NOT EXISTS
                FOR (n:Entity) ON (n.name)
            """)
    
    async def save_triplet(self, triplet: Triplet, source_id: str):
        """Сохранение одного триплета в Neo4j."""
        query = """
        MERGE (s:Entity {name: $subject_name})
        ON CREATE SET s.type = $subject_type, s.created_at = datetime()
        ON MATCH SET s.type = COALESCE(s.type, $subject_type)
        
        MERGE (o:Entity {name: $object_name})
        ON CREATE SET o.type = $object_type, o.created_at = datetime()
        ON MATCH SET o.type = COALESCE(o.type, $object_type)
        
        MERGE (s)-[r:RELATES {type: $predicate}]->(o)
        ON CREATE SET r.source = $source, r.context = $context, r.created_at = datetime()
        """
        # Также добавляем label = типу сущности
        # Neo4j не позволяет MERGE с динамическими labels, 
        # поэтому добавляем label отдельным запросом
        label_query_s = f"MATCH (n:Entity {{name: $name}}) SET n:{triplet.subject_type}"
        label_query_o = f"MATCH (n:Entity {{name: $name}}) SET n:{triplet.object_type}"
        
        async with self.driver.session() as session:
            await session.run(query, {
                "subject_name": triplet.subject,
                "subject_type": triplet.subject_type,
                "object_name": triplet.object,
                "object_type": triplet.object_type,
                "predicate": triplet.predicate,
                "source": source_id,
                "context": triplet.context,
            })
            await session.run(label_query_s, {"name": triplet.subject})
            await session.run(label_query_o, {"name": triplet.object})
    
    async def save_triplets(self, triplets: list[Triplet], source_id: str):
        """Батчевое сохранение триплетов."""
        for triplet in triplets:
            await self.save_triplet(triplet, source_id)
    
    async def get_all_nodes(self, limit: int = 500) -> list[dict]:
        """Получение всех узлов для визуализации."""
        async with self.driver.session() as session:
            result = await session.run("""
                MATCH (n:Entity)
                RETURN n.name AS name, n.type AS type, 
                       id(n) AS id, 
                       size([(n)--() | 1]) AS connections
                ORDER BY connections DESC
                LIMIT $limit
            """, {"limit": limit})
            return [dict(record) async for record in result]
    
    async def get_all_edges(self, limit: int = 1000) -> list[dict]:
        """Получение всех рёбер для визуализации."""
        async with self.driver.session() as session:
            result = await session.run("""
                MATCH (s:Entity)-[r:RELATES]->(o:Entity)
                RETURN id(s) AS source, id(o) AS target, 
                       r.type AS type, r.context AS context
                LIMIT $limit
            """, {"limit": limit})
            return [dict(record) async for record in result]
    
    async def get_stats(self) -> dict:
        """Статистика графа."""
        async with self.driver.session() as session:
            nodes = await session.run("MATCH (n:Entity) RETURN count(n) AS count")
            edges = await session.run("MATCH ()-[r:RELATES]->() RETURN count(r) AS count")
            types = await session.run("""
                MATCH (n:Entity) 
                RETURN n.type AS type, count(n) AS count 
                ORDER BY count DESC
            """)
            top_nodes = await session.run("""
                MATCH (n:Entity)
                RETURN n.name AS name, n.type AS type, 
                       size([(n)--() | 1]) AS connections
                ORDER BY connections DESC LIMIT 10
            """)
            return {
                "total_nodes": (await nodes.single())["count"],
                "total_edges": (await edges.single())["count"],
                "types_distribution": [dict(r) async for r in types],
                "top_connected": [dict(r) async for r in top_nodes],
            }
    
    async def search_nodes(self, query: str, limit: int = 20) -> list[dict]:
        """Полнотекстовый поиск узлов."""
        async with self.driver.session() as session:
            result = await session.run("""
                CALL db.index.fulltext.queryNodes('entityNameIndex', $query + '~')
                YIELD node, score
                RETURN node.name AS name, node.type AS type, score
                LIMIT $limit
            """, {"query": query, "limit": limit})
            return [dict(record) async for record in result]
    
    async def get_node_neighborhood(self, node_name: str, depth: int = 1) -> dict:
        """Окружение конкретного узла."""
        async with self.driver.session() as session:
            result = await session.run("""
                MATCH path = (center:Entity {name: $name})-[*1..$depth]-(neighbor:Entity)
                UNWIND relationships(path) AS rel
                WITH DISTINCT startNode(rel) AS s, rel, endNode(rel) AS o
                RETURN s.name AS source_name, s.type AS source_type,
                       rel.type AS relation,
                       o.name AS target_name, o.type AS target_type
            """, {"name": node_name, "depth": depth})
            return [dict(record) async for record in result]
    
    async def execute_cypher(self, cypher: str) -> list[dict]:
        """Выполнение произвольного Cypher-запроса (для QA)."""
        async with self.driver.session() as session:
            result = await session.run(cypher)
            return [dict(record) async for record in result]
    
    async def close(self):
        await self.driver.close()
```

**Ключевое решение**: используем единый label `Entity` + свойство `type` + дополнительные labels для каждого типа. Это обеспечивает и гибкость (произвольные типы), и производительность (индексы по labels).

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
    context: str = ""            # фрагмент текста-источника
    confidence: float = 1.0      # оценка достоверности

class ExtractionResult(BaseModel):
    triplets: list[Triplet]
    chunk_index: int
    total_chunks: int
    raw_text: str                # исходный чанк


# models/document.py
from pydantic import BaseModel
from datetime import datetime

class Document(BaseModel):
    id: str
    filename: str
    text_length: int
    num_chunks: int
    status: str                  # "pending" | "processing" | "completed" | "error"
    created_at: datetime
    triplets_extracted: int = 0

class Chunk(BaseModel):
    index: int
    text: str
    start_char: int
    end_char: int


# models/graph.py
from pydantic import BaseModel

class Node(BaseModel):
    id: int
    name: str
    type: str
    connections: int

class Edge(BaseModel):
    source: int
    target: int
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
```

### 6.2. Модель данных Neo4j

```
(:Entity {
    name: String,        // уникальное каноническое имя
    type: String,        // "Person", "Organization", "Technology", ...
    aliases: [String],   // альтернативные написания
    source: String,      // ID документа-источника (первого)
    created_at: DateTime
})

-[:RELATES {
    type: String,        // нормализованный предикат
    source: String,      // ID документа-источника
    context: String,     // фрагмент текста
    confidence: Float,   // 0.0 - 1.0
    created_at: DateTime
}]->
```

**Индексы:**
```cypher
-- Уникальность по имени
CREATE CONSTRAINT entity_name_unique IF NOT EXISTS
FOR (n:Entity) REQUIRE n.name IS UNIQUE;

-- Полнотекстовый поиск
CREATE FULLTEXT INDEX entityNameIndex IF NOT EXISTS
FOR (n:Entity) ON EACH [n.name];

-- Индекс по типу
CREATE INDEX entity_type_idx IF NOT EXISTS
FOR (n:Entity) ON (n.type);
```

### 6.3. TypeScript типы (Frontend)

```typescript
// types/index.ts

interface Node {
  id: number;
  name: string;
  type: string;
  connections: number;
}

interface Edge {
  source: number;
  target: number;
  type: string;
  context?: string;
}

interface GraphData {
  nodes: Node[];
  edges: Edge[];
}

interface Document {
  id: string;
  filename: string;
  status: "pending" | "processing" | "completed" | "error";
  created_at: string;
  triplets_extracted: number;
  num_chunks: number;
  progress?: number;  // 0-100
}

interface QAResponse {
  answer: string;
  cypher_query: string;
  raw_results: Record<string, unknown>[];
  method: string;
}

interface GraphStats {
  total_nodes: number;
  total_edges: number;
  types_distribution: { type: string; count: number }[];
  top_connected: { name: string; type: string; connections: number }[];
  documents_processed: number;
}
```

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

#### 7.3.1. Промпт для извлечения (русский)

```
# prompts/extraction_ru.txt

Ты — система извлечения знаний. Твоя задача — прочитать текст и извлечь из него все значимые сущности и отношения между ними.

Правила:
1. Извлекай только факты, явно присутствующие в тексте. НЕ додумывай.
2. Каждый триплет: (субъект, предикат, объект).
3. Используй КРАТКИЕ имена сущностей (не повторяй определения).
4. Нормализуй имена: "ВШЭ", "Высшая школа экономики", "НИУ ВШЭ" → "НИУ ВШЭ".
5. Предикаты записывай глаголами или краткими фразами: "разработал", "использует", "основан_в", "является_частью".
6. Типизируй каждую сущность одним из типов: Person, Organization, Technology, Concept, Location, Date, Event, Product.

Формат ответа (JSON):
{
  "triplets": [
    {
      "subject": "Google",
      "subject_type": "Organization",
      "predicate": "разработала",
      "object": "BERT",
      "object_type": "Technology"
    }
  ]
}

Текст для анализа:
{text}
```

#### 7.3.2. Промпт для извлечения (английский)

```
# prompts/extraction_en.txt

You are a knowledge extraction system. Read the text and extract all significant entities and relationships between them.

Rules:
1. Extract only facts explicitly present in the text. Do NOT infer.
2. Each triplet: (subject, predicate, object).
3. Use SHORT entity names (no repeating definitions).
4. Normalize names: use the most common form.
5. Write predicates as verbs or short phrases: "developed", "uses", "founded_in", "part_of".
6. Classify each entity as one of: Person, Organization, Technology, Concept, Location, Date, Event, Product.

Response format (JSON):
{
  "triplets": [
    {
      "subject": "Google",
      "subject_type": "Organization",
      "predicate": "developed",
      "object": "BERT",
      "object_type": "Technology"
    }
  ]
}

Text to analyze:
{text}
```

#### 7.3.3. Сервис извлечения

```python
# services/extraction_service.py

import json
from models.triplet import Triplet, ExtractionResult
from services.llm_client import LLMClient
from config import settings

class ExtractionService:
    
    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.prompt_ru = open("prompts/extraction_ru.txt").read()
        self.prompt_en = open("prompts/extraction_en.txt").read()
    
    async def extract_from_chunk(
        self,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
        language: str = "ru",
    ) -> ExtractionResult:
        """Извлечение триплетов из одного чанка."""
        
        template = self.prompt_ru if language == "ru" else self.prompt_en
        prompt = template.replace("{text}", chunk_text)
        
        for attempt in range(settings.max_retries):
            try:
                raw_response = await self.llm.generate(
                    prompt=prompt,
                    temperature=settings.extraction_temperature,
                    format="json",
                )
                
                data = json.loads(raw_response)
                triplets = [
                    Triplet(
                        subject=t["subject"].strip(),
                        subject_type=t.get("subject_type", "Concept"),
                        predicate=t["predicate"].strip(),
                        object=t["object"].strip(),
                        object_type=t.get("object_type", "Concept"),
                        context=chunk_text[:200],  # первые 200 символов как контекст
                    )
                    for t in data.get("triplets", [])
                    if t.get("subject") and t.get("predicate") and t.get("object")
                ]
                
                return ExtractionResult(
                    triplets=triplets,
                    chunk_index=chunk_index,
                    total_chunks=total_chunks,
                    raw_text=chunk_text,
                )
            
            except (json.JSONDecodeError, KeyError) as e:
                if attempt == settings.max_retries - 1:
                    # Возвращаем пустой результат вместо ошибки
                    return ExtractionResult(
                        triplets=[],
                        chunk_index=chunk_index,
                        total_chunks=total_chunks,
                        raw_text=chunk_text,
                    )
                continue  # Повторная попытка
```

### 7.4. Этап 4: Нормализация и дедупликация

```python
# services/normalization_service.py

from difflib import SequenceMatcher
from models.triplet import Triplet
from config import settings

class NormalizationService:
    
    # Словарь известных сокращений (расширяемый)
    ALIASES = {
        "вшэ": "НИУ ВШЭ",
        "высшая школа экономики": "НИУ ВШЭ",
        "ниу вшэ": "НИУ ВШЭ",
        "гугл": "Google",
        "мс": "Microsoft",
        "майкрософт": "Microsoft",
    }
    
    # Синонимы предикатов
    PREDICATE_ALIASES = {
        "создал": "разработал",
        "создала": "разработала",
        "написал": "разработал",
        "написала": "разработала",
        "изобрёл": "разработал",
        "придумал": "разработал",
        "основал": "основал",
        "основала": "основала",
        "developed": "developed",
        "created": "developed",
        "invented": "developed",
        "built": "developed",
        "wrote": "developed",
    }
    
    def normalize_triplets(self, triplets: list[Triplet]) -> list[Triplet]:
        """Полный цикл нормализации."""
        triplets = [self._normalize_entity_names(t) for t in triplets]
        triplets = [self._normalize_predicate(t) for t in triplets]
        triplets = self._deduplicate(triplets)
        triplets = self._merge_similar_entities(triplets)
        return triplets
    
    def _normalize_entity_names(self, triplet: Triplet) -> Triplet:
        """Нормализация имён сущностей."""
        subject = self.ALIASES.get(triplet.subject.lower(), triplet.subject)
        obj = self.ALIASES.get(triplet.object.lower(), triplet.object)
        
        # Капитализация
        subject = subject.strip()
        obj = obj.strip()
        
        return triplet.model_copy(update={"subject": subject, "object": obj})
    
    def _normalize_predicate(self, triplet: Triplet) -> Triplet:
        """Нормализация предикатов."""
        pred = triplet.predicate.lower().strip()
        normalized = self.PREDICATE_ALIASES.get(pred, pred)
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

**Компромисс**: для MVP используем строковое сходство (SequenceMatcher). В будущем можно добавить сравнение эмбеддингов или повторный вызов LLM для сложных случаев кореференции.

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
┌───────────────────┐     ┌──────────────────┐
│  Text-to-Cypher   │────►│  Валидация Cypher │
│  (LLM генерирует  │     │  (синтаксис)      │
│   Cypher-запрос)  │     └────────┬─────────┘
└───────────────────┘              │
                                   │ Валидный?
                          ┌────────┴─────────┐
                          │ Да               │ Нет
                          ▼                  ▼
                   ┌──────────┐     ┌──────────────┐
                   │ Выполнить│     │  Fallback:   │
                   │ в Neo4j  │     │  шаблонный   │
                   └────┬─────┘     │  запрос      │
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

### 8.2. Промпт Text-to-Cypher

```
# prompts/text_to_cypher.txt

Ты — ассистент, который преобразует вопросы на естественном языке в Cypher-запросы к Neo4j.

Схема графа:
- Узлы имеют label :Entity и свойства: name (String), type (String)
- Типы сущностей: Person, Organization, Technology, Concept, Location, Date, Event, Product
- Рёбра имеют тип :RELATES и свойство type (String) — тип отношения

Правила:
1. Используй MATCH для поиска.
2. Для поиска по имени используй toLower() для регистронезависимого сравнения.
3. Для нечёткого поиска используй CONTAINS.
4. Всегда возвращай осмысленные поля через RETURN.
5. Добавляй LIMIT 25, если не указано иное.
6. Верни ТОЛЬКО Cypher-запрос, ничего больше.

Примеры:

Вопрос: "Что разработала компания Google?"
Cypher: MATCH (s:Entity)-[r:RELATES]->(o:Entity) WHERE toLower(s.name) CONTAINS 'google' AND toLower(r.type) CONTAINS 'разработал' RETURN s.name AS subject, r.type AS relation, o.name AS object LIMIT 25

Вопрос: "Какие технологии связаны с машинным обучением?"
Cypher: MATCH (s:Entity)-[r:RELATES]-(o:Entity) WHERE (toLower(s.name) CONTAINS 'машинн' OR toLower(o.name) CONTAINS 'машинн') RETURN s.name AS entity1, r.type AS relation, o.name AS entity2 LIMIT 25

Вопрос: "Покажи все организации"
Cypher: MATCH (n:Entity) WHERE n.type = 'Organization' RETURN n.name AS name, n.type AS type LIMIT 25

Вопрос: {question}
Cypher:
```

### 8.3. Промпт формирования ответа

```
# prompts/answer_generation.txt

На основе данных из графа знаний сформулируй понятный ответ на вопрос пользователя.

Вопрос: {question}

Данные из графа (результат Cypher-запроса):
{results}

Правила:
1. Отвечай на том же языке, на котором задан вопрос.
2. Если данных нет или они нерелевантны, скажи об этом честно.
3. Ответ должен быть кратким и информативным.
4. Перечисляй конкретные факты из данных.
```

### 8.4. Fallback-механизм

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
| `POST` | `/api/documents` | Загрузка документа (multipart/form-data) |
| `GET` | `/api/documents` | Список загруженных документов |
| `GET` | `/api/documents/{id}` | Детали конкретного документа |
| `DELETE` | `/api/documents/{id}` | Удаление документа (и связанных триплетов) |

#### POST /api/documents

```
Request: multipart/form-data
  - file: File (PDF, DOCX, TXT)
  - language: string ("ru" | "en" | "auto"), default "auto"
  - entity_types: string[] (optional, override default types)

Response 202:
{
  "id": "doc_abc123",
  "filename": "article.pdf",
  "status": "processing",
  "num_chunks": 12
}
```

### 9.2. Извлечение

| Метод | Endpoint | Описание |
|-------|----------|----------|
| `GET` | `/api/extraction/{doc_id}/status` | Статус извлечения (SSE) |
| `GET` | `/api/extraction/{doc_id}/results` | Результаты извлечения |

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
| `GET` | `/api/graph` | Все узлы и рёбра (с лимитом) |
| `GET` | `/api/graph/stats` | Статистика графа |
| `GET` | `/api/graph/search?q=...` | Поиск узлов |
| `GET` | `/api/graph/node/{name}` | Окружение узла |
| `GET` | `/api/graph/node/{name}/neighbors?depth=1` | Соседи на расстоянии depth |

#### GET /api/graph

```
Query params:
  - limit: int (default 500)
  - types: string[] (фильтр по типам)

Response 200:
{
  "nodes": [
    {"id": 1, "name": "Google", "type": "Organization", "connections": 15},
    {"id": 2, "name": "BERT", "type": "Technology", "connections": 8}
  ],
  "edges": [
    {"source": 1, "target": 2, "type": "разработала", "context": "..."}
  ]
}
```

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

---

## 10. Веб-интерфейс

### 10.1. Макет основного экрана

```
┌──────────────────────────────────────────────────────────────┐
│  KG Builder                              [Загрузить документ]│
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  ФИЛЬТРЫ     │          ВИЗУАЛИЗАЦИЯ ГРАФА                   │
│              │          (vis.js canvas)                       │
│  □ Person    │                                               │
│  □ Org       │         ○──────○                              │
│  □ Tech      │        /        \                             │
│  □ Concept   │       ○──────────○                            │
│  □ Location  │        \        /                             │
│  □ Date      │         ○──────○                              │
│              │                                               │
│  ─────────── │                                               │
│  ПОИСК       │                                               │
│  [________]  │                                               │
│              │                                               │
│  ─────────── │───────────────────────────────────────────────│
│  СТАТИСТИКА  │  ВОПРОС К ГРАФУ                               │
│              │  [Введите вопрос...                ] [Спросить]│
│  Узлов: 156  │                                               │
│  Рёбер: 289  │  Ответ: Компания Google разработала BERT,     │
│  Типов: 6    │  TensorFlow и Transformer.                    │
│              │  Cypher: MATCH (s)-[r]->(o) WHERE ...         │
├──────────────┴───────────────────────────────────────────────┤
│  ДЕТАЛИ УЗЛА: Google (Organization) — 15 связей              │
│  → разработала → BERT  │  → основана_в → Mountain View       │
└──────────────────────────────────────────────────────────────┘
```

### 10.2. Цветовая схема узлов

| Тип | Цвет | Hex |
|-----|------|-----|
| Person | Синий | `#4A90D9` |
| Organization | Зелёный | `#27AE60` |
| Technology | Оранжевый | `#F39C12` |
| Concept | Фиолетовый | `#8E44AD` |
| Location | Красный | `#E74C3C` |
| Date | Серый | `#95A5A6` |
| Event | Бирюзовый | `#1ABC9C` |
| Product | Розовый | `#E91E63` |

### 10.3. Ключевые компоненты

#### GraphViewer.tsx
- Использует `vis-network` из vis.js
- Физическая симуляция: `barnesHut` (для производительности до ~1000 узлов)
- При клике на узел: подсвечиваются соседние узлы и рёбра, открывается панель деталей
- При клике на ребро: показывается тип отношения и контекст
- Двойной клик: центрирование на узле

#### DocumentUpload.tsx
- Drag-and-drop зона + кнопка выбора файла
- Ограничение: PDF, DOCX, TXT, до 10 МБ
- После загрузки: progress bar с SSE-обновлениями
- По завершении: автоматическое обновление графа

#### QAPanel.tsx
- Текстовое поле + кнопка "Спросить"
- Отображение ответа, Cypher-запроса (в collapsible), raw-данных
- История вопросов в рамках сессии (localStorage)

---

## 11. Конфигурация и настройка

### 11.1. Файл .env

```env
# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme

# Ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=mistral:7b-instruct

# Extraction
CHUNK_SIZE=1200
CHUNK_OVERLAP=150
MAX_RETRIES=3
EXTRACTION_TEMPERATURE=0.1

# QA
QA_TEMPERATURE=0.0
CYPHER_FALLBACK_ENABLED=true

# Normalization
SIMILARITY_THRESHOLD=0.85

# Frontend
VITE_API_URL=http://localhost:8000
```

### 11.2. Конфигурация типов сущностей

Пользователь может указать свои типы сущностей при загрузке документа:

```json
{
  "entity_types": ["Drug", "Disease", "Gene", "Protein", "Symptom"]
}
```

Это модифицирует промпт, заменяя стандартный список типов на пользовательский. Позволяет адаптировать систему под конкретный домен без изменения кода.

---

## 12. Развёртывание

### 12.1. Docker Compose

```yaml
# docker-compose.yml

version: "3.9"

services:
  neo4j:
    image: neo4j:5-community
    ports:
      - "7474:7474"    # Browser
      - "7687:7687"    # Bolt
    environment:
      NEO4J_AUTH: neo4j/${NEO4J_PASSWORD:-changeme}
      NEO4J_PLUGINS: '["apoc"]'
    volumes:
      - neo4j_data:/data
    healthcheck:
      test: ["CMD", "cypher-shell", "-u", "neo4j", "-p", "${NEO4J_PASSWORD:-changeme}", "RETURN 1"]
      interval: 10s
      retries: 5

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    # При первом запуске нужно загрузить модель:
    # docker exec -it kg-builder-ollama-1 ollama pull mistral:7b-instruct

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      neo4j:
        condition: service_healthy
      ollama:
        condition: service_started
    volumes:
      - uploads:/app/uploads

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:8000
    depends_on:
      - backend

volumes:
  neo4j_data:
  ollama_data:
  uploads:
```

### 12.2. Первый запуск

```bash
# 1. Клонировать репозиторий
git clone https://github.com/your-repo/kg-builder.git
cd kg-builder

# 2. Скопировать конфигурацию
cp .env.example .env
# Отредактировать .env при необходимости

# 3. Запустить
docker compose up -d

# 4. Загрузить модель LLM (один раз)
docker exec -it kg-builder-ollama-1 ollama pull mistral:7b-instruct

# 5. Открыть в браузере
# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
# Neo4j Browser: http://localhost:7474
```

### 12.3. Системные требования

| Компонент | Минимум | Рекомендуется |
|-----------|---------|---------------|
| CPU | 4 ядра | 8 ядер |
| RAM | 16 ГБ | 32 ГБ |
| GPU VRAM | 8 ГБ (7B модель) | 16+ ГБ (для 13B+) |
| Диск | 20 ГБ | 50+ ГБ |
| OS | Linux (Docker) | Ubuntu 22.04+ |

Без GPU: можно запустить, но инференс будет в ~10–20 раз медленнее (CPU mode через Ollama).

---

## 13. Тестирование

### 13.1. Unit-тесты

```python
# tests/test_chunking.py
def test_chunking_respects_size():
    service = ChunkingService(chunk_size=100, overlap=20)
    text = "Sentence one. " * 50
    chunks = service.split(text)
    assert all(len(c.text) // 4 <= 120 for c in chunks)  # с запасом

def test_chunking_overlap():
    service = ChunkingService(chunk_size=100, overlap=20)
    text = "Sentence one. Sentence two. Sentence three. " * 20
    chunks = service.split(text)
    for i in range(1, len(chunks)):
        # Конец предыдущего чанка должен пересекаться с началом следующего
        assert chunks[i-1].text[-50:] in chunks[i].text or \
               any(s in chunks[i].text for s in chunks[i-1].text.split(".")[-3:])

# tests/test_normalization.py
def test_alias_normalization():
    service = NormalizationService()
    triplet = Triplet(subject="вшэ", predicate="находится_в", object="Пермь")
    result = service._normalize_entity_names(triplet)
    assert result.subject == "НИУ ВШЭ"

def test_deduplication():
    service = NormalizationService()
    triplets = [
        Triplet(subject="Google", predicate="разработала", object="BERT"),
        Triplet(subject="google", predicate="разработала", object="BERT"),
        Triplet(subject="Google", predicate="создала", object="BERT"),
    ]
    result = service.normalize_triplets(triplets)
    assert len(result) == 1  # все три — одно и то же

# tests/test_extraction.py (с мок-LLM)
@pytest.mark.asyncio
async def test_extraction_parses_json():
    mock_llm = MockLLMClient(response='{"triplets": [{"subject": "A", "predicate": "rel", "object": "B"}]}')
    service = ExtractionService(mock_llm)
    result = await service.extract_from_chunk("Test text", 0, 1)
    assert len(result.triplets) == 1
    assert result.triplets[0].subject == "A"
```

### 13.2. Интеграционные тесты

- Поднимаем Neo4j в Docker (testcontainers)
- Загружаем тестовый документ через API
- Проверяем, что триплеты записались в Neo4j
- Проверяем, что QA возвращает корректные ответы

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
| Ollama для LLM | vLLM, llama.cpp, TGI | Простейшая установка, поддержка GPU/CPU, API совместим с OpenAI |
| Приблизительная токенизация | tiktoken | Не добавляем зависимость; ±10% не критично |
| SequenceMatcher для дедупликации | Embedding similarity | Проще, быстрее; эмбеддинги добавим позже |
| Один label Entity + type | Отдельные labels для типов | Проще MERGE-логика; labels добавляем дополнительно |
| SSE для прогресса | WebSocket | Однонаправленный поток, проще реализация |
| JSON format Ollama | Ручной парсинг | Ollama гарантирует валидный JSON |
| vis.js | D3.js, Cytoscape.js | Лучший баланс функционала и простоты для force-directed |

### 14.2. Известные ограничения

1. **Качество зависит от модели**: 7B модели хуже GPT-4 на сложных текстах. Решение: возможность замены модели.
2. **Нет OCR**: PDF должны содержать текстовый слой. Сканы не поддерживаются.
3. **Нет потоковой обработки**: система обрабатывает документы по одному.
4. **Кореференция ограничена**: простой fuzzy matching. Сложные случаи ("он", "компания", "этот институт") не разрешаются.
5. **Визуализация масштабируется до ~1000 узлов**: для больших графов нужна серверная фильтрация.
6. **Text-to-Cypher не идеален**: на сложных вопросах может генерировать некорректные запросы.

### 14.3. Что НЕ входит в MVP

- Аутентификация и многопользовательский режим
- GraphRAG (community detection, иерархические суммаризации)
- Дообучение LLM (LoRA/QLoRA) — только инструкция в README
- Экспорт графа (RDF, CSV) — добавится позже
- Мультиязычный интерфейс (UI на русском, поддержка RU и EN текстов)
- Batch-обработка множества документов

---

## 15. Дорожная карта

### Phase 1: MVP (2 недели)
- [ ] Backend: FastAPI skeleton, config, CORS
- [ ] Document upload + text extraction (PDF, DOCX, TXT)
- [ ] Chunking service
- [ ] LLM client (Ollama integration)
- [ ] Extraction service + промпты
- [ ] Нормализация (базовая: aliases, dedup)
- [ ] Neo4j service (save, query, stats)
- [ ] API: documents, graph, extraction
- [ ] Frontend: upload, граф (vis.js), базовый UI
- [ ] Docker Compose
- [ ] README с инструкцией запуска

### Phase 2: QA + Polish (1 неделя)
- [ ] QA service (Text-to-Cypher)
- [ ] Fallback-механизм
- [ ] Answer generation
- [ ] Frontend: QA panel, search, filters, stats
- [ ] SSE для прогресса извлечения
- [ ] Обработка ошибок (LLM timeout, bad JSON, Neo4j connection)

### Phase 3: Тестирование и эксперименты (1 неделя)
- [ ] Unit-тесты (chunking, normalization, extraction)
- [ ] Интеграционные тесты (Neo4j, full pipeline)
- [ ] Бенчмарк на 3 типах текстов
- [ ] Сравнение моделей (Mistral 7B vs LLaMA 3 8B)
- [ ] Документация (README, API docs)

### Phase 4: Расширения (после защиты)
- [ ] GraphRAG (community detection + summaries)
- [ ] Embedding-based дедупликация
- [ ] Экспорт (RDF, CSV, JSON-LD)
- [ ] Batch upload
- [ ] Аутентификация

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

```cypher
MERGE (s:Entity {name: "Google"}) ON CREATE SET s.type = "Organization", s.created_at = datetime()
MERGE (o:Entity {name: "BERT"}) ON CREATE SET o.type = "Technology", o.created_at = datetime()
MERGE (s)-[r:RELATES {type: "разработала"}]->(o) ON CREATE SET r.source = "doc_001"
SET s:Organization
SET o:Technology
-- ... и так для каждого триплета
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
