import atexit
import logging
import os
import sqlite3

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, Response, render_template, request

from src.main import init_db, save_to_db, scrape_hn_comments

app = Flask(__name__, template_folder="../templates")
DB_FILE = os.environ.get("DB_FILE", "database/hn_links.db")
PER_PAGE = 50
POST_ID = "46618714"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_scraper():
    """Scheduled job to scrape HN and save to database."""
    logger.info("Starting scheduled scrape...")
    try:
        results = scrape_hn_comments(POST_ID)
        conn = init_db(DB_FILE)
        new_count = save_to_db(conn, results)
        conn.close()
        logger.info(f"Scrape complete: {new_count} new links added")
    except Exception as e:
        logger.error(f"Scrape failed: {e}")


scheduler = BackgroundScheduler()
scheduler.add_job(func=run_scraper, trigger="interval", hours=1, id="hn_scraper")
scheduler.start()
atexit.register(lambda: scheduler.shutdown())

run_scraper()


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def escape_like(s):
    """Escape special characters for LIKE queries."""
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.route("/")
def index():
    page = request.args.get("page", 1, type=int)
    search = request.args.get("q", "").strip()
    offset = (page - 1) * PER_PAGE

    conn = get_db()
    cursor = conn.cursor()

    if search:
        escaped_search = f"%{escape_like(search)}%"
        cursor.execute(
            """SELECT COUNT(*) FROM links
               WHERE author LIKE ? ESCAPE '\\'
               OR extracted_link LIKE ? ESCAPE '\\'""",
            (escaped_search, escaped_search)
        )
        total = cursor.fetchone()[0]

        cursor.execute(
            """SELECT author, comment_url, extracted_link, updated_at FROM links
               WHERE author LIKE ? ESCAPE '\\'
               OR extracted_link LIKE ? ESCAPE '\\'
               ORDER BY updated_at DESC
               LIMIT ? OFFSET ?""",
            (escaped_search, escaped_search, PER_PAGE, offset)
        )
    else:
        cursor.execute("SELECT COUNT(*) FROM links")
        total = cursor.fetchone()[0]

        cursor.execute(
            """SELECT author, comment_url, extracted_link, updated_at FROM links
               ORDER BY updated_at DESC
               LIMIT ? OFFSET ?""",
            (PER_PAGE, offset)
        )

    links = cursor.fetchall()
    conn.close()

    total_pages = (total + PER_PAGE - 1) // PER_PAGE

    return render_template(
        "index.html",
        links=links,
        page=page,
        total_pages=total_pages,
        total=total,
        search=search,
    )


@app.route("/download.csv")
def download_csv():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT author, comment_url, extracted_link FROM links ORDER BY id")
    rows = cursor.fetchall()
    conn.close()

    def generate():
        yield "author,comment_url,extracted_link\n"
        for row in rows:
            author = row["author"].replace('"', '""')
            comment_url = row["comment_url"].replace('"', '""')
            link = row["extracted_link"].replace('"', '""')
            yield f'"{author}","{comment_url}","{link}"\n'

    return Response(
        generate(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=hn_links.csv"},
    )


if __name__ == "__main__":
    app.run(debug=True)
