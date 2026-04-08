FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update \
	&& apt-get install -y --no-install-recommends stockfish libmagic1 \
	&& mkdir -p /opt/homebrew/bin \
	&& ln -sf /usr/games/stockfish /opt/homebrew/bin/stockfish \
	&& rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# chessimg2pos pulls torchvision from PyPI; mismatched torch/torchvision causes
# "RuntimeError: operator torchvision::nms does not exist". Install matching CPU wheels twice:
# before deps (so pip resolves torch first) and after (overwrite any PyPI torchvision).
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --upgrade torch torchvision --index-url https://download.pytorch.org/whl/cpu

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
