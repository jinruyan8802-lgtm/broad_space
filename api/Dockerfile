FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY api/pyproject.toml api/uv.lock ./
RUN UV_SYSTEM_PYTHON=1 uv sync
COPY api/ .
COPY processor/src/processor ./processor
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]