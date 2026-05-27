FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY api/pyproject.toml api/uv.lock ./
RUN uv export --no-hashes --no-dev -o requirements.txt && pip install --no-cache-dir -r requirements.txt
COPY api/ .
COPY processor/src/processor ./processor
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
