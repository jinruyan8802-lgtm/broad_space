FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml ./
RUN UV_SYSTEM_PYTHON=1 uv sync
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]