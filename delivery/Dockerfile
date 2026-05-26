FROM python:3.12-slim

WORKDIR /app

# Copy source code first (needed for editable install)
COPY src/ ./src/
COPY templates/ ./templates/

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock .

# Install uv and dependencies
RUN pip install --no-cache-dir uv && uv pip install --system -e .

EXPOSE 8081

CMD ["python", "-m", "delivery", "--mode", "scheduler"]