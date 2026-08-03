from __future__ import annotations

import argparse
import json
import os
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APP = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PATTERN = "*20260801233314.back"
START_DATE = "2026-07-22"
OUTPUT = APP / "accounting" / "data" / "accounting-backup-2026-07-22.js"
REPORT = APP / "data_import_reports" / "accounting-backup-20260801233314-report.json"
EXISTING_DATA = APP / "accounting" / "data" / "revenue-history-2026.js"
GLOBAL_NAME = "BREAKFAST_ACCOUNTING_BACKUP_2026_07_22"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import eligible entries from an Initial accounting .back file.")
    parser.add_argument("source", nargs="?", help="Path to the .back file; auto-detected when omitted.")
    return parser.parse_args()


def find_source(explicit: str | None) -> Path:
    if explicit:
        source = Path(explicit).expanduser().resolve()
        if not source.is_file():
            raise FileNotFoundError(source)
        return source
    matches = sorted(APP.parent.rglob(DEFAULT_SOURCE_PATTERN))
    if len(matches) != 1:
        raise RuntimeError(f"Expected one {DEFAULT_SOURCE_PATTERN}, found {len(matches)}")
    return matches[0]


def sqlite_payload(source: Path) -> bytes:
    archive = source.read_bytes()
    offset = archive.find(b"SQLite format 3\x00")
    if offset < 0:
        raise ValueError("SQLite payload not found in backup")
    page_size = int.from_bytes(archive[offset + 16 : offset + 18], "big")
    if page_size == 1:
        page_size = 65536
    page_count = int.from_bytes(archive[offset + 28 : offset + 32], "big")
    payload = archive[offset : offset + page_size * page_count]
    if len(payload) != page_size * page_count:
        raise ValueError("Truncated SQLite payload")
    return payload


def open_database(source: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    connection.deserialize(sqlite_payload(source))
    connection.row_factory = sqlite3.Row
    return connection


def read_browser_json(path: Path) -> dict[str, Any]:
    source = path.read_text(encoding="utf-8").strip()
    start = source.find("{")
    end = source.rfind("}")
    if start < 0 or end < start:
        raise ValueError(f"Cannot locate JSON object in {path}")
    return json.loads(source[start : end + 1])


def compact_name(value: str | None) -> str:
    return "".join(str(value or "").strip().lower().split())


def normalize_category(value: str | None, row_type: str) -> str:
    raw = str(value or "").strip()
    key = compact_name(raw)
    if row_type == "income":
        if key in {"現金收入", "當日現金營業額", "現金營業額"}:
            return "現金收入"
        if key in {"快一點line", "快一點linepay", "快一點linepay收入", "快一點linepay支付"}:
            return "快一點line pay收入"
        if key in {"linepay", "linepay收入", "linepay經營收入"}:
            return "line Pay經營收入"
        if key in {"uber", "ubereat", "ubereats", "ubereat外送", "uber收入"}:
            return "Uber eat外送"
        if key in {"熊貓", "foodpanda", "foodpanda外送", "熊貓外送"}:
            return "Foodpanda外送"
        if key in {"廢油", "其他", "其他收入"}:
            return "其他收入"
        if key in {"街口", "街口支付", "街口經營收入"}:
            return "街口經營收入"
        if key == "全支付":
            return "全支付"
        return raw or "其他收入"

    aliases = {
        "茶葉廠商": "上統茶葉",
        "上統茶葉": "上統茶葉",
        "萬霖雜糧行": "萬霖",
        "萬霖": "萬霖",
        "寶綠免洗餐具": "寶綠餐具",
        "寶綠餐具": "寶綠餐具",
        "瓦斯桶": "瓦斯費",
        "瓦斯費": "瓦斯費",
        "雜項": "其他雜支",
        "其他雜支": "其他雜支",
    }
    return aliases.get(raw, raw or "其他雜支")


def normalize_group(parent: str | None, category: str, row_type: str) -> str:
    if row_type == "income":
        if category in {"Uber eat外送", "Foodpanda外送"}:
            return "平台收入"
        if category == "其他收入":
            return "其他收入"
        return "現金收入"
    return {
        "食材類別": "食材成本",
        "飲品類別": "飲品成本",
        "雜貨類別": "雜貨成本",
        "公共事業費用": "固定成本",
        "勞健保險": "固定成本",
    }.get(str(parent or ""), "雜支")


def match_key(row: dict[str, Any]) -> tuple[str, str, str, float]:
    row_type = str(row["type"])
    return (
        str(row["date"]),
        row_type,
        compact_name(normalize_category(str(row.get("category") or ""), row_type)),
        round(abs(float(row["amount"])), 2),
    )


def source_rows(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    parents = {row["primaryKey"]: row["name"] for row in connection.execute("SELECT primaryKey, name FROM category")}
    query = """
        SELECT date(t.date, 'unixepoch', '+8 hours') AS entryDate,
               t.primaryKey AS transactionId,
               t.transactionType,
               t.description,
               s.primaryKey AS splitId,
               s.sum AS splitSum,
               s.[index] AS splitIndex,
               c.name AS category,
               c.flowType,
               c.parentPrimaryKey
          FROM transactions t
          JOIN splitTransaction s ON s.transactionsPrimaryKey = t.primaryKey
          JOIN category c ON c.primaryKey = s.categoryPrimaryKey
         WHERE t.isDeleted = 0
           AND date(t.date, 'unixepoch', '+8 hours') >= ?
           AND t.transactionType IN (0, 1)
         ORDER BY t.date, t.primaryKey, s.[index]
    """
    rows = []
    for db_row in connection.execute(query, (START_DATE,)):
        item = dict(db_row)
        item["parent"] = parents.get(item.pop("parentPrimaryKey"))
        rows.append(item)
    return rows


def excluded_rows(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    query = """
        SELECT date(t.date, 'unixepoch', '+8 hours') AS entryDate,
               t.primaryKey AS transactionId,
               t.transactionType,
               t.sum,
               t.secondSum,
               t.description
          FROM transactions t
         WHERE t.isDeleted = 0
           AND date(t.date, 'unixepoch', '+8 hours') >= ?
           AND t.transactionType NOT IN (0, 1)
         ORDER BY t.date, t.primaryKey
    """
    result = []
    for row in connection.execute(query, (START_DATE,)):
        item = dict(row)
        item["reason"] = "帳戶互轉" if item["transactionType"] == 2 else "帳戶餘額調整"
        result.append(item)
    return result


def app_row(source: dict[str, Any], category: str, group: str, row_type: str) -> dict[str, Any]:
    amount = round(abs(float(source["splitSum"])), 2)
    description = str(source.get("description") or "").strip()
    original = str(source.get("category") or "").strip()
    note_parts = ["由初一食午記帳備份匯入"]
    if original != category:
        note_parts.append(f"原分類：{original}")
    if description:
        note_parts.append(description)
    return {
        "id": f"backup-20260801233314-{source['splitId'].lower()}",
        "date": source["entryDate"],
        "type": row_type,
        "group": group,
        "category": category,
        "amount": amount,
        "paymentMethod": "營業收入" if row_type == "income" else "未分類",
        "counterparty": category,
        "note": "；".join(note_parts),
        "source": "accounting-backup",
        "sourceRef": f"初一食午_20260801233314.back・{source['transactionId']}・split {source['splitIndex']}",
        "locked": True,
    }


def sum_by_type(rows: list[dict[str, Any]]) -> dict[str, float]:
    totals = {"income": 0.0, "expense": 0.0}
    for row in rows:
        totals[str(row["type"])] += float(row["amount"])
    return {key: round(value, 2) for key, value in totals.items()}


def main() -> None:
    args = parse_args()
    source = find_source(args.source)
    existing_payload = read_browser_json(EXISTING_DATA)
    existing_rows = list(existing_payload.get("transactions") or [])
    existing_keys = Counter(match_key(row) for row in existing_rows)

    connection = open_database(source)
    raw_rows = source_rows(connection)
    excluded = excluded_rows(connection)
    connection.close()

    imported: list[dict[str, Any]] = []
    matched: list[dict[str, Any]] = []
    audit_rows: list[dict[str, Any]] = []
    for raw in raw_rows:
        row_type = "income" if int(raw["transactionType"]) == 1 else "expense"
        category = normalize_category(raw["category"], row_type)
        group = normalize_group(raw.get("parent"), category, row_type)
        candidate = app_row(raw, category, group, row_type)
        key = match_key(candidate)
        if existing_keys[key] > 0:
            existing_keys[key] -= 1
            status = "matched-existing"
            matched.append(candidate)
        else:
            status = "imported"
            imported.append(candidate)
        audit_rows.append({
            "status": status,
            "date": candidate["date"],
            "type": row_type,
            "sourceCategory": raw["category"],
            "normalizedGroup": group,
            "normalizedCategory": category,
            "amount": candidate["amount"],
            "sourceRef": candidate["sourceRef"],
        })

    imported.sort(key=lambda row: (row["date"], row["type"], row["group"], row["category"], row["id"]))
    source_app_rows = matched + imported
    months: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "sourceEligibleIncome": 0.0,
        "sourceEligibleExpense": 0.0,
        "matchedExistingIncome": 0.0,
        "matchedExistingExpense": 0.0,
        "importedIncome": 0.0,
        "importedExpense": 0.0,
    })
    matched_ids = {row["id"] for row in matched}
    for row in source_app_rows:
        bucket = months[row["date"][:7]]
        bucket[f"sourceEligible{row['type'].title()}"] += row["amount"]
        target = "matchedExisting" if row["id"] in matched_ids else "imported"
        bucket[f"{target}{row['type'].title()}"] += row["amount"]
    reconciliation = []
    for month, values in sorted(months.items()):
        reconciliation.append({"period": month, **{key: round(value, 2) for key, value in values.items()}})

    payload = {
        "id": "accounting-backup-20260801233314-from-2026-07-22-v1",
        "source": source.name,
        "importedFrom": START_DATE,
        "importedThrough": max(row["date"] for row in source_app_rows),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "policy": {
            "dateBoundary": "包含 2026-07-22；使用台灣時間（UTC+8）判定日期。",
            "excluded": "帳戶互轉（transactionType 2）與帳戶餘額調整（transactionType 8）不匯入。",
            "deduplication": "以日期、收支類型、正規化分類與金額比對既有 2026 資料；相符者不重複匯入。",
            "aliases": {
                "快一點line": "快一點line pay收入",
                "line Pay": "line Pay經營收入",
                "廢油": "其他收入",
                "Uber": "Uber eat外送",
                "熊貓": "Foodpanda外送",
            },
        },
        "transactions": imported,
        "reconciliation": reconciliation,
    }

    source_totals = sum_by_type(source_app_rows)
    matched_totals = sum_by_type(matched)
    imported_totals = sum_by_type(imported)
    report = {
        "source": str(source),
        "period": {"from": START_DATE, "through": payload["importedThrough"]},
        "summary": {
            "sourceMainTransactions": len(raw_rows) + len(excluded),
            "eligibleSplitRows": len(raw_rows),
            "matchedExistingRows": len(matched),
            "importedRows": len(imported),
            "excludedRows": len(excluded),
            "excludedTransfers": sum(1 for row in excluded if row["reason"] == "帳戶互轉"),
            "excludedBalanceAdjustments": sum(1 for row in excluded if row["reason"] == "帳戶餘額調整"),
            "sourceEligibleTotals": source_totals,
            "matchedExistingTotals": matched_totals,
            "importedTotals": imported_totals,
        },
        "normalization": payload["policy"]["aliases"],
        "reconciliation": reconciliation,
        "eligibleRows": audit_rows,
        "excludedRows": excluded,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        f"window.{GLOBAL_NAME} = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"Wrote {OUTPUT}")
    print(f"Wrote {REPORT}")


if __name__ == "__main__":
    main()
