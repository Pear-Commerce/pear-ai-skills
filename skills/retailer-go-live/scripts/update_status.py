#!/usr/bin/env python3
"""Update the status column for one retailer in a go-live checklist Markdown file.

Usage:
    python3 update_status.py --checklist go-live-checklist.md --enum aldifr --status zones-imported
"""

import argparse
import re
import sys
from pathlib import Path

VALID_STATUSES = {"pending", "deployed", "zones-imported", "validated", "done"}


def update_status(path, enum, status):
    if status not in VALID_STATUSES:
        print(f"Error: status must be one of {VALID_STATUSES}", file=sys.stderr)
        sys.exit(1)

    content = Path(path).read_text()
    lines = content.splitlines()
    updated = False
    for i, line in enumerate(lines):
        if re.search(rf"^\| [^|]+ \| `{re.escape(enum)}`", line):
            parts = line.split("|")
            if len(parts) >= 11:
                parts[10] = f" {status} "
                lines[i] = "|".join(parts)
                updated = True
                break

    if not updated:
        print(f"Error: retailer with enum {enum} not found in {path}", file=sys.stderr)
        sys.exit(1)

    Path(path).write_text("\n".join(lines) + "\n")
    print(f"Updated {enum} to {status} in {path}")


def main():
    parser = argparse.ArgumentParser(description="Update retailer status in a go-live checklist")
    parser.add_argument("--checklist", required=True, help="Path to the Markdown checklist")
    parser.add_argument("--enum", required=True, help="Retailer enumName")
    parser.add_argument("--status", required=True, help="New status")
    args = parser.parse_args()

    update_status(args.checklist, args.enum, args.status)


if __name__ == "__main__":
    main()
