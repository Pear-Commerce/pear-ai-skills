#!/usr/bin/env python3
"""Generate a Markdown go-live checklist for a batch of landed retailers.

Usage:
    python3 generate_checklist.py --retailers aldifr,auchanfr,carrefourfr --output go-live-checklist.md

The script uses the inventory template embedded in the skill. If a retailer is not in the
known list, a blank row is emitted for manual filling.
"""

import argparse
import sys
from pathlib import Path

KNOWN_RETAILERS = [
    {
        "retailer": "Aldi France",
        "enum": "aldifr",
        "updater": "com.pear.itemurlupdater.fr.AldiAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "yes",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Amazon FR",
        "enum": "amazonfr",
        "updater": "com.pear.itemurlupdater.fr.AmazonAvailabilityUpdater",
        "store_importer": "no",
        "zip_dep": "no",
        "ship_home": "yes",
        "live": "yes",
        "country": "FR",
        "special": "Country-wide * coverage",
    },
    {
        "retailer": "Auchan France",
        "enum": "auchanfr",
        "updater": "com.pear.retailintegrations.auchan.AuchanAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Boulanger France",
        "enum": "boulangerfr",
        "updater": "com.pear.itemurlupdater.fr.BoulangerAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "—",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Carrefour France",
        "enum": "carrefourfr",
        "updater": "com.pear.itemurlupdater.fr.CarrefourAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Chronodrive France",
        "enum": "chronodrivefr",
        "updater": "com.pear.retailintegrations.fr.chronodrive.ChronodriveBatchAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "CoursesU",
        "enum": "coursesu",
        "updater": "com.pear.retailintegrations.fr.coursesu.CoursesUAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Intermarché France",
        "enum": "intermarchefr",
        "updater": "com.pear.retailintegrations.fr.intermarche.IntermarcheFranceAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Lidl France",
        "enum": "lidlfr",
        "updater": "com.pear.lidl.LidlAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "yes",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Maxi Zoo France",
        "enum": "maxizoofr",
        "updater": "com.pear.itemurlupdater.fr.MaxiZooAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "—",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Monoprix Courses",
        "enum": "monoprix_courses_fr",
        "updater": "com.pear.retailintegrations.fr.monoprixcourses.MonoprixCoursesAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "no",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
    {
        "retailer": "Naturalia France",
        "enum": "naturaliafr",
        "updater": "com.pear.itemurlupdater.fr.NaturaliaAvailabilityUpdater",
        "store_importer": "yes",
        "zip_dep": "yes",
        "ship_home": "yes",
        "live": "yes",
        "country": "FR",
        "special": "none",
    },
]

KNOWN_ENUMS = {r["enum"]: r for r in KNOWN_RETAILERS}
KNOWN_NAMES = {r["retailer"]: r for r in KNOWN_RETAILERS}


def render_retailer_row(r):
    return (
        f"| {r['retailer']} | `{r['enum']}` | `{r['updater']}` | {r['store_importer']} | "
        f"{r['zip_dep']} | {r['ship_home']} | {r['live']} | {r['country']} | {r['special']} | pending |"
    )


def generate(enum_list, include_all=False):
    lines = [
        "# Retailer Go-Live Checklist",
        "",
        "| Retailer | enumName | Updater class | Has store importer | itemAvailabilityDependsOnZip | locationAgnosticShipToHome | live | Country | Special zone import | Status |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]

    if include_all:
        rows = KNOWN_RETAILERS
    elif enum_list:
        rows = []
        for enum in enum_list:
            if enum in KNOWN_ENUMS:
                rows.append(KNOWN_ENUMS[enum])
            else:
                rows.append({
                    "retailer": "",
                    "enum": enum,
                    "updater": "",
                    "store_importer": "",
                    "zip_dep": "",
                    "ship_home": "",
                    "live": "",
                    "country": "",
                    "special": "",
                })
    else:
        rows = []

    lines.extend(render_retailer_row(r) for r in rows)
    lines.append("")
    lines.append("## Workflow steps")
    lines.append("")
    lines.append("1. Deploy branch to sandbox-peter-2026.")
    lines.append("2. For each retailer marked pending, run `importStoresFromRetailer()` in the sandbox.")
    lines.append("3. Validate via JSP availability probe, retailer-list API, and browser click-through.")
    lines.append("4. Deploy to production and repeat import/validation.")
    lines.append("5. Mark retailer as `done` after production validation passes.")
    lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Generate a retailer go-live checklist")
    parser.add_argument("--retailers", help="Comma-separated enum names (e.g. aldifr,auchanfr)")
    parser.add_argument("--all", action="store_true", help="Include all known French retailers")
    parser.add_argument("-o", "--output", help="Output Markdown file path")
    args = parser.parse_args()

    if not args.retailers and not args.all:
        print("Error: provide --retailers or --all", file=sys.stderr)
        sys.exit(1)

    enum_list = [e.strip() for e in args.retailers.split(",")] if args.retailers else []
    markdown = generate(enum_list, include_all=args.all)

    if args.output:
        Path(args.output).write_text(markdown)
        print(f"Wrote checklist to {args.output}")
    else:
        print(markdown)


if __name__ == "__main__":
    main()
