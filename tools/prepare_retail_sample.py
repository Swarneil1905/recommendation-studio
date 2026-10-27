"""Build the published, bounded UCI sample. Requires openpyxl 3.1.5.
Usage: python tools/prepare_retail_sample.py path/to/online-retail.zip
Customer columns are never read into the sample. See public data attribution.
"""

import collections
import datetime
import io
import json
import re
import sys
import zipfile
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[1]
with zipfile.ZipFile(sys.argv[1]) as archive:
    data = archive.read("Online Retail.xlsx")
workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
orders = collections.defaultdict(set)
names = {}
for invoice, sku, description, quantity, date, price, *_ in workbook.active.iter_rows(
    min_row=2, values_only=True
):
    sku, invoice = str(sku), str(invoice)
    if not isinstance(date, datetime.datetime) or date.year != 2011 or date.month != 11:
        continue
    if invoice.upper().startswith("C") or not re.fullmatch(r"[0-9]{5}[A-Z]?", sku):
        continue
    if (
        not description
        or not isinstance(quantity, (int, float))
        or quantity <= 0
        or not isinstance(price, (int, float))
        or price <= 0
    ):
        continue
    orders[invoice].add(sku)
    names.setdefault(sku, str(description).strip().title())
workbook.close()
counts = collections.Counter(sku for basket in orders.values() for sku in basket)
top = {
    sku for sku, _ in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))[:100]
}
selected = []
for invoice, basket in sorted(orders.items()):
    items = sorted(basket & top)
    if 1 <= len(items) <= 30:
        selected.append({"id": f"retail-{len(selected)+1:04d}", "items": items})
    if len(selected) == 2000:
        break
used = {sku for order in selected for sku in order["items"]}
result = {
    "source": "UCI Online Retail: November 2011 historical sample",
    "orders": selected,
    "names": {sku: names[sku] for sku in sorted(used)},
}
destination = root / "frontend/public/data/retail-sample.json"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(
    json.dumps(result, ensure_ascii=True, separators=(",", ":")) + "\n",
    encoding="utf-8",
)
print(
    f"{len(selected)} orders, {len(used)} products, {destination.stat().st_size} bytes"
)
