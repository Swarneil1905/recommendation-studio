import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { api } from "./api";
import { ProductImageComponent } from "./product-image";

interface Rule {
  anchor: string;
  product: string;
  count: number;
  anchor_count: number;
  support: number;
  confidence: number;
  lift: number;
}
interface Report {
  orders: number;
  products: number;
  rules: Rule[];
  method: string;
  evaluation: {
    status: string;
    train_orders: number;
    test_orders: number;
    eligible_orders: number;
    hit_rate_at_3?: number;
    popularity_hit_rate_at_3?: number;
    method: string;
  };
}
@Component({
  selector: "basket-lab",
  standalone: true,
  imports: [CommonModule, FormsModule, ProductImageComponent],
  templateUrl: "./baskets.html",
  styleUrl: "./baskets.css",
})
export class BasketComponent implements OnInit {
  ngOnInit() {
    const example = new URLSearchParams(location.search).get("example");
    if (example === "1") this.sample();
    if (example === "retail") void this.retailSample();
  }
  orders: { id: string; items: string[] }[] = [];
  names: Record<string, string> = {};
  source = signal("");
  report = signal<Report | null>(null);
  busy = signal(false);
  error = signal("");
  notice = signal("");
  visibleCount = signal(12);
  chosen = signal<string[]>([]);
  minCount = 10;
  confidence = 20;
  lift = 1.2;
  name(id: string) {
    return this.names[id] || id;
  }
  key(r: Rule) {
    return JSON.stringify([r.anchor, r.product]);
  }
  toggle(r: Rule) {
    const key = this.key(r);
    this.chosen.update((v) =>
      v.includes(key) ? v.filter((x) => x !== key) : [...v, key],
    );
    this.notice.set("");
  }
  resetReport() {
    this.visibleCount.set(12);
    this.report.set(null);
    this.chosen.set([]);
    this.notice.set("");
    this.error.set("");
  }
  sample() {
    this.resetReport();
    this.names = {
      "canvas-tote": "Canvas tote",
      "steel-bottle": "Steel bottle",
      notebook: "Notebook",
      "desk-lamp": "Desk lamp",
      headphones: "Headphones",
      "ceramic-mug": "Ceramic mug",
      "reading-light": "Reading light",
    };
    this.orders = Array.from({ length: 240 }, (_, i) => ({
      id: "example-" + i,
      items:
        i % 4 === 0
          ? [
              "canvas-tote",
              "steel-bottle",
              ...(i % 8 === 0 ? ["notebook"] : []),
            ]
          : i % 4 === 1
            ? ["desk-lamp", "headphones"]
            : i % 4 === 2
              ? ["ceramic-mug", "reading-light"]
              : ["notebook"],
    }));
    this.source.set("Fictional shop • 240 example orders");
    void this.analyze();
  }
  async retailSample() {
    if (this.busy()) return;
    this.resetReport();
    this.busy.set(true);
    this.source.set("");
    this.orders = [];
    this.names = {};
    try {
      const response = await fetch("/data/retail-sample.json");
      if (!response.ok)
        throw new Error(
          "The historical sample could not be loaded. Please try again.",
        );
      const sample = await response.json();
      this.orders = sample.orders;
      this.names = sample.names;
      this.source.set(sample.source);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
    if (this.orders.length) await this.analyze();
  }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    this.resetReport();
    this.source.set("");
    this.orders = [];
    this.names = {};
    try {
      if (file.size > 1048576) throw new Error("Use a CSV smaller than 1 MB.");
      const rows = this.csv(await file.text());
      if (rows.length < 2 || rows.length > 20001)
        throw new Error("Provide a header and up to 20,000 order lines.");
      const header = rows.shift()!.map((v) => v.trim().toLowerCase());
      if (
        header.length !== 3 ||
        new Set(header).size !== 3 ||
        !["order_id", "product_id", "product_name"].every((v) =>
          header.includes(v),
        )
      )
        throw new Error(
          "Use exactly these CSV columns: order_id, product_id, product_name. Remove customer information.",
        );
      const index = (s: string) => header.indexOf(s);
      const orders = new Map<string, Set<string>>();
      const names: Record<string, string> = Object.create(null);
      for (let n = 0; n < rows.length; n++) {
        const row = rows[n];
        if (row.length !== 3)
          throw new Error("Line " + (n + 2) + " must have three columns.");
        const order = row[index("order_id")].trim(),
          id = row[index("product_id")].trim(),
          name = row[index("product_name")].trim();
        if (
          !order ||
          order.length > 100 ||
          !id ||
          id.length > 80 ||
          !name ||
          name.length > 120
        )
          throw new Error(
            "Line " + (n + 2) + " has a missing or oversized value.",
          );
        if (names[id] && names[id] !== name)
          throw new Error("Product " + id + " has conflicting names.");
        names[id] = name;
        if (!orders.has(order)) orders.set(order, new Set());
        orders.get(order)!.add(id);
      }
      this.orders = Array.from(orders, ([id, items]) => ({
        id,
        items: [...items],
      }));
      this.names = names;
      this.source.set(file.name);
      this.notice.set(
        "Loaded " +
          this.orders.length +
          " orders. Choose thresholds and run analysis.",
      );
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
  csv(text: string): string[][] {
    text = text.replace(/^﻿/, "");
    const rows: string[][] = [];
    let row: string[] = [],
      value = "",
      quoted = false,
      closed = false;
    const cell = () => {
      row.push(value);
      value = "";
      closed = false;
    };
    const line = () => {
      cell();
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i++;
          } else {
            quoted = false;
            closed = true;
          }
        } else value += c;
        continue;
      }
      if (c === '"') {
        if (value || closed) throw new Error("Invalid CSV quotation.");
        quoted = true;
      } else if (c === ",") cell();
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        line();
      } else {
        if (closed && !/\s/.test(c))
          throw new Error("Unexpected text after a quoted field.");
        if (!closed) value += c;
      }
    }
    if (quoted) throw new Error("CSV contains an unclosed quote.");
    if (value || row.length || closed) line();
    return rows;
  }
  async analyze() {
    if (this.busy() || !this.orders.length) return;
    this.resetReport();
    this.busy.set(true);
    try {
      this.report.set(
        await api<Report>("baskets/analyze", {
          orders: this.orders,
          min_count: this.minCount,
          min_confidence: this.confidence / 100,
          min_lift: this.lift,
        }),
      );
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
  download(data: unknown, file: string, type = "application/json") {
    const url = URL.createObjectURL(
      new Blob(
        [typeof data === "string" ? data : JSON.stringify(data, null, 2)],
        { type },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  template() {
    this.download(
      "order_id,product_id,product_name\norder-001,sku-tote,Canvas tote\norder-001,sku-bottle,Steel bottle\norder-002,sku-tote,Canvas tote\n",
      "orders-template.csv",
      "text/csv",
    );
  }
  export() {
    const r = this.report();
    if (!r) return;
    const rules = r.rules.filter((x) => this.chosen().includes(this.key(x)));
    if (!rules.length) return;
    this.download(
      {
        schema_version: 1,
        created_at: new Date().toISOString(),
        data_source: this.source(),
        orders: r.orders,
        thresholds: {
          min_count: this.minCount,
          min_confidence: this.confidence / 100,
          min_lift: this.lift,
        },
        evaluation: r.evaluation,
        bundle_candidates: rules.map((x) => ({
          ...x,
          anchor_name: this.name(x.anchor),
          product_name: this.name(x.product),
          suggested_placement: "Cart add-on for the anchor product",
          next_action:
            "Check stock and margin, then test against the current cart experience.",
        })),
        limitations:
          "Historical associations, not causal sales predictions. Verify current inventory, margins and outcomes in a controlled test.",
      },
      "bundle-shortlist.json",
    );
    this.notice.set("Bundle shortlist exported.");
  }
}
