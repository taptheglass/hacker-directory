FROM python:3.13-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src/ src/
COPY templates/ templates/

VOLUME /app/database
ENV DB_FILE=/app/database/hn_links.db
ENV FLASK_ENV=production

EXPOSE 8000

CMD ["uv", "run", "gunicorn", "-b", "0.0.0.0:8000", "src.web:app"]
