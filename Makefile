COMPOSE := docker compose
DB_SERVICE := db
DB_USER := foresight
DB_NAME := foresight
DB_URL_SYNC_HOST := postgresql://foresight:foresight@localhost:5432/foresight

.PHONY: help up down restart logs logs-backend logs-frontend logs-db build rebuild ps clean db-wait db-migrate db-migrate-host db-psql db-reset-dev nuke-stale azure-api-redeploy azure-api-redeploy-preview

help:
	@echo "Foresight Docker commands"
	@echo "  make up              - Start db, backend, frontend in detached mode"
	@echo "  make down            - Stop and remove containers"
	@echo "  make restart         - Restart all services"
	@echo "  make build           - Build images"
	@echo "  make rebuild         - Rebuild images without cache"
	@echo "  make logs            - Tail all service logs"
	@echo "  make logs-backend    - Tail backend logs"
	@echo "  make logs-frontend   - Tail frontend logs"
	@echo "  make logs-db         - Tail database logs"
	@echo "  make ps              - Show service status"
	@echo "  make clean           - Stop and remove volumes"
	@echo "  make db-wait         - Wait until postgres is healthy"
	@echo "  make db-migrate      - Run Alembic upgrade head in backend container"
	@echo "  make db-migrate-host - Run Alembic from host using localhost:5432"
	@echo "  make db-psql         - Open psql shell in db container"
	@echo "  make db-reset-dev    - Reset DB (dev only, requires APP_ENV=development CONFIRM_RESET=YES)"
	@echo "  make nuke-stale      - Remove legacy named containers"
	@echo "  make azure-api-redeploy         - Build API image, push (tag=git sha), update Container App"
	@echo "  make azure-api-redeploy-preview - Preview only: tag preview, app foresight-api, Azure label environment=preview"

up:
	$(COMPOSE) up -d --build

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) build --no-cache

down:
	$(COMPOSE) down

restart: down up

logs:
	$(COMPOSE) logs -f

logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

logs-db:
	$(COMPOSE) logs -f $(DB_SERVICE)

ps:
	$(COMPOSE) ps

clean:
	$(COMPOSE) down -v --remove-orphans

db-wait:
	@echo "Waiting for Postgres to be healthy..."
	@for i in $$(seq 1 60); do \
		STATUS=$$($(COMPOSE) ps --format json | python3 -c "import sys, json; data=json.load(sys.stdin); print(next((x.get('Health','') for x in data if x.get('Service')=='$(DB_SERVICE)'), ''))"); \
		if [ "$$STATUS" = "healthy" ]; then echo "Postgres is healthy"; exit 0; fi; \
		sleep 1; \
	done; \
	echo "Postgres did not become healthy in time"; exit 1

db-migrate: db-wait
	$(COMPOSE) exec backend alembic -c alembic.ini upgrade head

db-migrate-host:
	cd backend && DATABASE_URL_SYNC=$(DB_URL_SYNC_HOST) alembic -c alembic.ini upgrade head

db-psql:
	$(COMPOSE) exec $(DB_SERVICE) psql -U $(DB_USER) -d $(DB_NAME)

db-reset-dev:
	@if [ "$$APP_ENV" != "development" ]; then echo "Refusing reset: APP_ENV must be development"; exit 1; fi
	@if [ "$$CONFIRM_RESET" != "YES" ]; then echo "Refusing reset: set CONFIRM_RESET=YES"; exit 1; fi
	$(COMPOSE) exec backend python -c "import asyncio; from app.db.session import engine; from app.db.base import Base; exec(\"async def run():\\n    async with engine.begin() as conn:\\n        await conn.run_sync(Base.metadata.drop_all)\\n        await conn.run_sync(Base.metadata.create_all)\"); asyncio.run(run())"
	$(COMPOSE) exec backend alembic -c alembic.ini upgrade head

nuke-stale:
	-docker rm -f foresight-db foresight-backend foresight-frontend

azure-api-redeploy:
	./scripts/azure-rebuild-api.sh

azure-api-redeploy-preview:
	AZ_DEPLOY_TARGET=preview ./scripts/azure-rebuild-api.sh
