FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# stockfish: Debian apt → /usr/games/stockfish
# game_analyzer.py 의 _find_stockfish() 가 /usr/games/stockfish 를 먼저 찾습니다.
RUN apt-get update \
    && apt-get install -y --no-install-recommends stockfish libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && /usr/games/stockfish --version 2>/dev/null || true

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
