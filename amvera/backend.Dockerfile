# Сборка бэкенда для Amvera. Контекст сборки — корень репозитория,
# поэтому пути указаны от корня (backend/...).
# Локальная разработка по-прежнему использует backend/Dockerfile через docker-compose.
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
