import { Component, signal, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IconComponent } from "./icon";
import { api } from "./api";
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  score: number;
  reason: string;
}
interface Catalog {
  products: Product[];
  categories: string[];
  total_items: number;
  method: string;
  catalog_version: string;
}
@Component({
  selector: "discover-studio",
  standalone: true,
  imports: [FormsModule, IconComponent],
  templateUrl: "./discover.html",
})
export class DiscoverComponent implements OnInit {
  query = "";
  category = "All objects";
  budget = 100000;
  loading = signal(false);
  error = signal("");
  products = signal<Product[]>([]);
  baseline = signal<Product[]>([]);
  selected = signal<Product | null>(null);
  saved = signal<string[]>([]);
  compare = signal(false);
  importing = signal(false);
  imported = signal<unknown[] | null>(null);
  source = signal("Example catalog");
  categories = signal<string[]>([]);
  total = signal(0);
  version = signal("");
  elapsed = signal(0);
  appliedQuery = signal("");
  request = 0;
  ngOnInit() {
    void this.search();
  }
  params(
    saved: string[],
    query = this.query,
    category = this.category,
    budget = this.budget,
  ) {
    return new URLSearchParams({
      q: query,
      category,
      budget: String(budget),
      saved: saved.join(","),
    }).toString();
  }
  fetchCatalog(saved: string[]) {
    const data = this.imported();
    return data
      ? api<Catalog>("catalog/preview?" + this.params(saved), data)
      : api<Catalog>("catalog?" + this.params(saved));
  }
  async search() {
    const n = ++this.request;
    const start = performance.now();
    const query = this.query;
    this.loading.set(true);
    this.error.set("");
    try {
      const [result, base] = await Promise.all([
        this.fetchCatalog(this.saved()),
        this.saved().length ? this.fetchCatalog([]) : Promise.resolve(null),
      ]);
      if (n !== this.request) return;
      this.apply(result);
      this.baseline.set(base?.products || result.products);
      this.appliedQuery.set(query);
      this.elapsed.set(Math.round(performance.now() - start));
    } catch (e) {
      if (n === this.request) {
        this.error.set((e as Error).message);
        this.products.set([]);
        this.baseline.set([]);
        this.selected.set(null);
      }
    } finally {
      if (n === this.request) this.loading.set(false);
    }
  }
  apply(result: Catalog) {
    this.products.set(result.products);
    this.categories.set(result.categories);
    this.total.set(result.total_items);
    this.version.set(result.catalog_version);
    this.selected.set(
      result.products.find((x) => x.id === this.selected()?.id) ||
        result.products[0] ||
        null,
    );
  }
  save(id: string) {
    if (this.loading()) return;
    this.saved.update((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length < 25
          ? [...ids, id]
          : ids,
    );
    void this.search();
  }
  clearProfile() {
    this.saved.set([]);
    void this.search();
  }
  resetFilters() {
    this.query = "";
    this.category = "All objects";
    this.budget = 100000;
    void this.search();
  }
  async onImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 1048576) {
      this.error.set("Choose a JSON catalog under 1 MB.");
      return;
    }
    const n = ++this.request;
    this.loading.set(true);
    this.error.set("");
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!Array.isArray(data))
        throw new Error(
          "The file must contain an array of products. Download the example for the format.",
        );
      const result = await api<Catalog>(
        "catalog/preview?" + this.params([], "", "All objects", 100000),
        data,
      );
      if (n !== this.request) return;
      this.imported.set(data);
      this.source.set(file.name);
      this.query = "";
      this.category = "All objects";
      this.budget = 100000;
      this.saved.set([]);
      this.appliedQuery.set("");
      this.apply(result);
      this.baseline.set(result.products);
      this.importing.set(false);
      this.elapsed.set(0);
    } catch (e) {
      if (n === this.request) this.error.set((e as Error).message);
    } finally {
      if (n === this.request) this.loading.set(false);
    }
  }
  useExample() {
    this.imported.set(null);
    this.source.set("Example catalog");
    this.saved.set([]);
    this.resetFilters();
  }
  download(data: unknown, name: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  template() {
    this.download(
      [
        {
          id: "coffee-01",
          name: "Stoneware coffee mug",
          category: "Kitchen",
          price: 24,
          stock: 18,
          description: "A ceramic mug for hot coffee and tea.",
        },
        {
          id: "bag-01",
          name: "Canvas commuter bag",
          category: "Bags",
          price: 48,
          stock: 12,
          description:
            "Lightweight canvas shoulder bag with room for a laptop.",
        },
      ],
      "catalog-template.json",
    );
  }
  exportResults() {
    this.download(
      {
        query: this.appliedQuery(),
        source: this.source(),
        catalog_version: this.version(),
        profile: this.saved(),
        results: this.products(),
        baseline: this.baseline(),
      },
      "ranking-results.json",
    );
  }
  position(id: string) {
    return this.baseline().findIndex((x) => x.id === id) + 1;
  }
  score(value: number) {
    return value.toFixed(3);
  }
}
