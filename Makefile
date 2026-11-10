.PHONY: install dev api web test lint eval build docker

install:
	python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
	cd frontend && npm install

api:
	cd backend && ../.venv/bin/uvicorn app.main:app --reload --port 8000

web:
	cd frontend && npm run dev

test:
	cd backend && ../.venv/bin/pytest -q

lint:
	cd backend && ../.venv/bin/ruff check app tests ../eval
	cd frontend && npm run lint

eval:
	.venv/bin/python eval/run_eval.py

build:
	cd frontend && npm run build

docker:
	docker build -t careroute . && docker run --rm -p 8000:8000 --env-file .env careroute
