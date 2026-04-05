#!/usr/bin/env python3
"""
publish-devto.py — Publish a docs/blog/*.md file to dev.to via API.

Usage:
    python3 scripts/publish-devto.py docs/blog/01-why-the-machine-web.md
    python3 scripts/publish-devto.py docs/blog/08-how-to-add-paid-access.md --published

Requires: DEVTO_API_KEY environment variable
    Get it at: https://dev.to/settings/extensions → Generate API Key
"""
import os
import re
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

# ── Tag map (post-number → dev.to tags, max 4) ──────────────────────────────
TAG_MAP = {
    "01": ["webdev", "api", "machinelearning", "blockchain"],
    "02": ["webdev", "api", "security", "ai"],
    "03": ["webdev", "api", "tutorial", "ai"],
    "04": ["enterprise", "api", "ai", "compliance"],
    "05": ["webdev", "blockchain", "compliance", "ai"],
    "06": ["webdev", "api", "monetization", "saas"],
    "07": ["webdev", "api", "ai", "economy"],
    "08": ["tutorial", "webdev", "api", "devops"],
    "09": ["webdev", "api", "monetization", "pricing"],
    "10": ["webdev", "api", "enterprise", "saas"],
    "11": ["tutorial", "webdev", "api", "monetization"],
    "12": ["webdev", "blockchain", "api", "compliance"],
}

SERIES = "x402 — The Machine Payment Protocol"
CANONICAL_BASE = "https://x402api.unykorn.org/blog"


def slug_from_path(path: str) -> str:
    name = os.path.basename(path).replace(".md", "")
    return name


def extract_title(content: str, fallback: str) -> str:
    m = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if m:
        return m.group(1).strip()
    return fallback.replace("-", " ").title()


def strip_frontmatter(content: str) -> str:
    if content.startswith("---"):
        end = content.find("---", 3)
        if end != -1:
            return content[end + 3 :].lstrip("\n")
    return content


def publish(file_path: str, published: bool, retries: int = 3) -> dict:
    api_key = os.environ.get("DEVTO_API_KEY", "").strip()
    if not api_key:
        raise ValueError("DEVTO_API_KEY environment variable is not set")

    with open(file_path, "r", encoding="utf-8") as f:
        raw = f.read()

    content = strip_frontmatter(raw)
    slug = slug_from_path(file_path)
    title = extract_title(content, slug)

    num_match = re.match(r"(\d+)-", os.path.basename(file_path))
    num = num_match.group(1) if num_match else ""
    tags = TAG_MAP.get(num, ["webdev", "api", "ai", "blockchain"])

    payload = json.dumps(
        {
            "article": {
                "title": title,
                "body_markdown": content,
                "published": published,
                "tags": tags[:4],
                "series": SERIES,
                "canonical_url": f"{CANONICAL_BASE}/{slug}",
            }
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://dev.to/api/articles",
        data=payload,
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "User-Agent": "UnyKorn-x402-devto-publisher/1.0",
        },
        method="POST",
    )

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and attempt < retries:
                wait = 5 * attempt
                print(f"  Rate limited. Waiting {wait}s before retry {attempt}/{retries}...")
                time.sleep(wait)
                continue
            raise RuntimeError(f"dev.to API error {e.code}: {body}") from e


def main():
    parser = argparse.ArgumentParser(description="Publish a blog post to dev.to")
    parser.add_argument("file", help="Path to markdown file in docs/blog/")
    parser.add_argument(
        "--published",
        action="store_true",
        help="Publish immediately (default: save as draft)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    print(f"  File:      {args.file}")
    print(f"  Published: {args.published}")

    try:
        result = publish(args.file, args.published)
    except (RuntimeError, ValueError) as exc:
        print(f"Failed: {exc}", file=sys.stderr)
        sys.exit(1)

    state = "published" if result.get("published") else "draft"
    print(f"  OK [{state}]: {result.get('url', '?')}")
    print(f"  ID: {result.get('id')}  Title: {result.get('title')}")


if __name__ == "__main__":
    main()
