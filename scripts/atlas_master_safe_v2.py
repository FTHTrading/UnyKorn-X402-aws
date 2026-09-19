# Source: C:\Users\Kevan\OneDrive - FTH Trading\Desktop\atlas_master_safe_v2.py
# Copied into UnyKorn-X402-aws for Ridgemont / registry integration (dry-run scanner only).
# Do not execute destructive follow-on scripts without operator approval.
"""
UNYKORN Automatic Atlas - Safe Scanner v2

Purpose:
- Read UNYKORN Excel/CSV ledgers from likely folders.
- Import every workbook sheet, not just the first sheet.
- Separate system-like rows from asset/proof rows.
- Scan likely project folders for real codebases.
- Read PM2 status safely.
- Produce dry-run CSV/JSON/Markdown reports.
- DOES NOT move, copy, delete, or launch anything.

Run:
    pip install pandas openpyxl
    py -3 scripts/atlas_master_safe_v2.py
"""

from __future__ import annotations

import csv
import json
import os
import re
import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

try:
    import pandas as pd
except ImportError as exc:
    raise SystemExit(
        "Missing dependency. Run: py -3 -m pip install --user pandas openpyxl"
    ) from exc
except ValueError as exc:
    if "numpy.dtype size changed" in str(exc):
        raise SystemExit(
            "pandas/numpy mismatch. Run: py -3 -m pip install --user --upgrade numpy pandas openpyxl"
        ) from exc
    raise


EMPIRE_ROOT = Path(r"C:\UNYKORN_EMPIRE")
REPORTS_DIR = EMPIRE_ROOT / "99_Reports"

# Ridgemont "Dean's Archive" — hoard PDFs (inventory-only; not parsed at scan time)
ONEDRIVE_DOWNLOADS_HOARD = Path(
    r"C:\Users\Kevan\OneDrive - FTH Trading\11-Downloads"
)
HOARD_PDF_FILENAMES = [
    "Blank 35.pdf",
    "Blank 59.pdf",
    "Blank 79.pdf",
    "Blank 33.pdf",
    "Blank 31.pdf",
    "Blank 6.pdf",
    "master unykorn .pdf",
    # Sensitive — inventory-only; never parse content at scan time
    "wallet old.pdf",
]

# Canonical market-prep ledgers (11-Downloads); always included when present
LEDGER_XLSX_FILENAMES = [
    "unykorn_wallets_systems_ledger.xlsx",
    "unykorn_wallets_systems_ledger_UPDATED_market_prep.xlsx",
    "unykorn_wallets_systems_ledger_UPDATED_market_prep_with_all_urls.xlsx",
    "unykorn_wallets_systems_ledger_UPDATED_market_prep_with_all_urls - Copy.xlsx",
]

SEARCH_ROOTS = [
    Path(r"C:\Users\Kevan\Downloads"),
    Path(r"C:\Users\Kevan\Documents"),
    Path(r"C:\Users\Kevan\Desktop"),
    Path(r"C:\Users\Kevan\OneDrive - FTH Trading"),
]

PROJECT_SCAN_PATHS = [
    Path(r"C:\Users\Kevan\Documents"),
    Path(r"C:\Users\Kevan\Desktop"),
    Path(r"C:\Users\Kevan\OneDrive - FTH Trading"),
    Path(r"C:\Users\Kevan\needai"),
    Path(r"C:\Users\Kevan\portfolio"),
    Path(r"C:\Users\Kevan\troptions"),
    Path(r"C:\Users\Kevan\local-ai-command-center"),
    EMPIRE_ROOT,
]

LEDGER_NAME_HINTS = [
    "unykorn", "ledger", "systems", "wallets", "infrastructure", "market_prep",
    "value_ranked", "system_book", "contracts", "vaults", "solana", "spl",
    "protocol", "gamefi", "admin_wallets", "nft_genie"
]

PROJECT_INDICATORS = [
    "package.json", "pnpm-lock.yaml", "next.config.js", "next.config.ts",
    "Cargo.toml", "requirements.txt", "pyproject.toml", "bot.py",
    "server.js", "app.py", "docker-compose.yml", "README.md", "readme.md"
]

EXCLUDE_DIRS = {
    ".git", ".next", "node_modules", "dist", "build", "target", ".turbo",
    ".vercel", ".netlify", "__pycache__", ".venv", "venv", "env",
    "AppData", "Windows", "Program Files", "Program Files (x86)",
    "$Recycle.Bin", "System Volume Information"
}

SECRET_FILE_PATTERNS = [
    ".env", ".env.local", ".env.production", "id_rsa", "id_ed25519",
    "private", "secret", "seed", "mnemonic", "keystore", "operator-vault",
    "wallet.json", "keypair", ".pem", ".p12"
]

SYSTEM_HINTS = [
    "system", "platform", "os", "rail", "engine", "chain", "protocol",
    "kernel", "portal", "dashboard", "command", "agent", "bot", "workflow",
    "rwa", "proof", "legal", "settlement", "stablecoin", "event", "media",
    "troptions", "unykorn", "fth", "x402", "x407", "apostle", "snp", "tev",
    "truth", "jefe", "ada", "donk", "goat", "wwai", "dignity", "brokerdealer"
]

ASSET_HINTS = [
    "wallet", "address", "mint", "token", "contract", "vault", "erc6551",
    "tld", "namespace", "proof", "ipfs", "tx", "transaction", "hash",
    "admin wallet", "deployer", "owner address", "nft"
]

RISK_HINTS = [
    "stablecoin", "security", "securities", "broker", "dealer", "bank",
    "yield", "roi", "dividend", "investment", "reserve", "gold", "silver",
    "prediction", "betting", "gambling", "adult", "nsfw"
]

CATEGORY_TO_FOLDER = [
    (["payment", "revenue", "x402", "x407", "apostle", "stripe", "invoice"], "03_Payment_Revenue"),
    (["ai", "agent", "bot", "jefe", "ada", "donk", "voice", "knowledge"], "04_AI_Agent_Ops"),
    (["rwa", "asset", "real estate", "carbon", "solar", "collateral"], "05_RWA_Asset_Systems"),
    (["legal", "evidence", "case", "diligence"], "06_Legal_Evidence"),
    (["troptions", "event", "sports", "media", "fifa", "launch", "wwai", "goat"], "07_TROPTIONS_Event_Media"),
    (["portal", "dashboard", "portfolio", "client", "operator"], "08_Portals_Dashboards"),
    (["stablecoin", "settlement", "fthusd", "fthx", "fthg", "swift", "reserve"], "09_Stablecoin_Settlement"),
    (["chain", "l1", "besu", "solana", "xrpl", "contract", "wallet", "blockchain"], "02_Blockchain_Execution_Rails"),
    (["protocol", "proof", "snp", "tev", "truth", "kernel", "spine"], "01_Core_Protocol_Proof"),
]


@dataclass
class ProjectRecord:
    path: str
    has_package_json: bool
    has_pnpm_lock: bool
    has_next_config: bool
    has_cargo_toml: bool
    has_requirements: bool
    has_pyproject: bool
    has_bot_py: bool
    has_server_js: bool
    has_app_py: bool
    has_docker_compose: bool
    has_readme: bool
    secret_warning: bool


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.lower() in {"nan", "none", "null"}:
        return ""
    return text


def slugify(text: str, max_len: int = 70) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip())
    text = re.sub(r"-+", "-", text).strip("-._")
    return (text[:max_len] or "unnamed").lower()


def normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def row_blob(row: Dict[str, Any]) -> str:
    parts = [safe_text(v) for v in row.values()]
    return " ".join([p for p in parts if p])


def likely_name_from_row(row: Dict[str, Any]) -> str:
    candidates = [
        "System Name", "system name", "Name", "name", "System", "system",
        "Title", "title", "Asset", "asset", "Project", "project",
        "Label", "label", "What it is", "what it is", "Description", "description"
    ]

    for key in candidates:
        if key in row and safe_text(row[key]):
            val = safe_text(row[key])
            if len(val) <= 120:
                return val

    # Fall back to the first meaningful short-ish cell.
    for _, value in row.items():
        val = safe_text(value)
        if 2 <= len(val) <= 120 and not val.startswith("http"):
            return val

    return "Unnamed Record"


def safe_rglob(root: Path, glob_pattern: str) -> Iterable[Path]:
    """Walk root for glob_pattern, skipping broken or permission-denied paths."""
    suffix = glob_pattern[1:] if glob_pattern.startswith("*") else glob_pattern
    try:
        walker = os.walk(root, onerror=lambda _e: None)
    except OSError:
        return
    for dirpath, dirnames, filenames in walker:
        dirnames[:] = [
            d for d in dirnames
            if d not in EXCLUDE_DIRS and not d.startswith(".")
        ]
        for name in filenames:
            if name.lower().endswith(suffix.lower()):
                yield Path(dirpath) / name


def find_hoard_pdfs() -> List[Path]:
    """Resolve Ridgemont hoard PDFs under ONEDRIVE_DOWNLOADS_HOARD (no content read)."""
    found: List[Path] = []
    root = ONEDRIVE_DOWNLOADS_HOARD
    if not root.exists():
        return found
    for name in HOARD_PDF_FILENAMES:
        path = root / name
        if path.is_file():
            found.append(path)
    return found


def hoard_pdf_inventory() -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for path in find_hoard_pdfs():
        rows.append({
            "filename": path.name,
            "path": str(path),
            "size_bytes": path.stat().st_size,
            "present": True,
        })
    missing = [n for n in HOARD_PDF_FILENAMES if not (ONEDRIVE_DOWNLOADS_HOARD / n).is_file()]
    for name in missing:
        rows.append({
            "filename": name,
            "path": str(ONEDRIVE_DOWNLOADS_HOARD / name),
            "size_bytes": 0,
            "present": False,
        })
    return rows


def find_explicit_ledgers() -> List[Path]:
    """Resolve canonical ledger workbooks under 11-Downloads (and empire inbox copies)."""
    found: List[Path] = []
    roots = [
        ONEDRIVE_DOWNLOADS_HOARD,
        Path(r"C:\Users\Kevan\UnyKorn-X402-aws\data\empire-inbox"),
        EMPIRE_ROOT / "99_Reports" / "inbox",
    ]
    for root in roots:
        if not root.exists():
            continue
        for name in LEDGER_XLSX_FILENAMES:
            path = root / name
            if path.is_file():
                found.append(path)
    return sorted(set(found), key=lambda p: str(p).lower())


def find_ledgers() -> List[Path]:
    found: List[Path] = list(find_explicit_ledgers())
    for root in SEARCH_ROOTS:
        if not root.exists():
            continue
        for ext in ("*.xlsx", "*.xlsm", "*.csv"):
            for path in safe_rglob(root, ext):
                name = path.name.lower()
                if any(hint in name for hint in LEDGER_NAME_HINTS):
                    # Avoid temporary Excel lock files.
                    if not path.name.startswith("~$"):
                        found.append(path)
    return sorted(set(found), key=lambda p: str(p).lower())


def find_ledgers_market_prep_only() -> List[Path]:
    """Ledgers under 11-Downloads / empire inbox only (new market-prep drop)."""
    return find_explicit_ledgers()


def import_ledgers(files: List[Path]) -> "pd.DataFrame":
    rows: List[Dict[str, Any]] = []

    for file_path in files:
        try:
            if file_path.suffix.lower() == ".csv":
                df = pd.read_csv(file_path, dtype=str, keep_default_na=False)
                sheet_map = {"CSV": df}
            else:
                sheet_map = pd.read_excel(file_path, sheet_name=None, dtype=str, keep_default_na=False)

            for sheet_name, df in sheet_map.items():
                if df is None or df.empty:
                    continue

                for idx, record in enumerate(df.fillna("").to_dict(orient="records"), start=2):
                    record = {safe_text(k): safe_text(v) for k, v in record.items()}
                    record["__source_workbook"] = file_path.name
                    record["__source_path"] = str(file_path)
                    record["__source_sheet"] = safe_text(sheet_name)
                    record["__source_row"] = idx
                    record["__record_name"] = likely_name_from_row(record)
                    rows.append(record)
        except Exception as exc:
            rows.append({
                "__source_workbook": file_path.name,
                "__source_path": str(file_path),
                "__source_sheet": "__IMPORT_ERROR__",
                "__source_row": "",
                "__record_name": f"IMPORT ERROR: {file_path.name}",
                "__error": str(exc),
            })

    return pd.DataFrame(rows)


def classify_record(record: Dict[str, Any]) -> str:
    text = normalize_key(row_blob(record) + " " + safe_text(record.get("__source_sheet")))
    system_score = sum(1 for hint in SYSTEM_HINTS if hint in text)
    asset_score = sum(1 for hint in ASSET_HINTS if hint in text)

    source_sheet = normalize_key(safe_text(record.get("__source_sheet")))

    if any(h in source_sheet for h in ["wallet", "contract", "token", "vault", "namespace", "proof", "ipfs", "tx"]):
        return "asset_or_proof"

    if "system" in source_sheet or "infrastructure" in source_sheet:
        return "system"

    if asset_score > system_score and asset_score >= 1:
        return "asset_or_proof"

    if system_score >= 1:
        return "system"

    return "unknown"


def choose_category(name: str, blob: str) -> Tuple[str, str]:
    text = normalize_key(name + " " + blob)
    for terms, folder in CATEGORY_TO_FOLDER:
        if any(term in text for term in terms):
            return folder, folder
    return "10_Archive_Reference", "10_Archive_Reference"


def get_risk_flag(record: Dict[str, Any]) -> str:
    text = normalize_key(row_blob(record))
    hits = [hint for hint in RISK_HINTS if hint in text]
    if not hits:
        return "standard"
    if any(h in hits for h in ["adult", "nsfw", "betting", "gambling", "prediction"]):
        return "restricted_public_exclude"
    if any(h in hits for h in ["security", "securities", "broker", "dealer", "stablecoin", "reserve", "gold", "silver", "yield", "roi", "dividend", "investment", "bank"]):
        return "regulated_private_diligence"
    return "review"


def scan_projects() -> List[ProjectRecord]:
    projects: Dict[str, ProjectRecord] = {}

    for root in PROJECT_SCAN_PATHS:
        if not root.exists():
            continue

        for current, dirs, files in os.walk(root, onerror=lambda _e: None):
            current_path = Path(current)
            # Prune noisy/sensitive dirs.
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

            file_set = set(files)
            if any(indicator in file_set for indicator in PROJECT_INDICATORS):
                lower_files = [f.lower() for f in file_set]
                secret_warning = any(any(pattern.lower() in f for pattern in SECRET_FILE_PATTERNS) for f in lower_files)

                projects[str(current_path)] = ProjectRecord(
                    path=str(current_path),
                    has_package_json="package.json" in file_set,
                    has_pnpm_lock="pnpm-lock.yaml" in file_set,
                    has_next_config=("next.config.js" in file_set or "next.config.ts" in file_set),
                    has_cargo_toml="Cargo.toml" in file_set,
                    has_requirements="requirements.txt" in file_set,
                    has_pyproject="pyproject.toml" in file_set,
                    has_bot_py="bot.py" in file_set,
                    has_server_js="server.js" in file_set,
                    has_app_py="app.py" in file_set,
                    has_docker_compose="docker-compose.yml" in file_set,
                    has_readme=("README.md" in file_set or "readme.md" in file_set),
                    secret_warning=secret_warning,
                )

    return sorted(projects.values(), key=lambda p: p.path.lower())


def get_pm2_status() -> List[Dict[str, Any]]:
    try:
        res = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=20)
        if res.returncode != 0 or not res.stdout.strip():
            return []
        parsed = json.loads(res.stdout)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


def match_project(system_name: str, system_blob: str, projects: List[ProjectRecord]) -> Tuple[str, str, str]:
    name_terms = [t for t in normalize_key(system_name).split() if len(t) >= 3]
    blob_terms = [t for t in normalize_key(system_blob).split() if len(t) >= 4]
    important_terms = set(name_terms[:8]) | {t for t in blob_terms if t in SYSTEM_HINTS}

    best: Tuple[int, Optional[ProjectRecord], List[str]] = (0, None, [])

    for project in projects:
        p_text = normalize_key(project.path)
        hits = sorted([t for t in important_terms if t in p_text])
        score = len(hits)

        # Boost exact brand / system tokens.
        for special in ["unykorn", "troptions", "x402", "x407", "apostle", "donk", "ada", "jefe", "snp", "tev", "truth", "rwa", "fth"]:
            if special in normalize_key(system_name) and special in p_text:
                score += 3
                if special not in hits:
                    hits.append(special)

        if score > best[0]:
            best = (score, project, hits)

    score, project, hits = best
    if project is None or score == 0:
        return "NOT_FOUND", "none", "No keyword overlap with scanned project paths."

    confidence = "high" if score >= 4 else "medium" if score >= 2 else "low"
    return project.path, confidence, "Matched terms: " + ", ".join(hits[:12])


def match_pm2(system_name: str, project_path: str, pm2_processes: List[Dict[str, Any]]) -> Tuple[str, str]:
    sys_text = normalize_key(system_name)
    path_text = normalize_key(project_path)

    best_score = 0
    best_name = "None"
    best_status = "not_found"

    for proc in pm2_processes:
        name = safe_text(proc.get("name"))
        env = proc.get("pm2_env", {}) if isinstance(proc.get("pm2_env", {}), dict) else {}
        status = safe_text(env.get("status")) or "unknown"
        cwd = safe_text(env.get("pm_cwd"))
        script = safe_text(env.get("pm_exec_path"))
        proc_text = normalize_key(" ".join([name, cwd, script]))

        score = 0
        for term in sys_text.split():
            if len(term) >= 3 and term in proc_text:
                score += 1

        if project_path != "NOT_FOUND" and normalize_key(project_path) in proc_text:
            score += 6

        for special in ["ada", "donk", "x402", "apostle", "jefe", "revenue", "payment", "fth", "unykorn"]:
            if special in sys_text and special in proc_text:
                score += 3

        if score > best_score:
            best_score = score
            best_name = name or "Unnamed PM2 Process"
            best_status = status

    if best_score <= 0:
        return "None", "not_found"

    return best_name, best_status


def build_reports() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    ledgers = find_ledgers()
    raw_df = import_ledgers(ledgers)

    if raw_df.empty:
        raise SystemExit("No ledger rows imported. Put the UNYKORN ledgers in Downloads, Documents, Desktop, or OneDrive - FTH Trading.")

    raw_records = raw_df.fillna("").to_dict(orient="records")
    classified = []
    for rec in raw_records:
        rec["__record_type"] = classify_record(rec)
        rec["__risk_flag"] = get_risk_flag(rec)
        classified.append(rec)

    systems = [r for r in classified if r["__record_type"] == "system"]
    assets = [r for r in classified if r["__record_type"] == "asset_or_proof"]
    unknown = [r for r in classified if r["__record_type"] == "unknown"]

    # Deduplicate system candidates by record name + source sheet class, but keep all raw imports separately.
    deduped_systems: Dict[str, Dict[str, Any]] = {}
    for rec in systems:
        key = slugify(safe_text(rec.get("__record_name")))
        if key not in deduped_systems:
            deduped_systems[key] = rec

    system_records = list(deduped_systems.values())

    projects = scan_projects()
    pm2_processes = get_pm2_status()

    dry_run_rows: List[Dict[str, Any]] = []
    for i, rec in enumerate(system_records, start=1):
        system_name = safe_text(rec.get("__record_name")) or f"Unnamed System {i}"
        blob = row_blob(rec)
        folder_group, category = choose_category(system_name, blob)
        sys_id = f"SYS-{i:03d}"
        project_path, confidence, reason = match_project(system_name, blob, projects)
        pm2_name, pm2_status = match_pm2(system_name, project_path, pm2_processes)
        risk_flag = safe_text(rec.get("__risk_flag")) or "standard"

        suggested = str(EMPIRE_ROOT / folder_group / f"{sys_id}-{slugify(system_name)}")

        project_obj = next((p for p in projects if p.path == project_path), None)

        dry_run_rows.append({
            "System ID": sys_id,
            "System Name": system_name,
            "Category": category,
            "Source Workbook": safe_text(rec.get("__source_workbook")),
            "Source Sheet": safe_text(rec.get("__source_sheet")),
            "Source Row": safe_text(rec.get("__source_row")),
            "Current Path": project_path,
            "Suggested Empire Folder": suggested,
            "Public URL": first_url(blob),
            "Local URL": first_local_url(blob),
            "PM2 Name": pm2_name,
            "PM2 Status": pm2_status,
            "Has package.json": bool(project_obj.has_package_json) if project_obj else False,
            "Has Cargo.toml": bool(project_obj.has_cargo_toml) if project_obj else False,
            "Has bot.py": bool(project_obj.has_bot_py) if project_obj else False,
            "Has docker-compose": bool(project_obj.has_docker_compose) if project_obj else False,
            "Has README": bool(project_obj.has_readme) if project_obj else False,
            "Secret File Warning": bool(project_obj.secret_warning) if project_obj else False,
            "Risk Flag": risk_flag,
            "Confidence": confidence,
            "Reason": reason,
            "Next Action": next_action(project_path, pm2_status, risk_flag),
        })

    # Exports
    pd.DataFrame(classified).to_csv(REPORTS_DIR / "UNYKORN_ATLAS_RAW_IMPORT.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(system_records).to_csv(REPORTS_DIR / "UNYKORN_ATLAS_SYSTEMS_ONLY.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(assets).to_csv(REPORTS_DIR / "UNYKORN_ATLAS_ASSETS_ONLY.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(unknown).to_csv(REPORTS_DIR / "UNYKORN_ATLAS_UNKNOWN_ROWS.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame([asdict(p) for p in projects]).to_csv(REPORTS_DIR / "UNYKORN_ATLAS_PROJECT_FOLDERS.csv", index=False, encoding="utf-8-sig")
    pd.DataFrame(dry_run_rows).to_csv(REPORTS_DIR / "UNYKORN_FOLDER_DRY_RUN.csv", index=False, encoding="utf-8-sig")

    with open(REPORTS_DIR / "UNYKORN_ATLAS_PM2_STATUS.json", "w", encoding="utf-8") as f:
        json.dump(pm2_processes, f, indent=2)

    with open(REPORTS_DIR / "UNYKORN_ATLAS_LEDGER_FILES.json", "w", encoding="utf-8") as f:
        json.dump([str(p) for p in ledgers], f, indent=2)

    hoard_pdfs = find_hoard_pdfs()
    hoard_rows = hoard_pdf_inventory()
    with open(REPORTS_DIR / "UNYKORN_ATLAS_HOARD_PDFS.json", "w", encoding="utf-8") as f:
        json.dump(hoard_rows, f, indent=2)

    online = sum(1 for p in pm2_processes if safe_text((p.get("pm2_env") or {}).get("status")) == "online")
    errored = sum(1 for p in pm2_processes if safe_text((p.get("pm2_env") or {}).get("status")) in {"errored", "stopped"})

    matched = sum(1 for r in dry_run_rows if r["Current Path"] != "NOT_FOUND")
    missing = len(dry_run_rows) - matched
    private_risk = sum(1 for r in dry_run_rows if r["Risk Flag"] != "standard")

    top_missing = [r for r in dry_run_rows if r["Current Path"] == "NOT_FOUND"][:20]
    top_private = [r for r in dry_run_rows if r["Risk Flag"] != "standard"][:20]
    top_pm2_missing = [r for r in dry_run_rows if r["PM2 Name"] == "None"][:20]

    report = [
        "# UNYKORN Automatic Atlas Health Report",
        "",
        "## Summary",
        f"- Ledger files found: {len(ledgers)}",
        f"- Total workbook rows imported: {len(classified)}",
        f"- Deduped system candidates: {len(system_records)}",
        f"- Asset/proof records: {len(assets)}",
        f"- Unknown rows needing review: {len(unknown)}",
        f"- Project folders found: {len(projects)}",
        f"- PM2 processes found: {len(pm2_processes)}",
        f"- PM2 online: {online}",
        f"- PM2 stopped/errored: {errored}",
        f"- Systems matched to folders: {matched}",
        f"- Systems missing folder match: {missing}",
        f"- Systems with private/regulatory risk flags: {private_risk}",
        f"- Hoard PDFs present ({ONEDRIVE_DOWNLOADS_HOARD}): {len(hoard_pdfs)} / {len(HOARD_PDF_FILENAMES)}",
        "",
        "## Dean's Archive (11-Downloads hoard)",
        f"- Root: `{ONEDRIVE_DOWNLOADS_HOARD}`",
        f"- Canonical protocol ledger: `master unykorn .pdf`",
        f"- Master stack registry: `Blank 6.pdf`",
        "",
    ]
    for row in hoard_rows:
        flag = "OK" if row["present"] else "MISSING"
        report.append(f"- [{flag}] {row['filename']} ({row['size_bytes']:,} bytes)")
    report.extend([
        "",
        "## Files Created",
        "- UNYKORN_ATLAS_RAW_IMPORT.csv",
        "- UNYKORN_ATLAS_SYSTEMS_ONLY.csv",
        "- UNYKORN_ATLAS_ASSETS_ONLY.csv",
        "- UNYKORN_ATLAS_UNKNOWN_ROWS.csv",
        "- UNYKORN_ATLAS_PROJECT_FOLDERS.csv",
        "- UNYKORN_FOLDER_DRY_RUN.csv",
        "- UNYKORN_ATLAS_PM2_STATUS.json",
        "- UNYKORN_ATLAS_LEDGER_FILES.json",
        "- UNYKORN_ATLAS_HOARD_PDFS.json",
        "- UNYKORN_ATLAS_HEALTH_REPORT.md",
        "",
        "## Top Systems Missing Folder Match",
    ])

    for r in top_missing:
        report.append(f"- {r['System ID']} â€” {r['System Name']}")

    report.extend(["", "## Top Systems Missing PM2 Match"])
    for r in top_pm2_missing:
        report.append(f"- {r['System ID']} â€” {r['System Name']} â€” folder: {r['Current Path']}")

    report.extend(["", "## Top Private/Regulated Risk Items"])
    for r in top_private:
        report.append(f"- {r['System ID']} â€” {r['System Name']} â€” {r['Risk Flag']}")

    report.extend([
        "",
        "## Next Steps",
        "1. Review UNYKORN_FOLDER_DRY_RUN.csv.",
        "2. Fix any wrong matches manually in the CSV.",
        "3. Do not copy/move files until the dry run is reviewed.",
        "4. Generate an APPLY_FOLDER_STRUCTURE.ps1 from reviewed rows only.",
        "5. Launch PM2 only for rows where Has bot.py is TRUE or the project has a known start command.",
    ])

    (REPORTS_DIR / "UNYKORN_ATLAS_HEALTH_REPORT.md").write_text("\n".join(report), encoding="utf-8")

    print("")
    print("OK: UNYKORN Automatic Atlas complete.")
    print(f"Reports directory: {REPORTS_DIR}")
    print(f"Ledger files found: {len(ledgers)}")
    print(f"Workbook rows imported: {len(classified)}")
    print(f"Deduped systems: {len(system_records)}")
    print(f"Asset/proof rows: {len(assets)}")
    print(f"Project folders found: {len(projects)}")
    print(f"PM2 processes found: {len(pm2_processes)}")
    print(f"Systems matched to folders: {matched}")
    print(f"Systems missing folder match: {missing}")
    print(f"Hoard PDFs: {len(hoard_pdfs)} / {len(HOARD_PDF_FILENAMES)} under {ONEDRIVE_DOWNLOADS_HOARD}")


def first_url(text: str) -> str:
    matches = re.findall(r"https?://[^\s,;\"')]+", text)
    for m in matches:
        if "localhost" not in m and "127.0.0.1" not in m:
            return m
    return ""


def first_local_url(text: str) -> str:
    matches = re.findall(r"https?://[^\s,;\"')]+", text)
    for m in matches:
        if "localhost" in m or "127.0.0.1" in m:
            return m
    return ""


def next_action(project_path: str, pm2_status: str, risk_flag: str) -> str:
    if risk_flag != "standard":
        return "Private diligence / legal-risk review before public use"
    if project_path == "NOT_FOUND":
        return "Find or attach local folder/repo"
    if pm2_status in {"online"}:
        return "Verify endpoint and attach proof screenshot/log"
    if pm2_status in {"stopped", "errored"}:
        return "Fix PM2 process and restart after path verification"
    return "Review folder match, then decide PM2/start command"


if __name__ == "__main__":
    print("UNYKORN Atlas safe v2 — starting (dry-run, no file moves)...")
    print(f"Reports will be written to: {REPORTS_DIR}")
    build_reports()

