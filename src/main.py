import argparse
import csv
import os
import sqlite3
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

DB_FILE = os.environ.get("DB_FILE", "database/hn_links.db")


def init_db(db_path):
    """Initialize the SQLite database."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author TEXT NOT NULL,
            comment_url TEXT NOT NULL,
            extracted_link TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(comment_url, extracted_link)
        )
    """)
    conn.commit()
    return conn


def save_to_db(conn, results):
    """Save results to SQLite, updating timestamp on duplicates."""
    cursor = conn.cursor()
    new_count = 0

    for row in results:
        try:
            cursor.execute(
                "INSERT INTO links (author, comment_url, extracted_link) VALUES (?, ?, ?)",
                (row['author'], row['comment_url'], row['extracted_link'])
            )
            new_count += 1
        except sqlite3.IntegrityError:
            cursor.execute(
                "UPDATE links SET updated_at = CURRENT_TIMESTAMP WHERE comment_url = ? AND extracted_link = ?",
                (row['comment_url'], row['extracted_link'])
            )

    conn.commit()
    return new_count


def export_to_csv(conn, filename):
    """Export all database contents to CSV."""
    cursor = conn.cursor()
    cursor.execute("SELECT author, comment_url, extracted_link FROM links ORDER BY id")
    rows = cursor.fetchall()

    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['author', 'comment_url', 'extracted_link'])
        writer.writerows(rows)

    print(f"Exported {len(rows)} links to {filename}")


def scrape_hn_comments(post_id):
    """Scrape top-level comments from a Hacker News post and extract links."""
    base_url = "https://news.ycombinator.com"
    url = f"{base_url}/item?id={post_id}"

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }

    response = requests.get(url, headers=headers)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')

    results = []

    # Find all comment rows - they have class 'athing comtr'
    comment_rows = soup.find_all('tr', class_='athing comtr')

    for row in comment_rows:
        # Check indent level - top-level comments have indent width of 0
        indent_td = row.find('td', class_='ind')
        if not indent_td:
            continue

        indent_img = indent_td.find('img')
        if not indent_img:
            continue

        indent_width = int(indent_img.get('width', 0))

        # Only process top-level comments (indent = 0)
        if indent_width != 0:
            continue

        # Get comment ID for permalink
        comment_id = row.get('id')
        comment_url = f"{base_url}/item?id={comment_id}" if comment_id else ""

        # Get author
        author_elem = row.find('a', class_='hnuser')
        author = author_elem.text if author_elem else "unknown"

        # Get comment text and extract links
        comment_div = row.find('div', class_='commtext')
        if not comment_div:
            continue

        # Find all links in the comment
        links = comment_div.find_all('a', href=True)

        for link in links:
            href = link.get('href', '')

            # Skip reply links and other HN internal links
            if href.startswith('reply?') or href.startswith('user?'):
                continue

            # Make relative URLs absolute
            if href.startswith('/'):
                href = urljoin(base_url, href)

            # Skip if no valid URL
            if not href or href == '#':
                continue

            results.append({
                'author': author,
                'comment_url': comment_url,
                'extracted_link': href,
            })

    return results


def main():
    parser = argparse.ArgumentParser(description="Scrape links from HN comments")
    parser.add_argument("--csv", action="store_true", help="Export results to CSV")
    args = parser.parse_args()

    post_id = "46618714"

    print(f"Scraping HN post: https://news.ycombinator.com/item?id={post_id}")
    print("Fetching top-level comments and extracting links...")

    results = scrape_hn_comments(post_id)

    conn = init_db(DB_FILE)
    new_count = save_to_db(conn, results)

    # Get total count from DB
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM links")
    total_count = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(DISTINCT author) FROM links")
    unique_authors = cursor.fetchone()[0]

    print(f"\nSummary:")
    print(f"  New links added: {new_count}")
    print(f"  Total links in database: {total_count}")
    print(f"  Unique authors: {unique_authors}")

    if args.csv:
        export_to_csv(conn, "hn_links.csv")

    conn.close()


if __name__ == "__main__":
    main()
