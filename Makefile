.DEFAULT_GOAL := help
COMPOSE := docker compose
NODE_RUN := $(COMPOSE) run --rm --no-deps deps

.PHONY: help env up down restart logs ps sh-api install check fix typecheck test reset

help: ## Show commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "Created .env")

up: env ## Start everything (installs deps on first run)
	$(COMPOSE) up -d --build
	@echo ""
	@echo "  Spendid    http://localhost:8600"
	@echo "  API        http://localhost:8601/api/health"
	@echo "  Mailpit    http://localhost:8604"

down: ## Stop everything (keeps data)
	$(COMPOSE) down

restart: ## Restart Node services
	$(COMPOSE) restart api worker web

logs: ## Follow logs (make logs s=api)
	$(COMPOSE) logs -f --tail=100 $(s)

ps: ## Show containers
	$(COMPOSE) ps

sh-api: ## Shell inside the API container
	$(COMPOSE) exec api sh

install: ## Reinstall dependencies after editing a package.json
	$(NODE_RUN) pnpm install
	$(COMPOSE) restart api worker web

check: ## Lint + format check (Biome)
	$(NODE_RUN) pnpm check

fix: ## Auto-fix lint + format
	$(NODE_RUN) pnpm fix

typecheck: ## Type-check every package
	$(NODE_RUN) pnpm typecheck

test: ## Run unit + API tests
	$(NODE_RUN) pnpm test

reset: ## DANGER: stop and delete all data volumes
	@read -p "Delete ALL Spendid data? [y/N] " ok && [ "$$ok" = "y" ]
	$(COMPOSE) down -v
