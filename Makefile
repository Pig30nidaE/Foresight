COMPOSE := docker compose

.PHONY: help up down restart logs logs-backend logs-frontend build rebuild ps clean

help:
	@echo "Foresight Docker commands"
	@echo "  make up            - Start backend and frontend in detached mode"
	@echo "  make down          - Stop and remove containers"
	@echo "  make restart       - Restart all services"
	@echo "  make build         - Build images"
	@echo "  make rebuild       - Rebuild images without cache"
	@echo "  make logs          - Tail all service logs"
	@echo "  make logs-backend  - Tail backend logs"
	@echo "  make logs-frontend - Tail frontend logs"
	@echo "  make ps            - Show service status"
	@echo "  make clean         - Stop and remove volumes"

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

ps:
	$(COMPOSE) ps

clean:
	$(COMPOSE) down -v --remove-orphans
