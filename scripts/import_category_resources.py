"""Validate the supplied category map and import its WebP resources."""

import argparse
import csv
import hashlib
import io
import json
import re
import subprocess
import zipfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DRAFT = "3D拼版裁切初稿"
PLACEHOLDER = "临时轻量图标（非专属3D）"
MEMORIAL = {"memorial-create", "memorial-manage", "memorial-remembrance"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--zip", type=Path, required=True)
    args = parser.parse_args()
    with args.csv.open(encoding="utf-8-sig", newline="") as source:
        rows = list(csv.DictReader(source))
    catalog = json.loads(subprocess.check_output(
        ["node", "-e", "process.stdout.write(JSON.stringify(require('./miniprogram/utils/classification-contract').projects))"],
        cwd=ROOT, encoding="utf-8"
    ))
    projects = {item["id"]: item for item in catalog}
    identifiers = [row["category_id"] for row in rows]
    if len(set(identifiers)) != len(rows) or set(identifiers) != set(projects):
        raise ValueError("Category IDs must match the existing catalog exactly")
    statuses = Counter(row["asset_status"] for row in rows)
    if set(statuses) - {DRAFT, PLACEHOLDER}:
        raise ValueError("Unknown asset stage")

    resources = {}
    records = []
    with zipfile.ZipFile(args.zip) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entry")
        zipped_maps = [name for name in names if name.lower().endswith('.csv')]
        if len(zipped_maps) != 1:
            raise ValueError("Expected one source mapping inside the ZIP")
        zipped_rows = list(csv.DictReader(io.StringIO(archive.read(zipped_maps[0]).decode('utf-8-sig'))))
        if zipped_rows != rows:
            raise ValueError("Standalone CSV and ZIP mapping differ")
        for row in rows:
            project = projects[row["category_id"]]
            for column, key in [("category_name", "name"), ("industry_id", "categoryId"),
                                ("industry_name", "categoryName"), ("group_id", "groupId")]:
                if row[column] != project[key]:
                    raise ValueError(f"Catalog mismatch for {project['id']} in {column}")
            expected = f"assets/categories/{project['categoryId']}/{project['id']}.webp"
            if row["asset_path"] != expected:
                raise ValueError(f"Unexpected asset path for {project['id']}")
            info = archive.getinfo(expected)
            if info.file_size > 1024 * 1024:
                raise ValueError(f"Oversized resource {expected}")
            data = archive.read(info)
            if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
                raise ValueError(f"Invalid WebP signature {expected}")
            resources[expected] = data
            records.append({**row, "runtime_path": "/category-art/" + expected,
                            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        for identifier in sorted(MEMORIAL):
            name = f"assets/memorial/{identifier}.webp"
            resources[name] = archive.read(name)
    image_bytes = sum(map(len, resources.values()))
    if image_bytes >= 2 * 1024 * 1024:
        raise ValueError("The resource subpackage exceeds 2 MiB")

    destination = ROOT / "miniprogram/category-art"
    for name, data in resources.items():
        if not re.fullmatch(r"assets/(categories/C\d{2}/C\d{2}G\d{2}S\d{2}|memorial/memorial-[a-z]+)\.webp", name):
            raise ValueError("Unexpected destination")
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_bytes() != data:
            target.write_bytes(data)

    package_bytes = sum(file.stat().st_size for file in destination.rglob('*') if file.is_file())
    if package_bytes >= 2 * 1024 * 1024:
        raise ValueError("The complete resource subpackage exceeds 2 MiB")

    draft_ids = [row["category_id"] for row in rows if row["asset_status"] == DRAFT]
    draft_file = ROOT / "miniprogram/data/category-art-drafts.js"
    draft_source = ("// Imported asset stages. Update through scripts/import_category_resources.py.\n"
                    "module.exports=" + json.dumps(draft_ids, separators=(",", ":")) + ";\n")
    if not draft_file.exists() or draft_file.read_text(encoding='utf-8') != draft_source:
        draft_file.write_text(draft_source, encoding="utf-8")
    report = {
        "csvSha256": hashlib.sha256(args.csv.read_bytes()).hexdigest(),
        "zipSha256": hashlib.sha256(args.zip.read_bytes()).hexdigest(),
        "counts": {"projects": len(rows), "draft3d": statuses[DRAFT],
                   "placeholder": statuses[PLACEHOLDER], "memorialPlaceholders": len(MEMORIAL)},
        "imageBytes": image_bytes,
        "resourceSubpackageBytes": package_bytes,
        "existingHousingOverrides": ["C05G01S01", "C05G01S02", "C05G01S03", "C05G01S04", "C05G01S05"],
        "items": records,
    }
    report_file = ROOT / "docs/design/category-resources-2026-11-15/source-manifest.json"
    report_file.parent.mkdir(parents=True, exist_ok=True)
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": report["counts"], "resourceSubpackageBytes": package_bytes}, ensure_ascii=False))


if __name__ == "__main__":
    main()
