import {
  Component,
  signal,
  OnInit,
  ViewChild,
  ElementRef,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IconComponent } from "./icon";
import { ProductArtComponent } from "./art";
import { api } from "./api";
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  kind: string;
  color: string;
  background: string;
  description: string;
  reason: string;
  score: number;
}
interface Catalog {
  products: Product[];
  method: string;
  catalog_version: string;
}
@Component({
  selector: "discover-studio",
  standalone: true,
  imports: [FormsModule, IconComponent, ProductArtComponent],
  template: `
    <section class="workspace discover">
      <div class="location-row">
        <span>Discovery studio</span
        ><span class="status-label">Sample catalog · Live ranking API</span>
      </div>
      <div class="page-heading">
        <div>
          <p class="eyebrow">FEWER THINGS. BETTER CHOICES.</p>
          <h1>Find your everyday essentials.</h1>
          <p class="lede">
            Tell us what matters. Explore a considered selection, with a reason
            for every match.
          </p>
        </div>
        <span class="edition">03 / DISCOVER</span>
      </div>
      <form class="search-form" (submit)="$event.preventDefault(); search()">
        <app-icon name="search" /><label class="sr-only" for="product-search"
          >Describe what you need</label
        ><input
          id="product-search"
          [(ngModel)]="query"
          name="query"
          placeholder="Something useful for a quiet morning at home"
          maxlength="300"
        /><button class="primary green" type="submit" [disabled]="loading()">
          Find my selection <app-icon name="arrow" />
        </button>
      </form>
      <div class="suggestions">
        <span>Try a direction</span>
        @for (s of suggestions; track s) {
          <button class="suggestion" (click)="query = s; search()">
            {{ s }} <span>↗</span>
          </button>
        }
      </div>
      <div class="catalog-toolbar">
        <div class="category-tabs" aria-label="Product category">
          @for (c of categories; track c) {
            <button
              [class.active]="category === c"
              [attr.aria-pressed]="category === c"
              (click)="category = c; search()"
            >
              {{ c }}
            </button>
          }
        </div>
        <div class="catalog-options">
          <label for="budget">Budget</label
          ><select id="budget" [(ngModel)]="budget" (change)="search()">
            <option [ngValue]="200">Up to $200</option>
            <option [ngValue]="75">Up to $75</option>
            <option [ngValue]="40">Up to $40</option></select
          ><button
            class="text-button"
            (click)="savedOnly = !savedOnly; search()"
            [attr.aria-pressed]="savedOnly"
          >
            <app-icon name="heart" />Saved {{ saved.size }}
          </button>
        </div>
      </div>
      <div class="catalog-caption">
        <span>{{
          loading()
            ? "Finding your selection…"
            : products().length + " considered choices"
        }}</span
        ><button
          class="text-button"
          (click)="showMethod.set(!showMethod())"
          [attr.aria-expanded]="showMethod()"
        >
          <app-icon name="info" />How recommendations work
        </button>
      </div>
      @if (showMethod()) {
        <div class="method-note">
          The API compares your words and saved items with product descriptions
          using TF IDF cosine similarity. Budget, category and stock are hard
          filters. These are fictional products and original illustrations.
          Similarity scores are not probabilities.
        </div>
      }
      @if (error()) {
        <div class="error" role="alert">
          {{ error() }}
          <button class="text-button" (click)="search()">Try again</button>
        </div>
      }
      <div class="product-grid" [attr.aria-busy]="loading()">
        @for (p of products(); track p.id) {
          <article class="product-card">
            <div class="product-visual" [style.background]="p.background">
              <button
                class="save-button"
                [class.saved]="saved.has(p.id)"
                [attr.aria-label]="
                  (saved.has(p.id) ? 'Unsave ' : 'Save ') + p.name
                "
                [attr.aria-pressed]="saved.has(p.id)"
                (click)="save(p.id)"
              >
                <app-icon
                  [name]="saved.has(p.id) ? 'check' : 'heart'"
                /></button
              ><button
                class="product-image-button"
                (click)="openProduct(p)"
                [attr.aria-label]="'View ' + p.name"
              >
                <product-art
                  [kind]="p.kind"
                  [color]="p.color"
                  [label]="p.name + ' illustration'"
                /></button
              ><span class="stock-label">{{ p.stock }} available</span>
            </div>
            <div class="product-title">
              <button (click)="openProduct(p)">{{ p.name }}</button
              ><span>&#36;{{ p.price }}</span>
            </div>
            <p class="product-category">{{ p.category }}</p>
            <p class="recommendation-reason">
              <span class="reason-dot"></span>{{ p.reason }}
            </p>
          </article>
        }
      </div>
      @if (!loading() && !products().length && !error()) {
        <div class="empty-state">
          <app-icon name="search" />
          <h3>No items match these filters.</h3>
          <p>Try a broader category or a higher budget.</p>
          <button class="secondary" (click)="reset()">Reset filters</button>
        </div>
      }
      <div class="catalog-footnote">
        <app-icon name="bag" />
        <p>
          Explore and save. This is a recommendation workspace, so there is no
          checkout or payment collection.
        </p>
      </div>
    </section>
    <dialog
      #productDialog
      class="product-dialog"
      aria-labelledby="product-dialog-title"
      (close)="selected.set(null)"
    >
      @if (selected()) {
        <button
          class="dialog-close secondary"
          (click)="productDialog.close()"
          aria-label="Close product details"
        >
          <app-icon name="close" />
        </button>
        <div class="dialog-art" [style.background]="selected()!.background">
          <product-art
            [kind]="selected()!.kind"
            [color]="selected()!.color"
            [label]="selected()!.name"
          />
        </div>
        <div class="dialog-copy">
          <span class="eyebrow">{{ selected()!.category }}</span>
          <h2 id="product-dialog-title">{{ selected()!.name }}</h2>
          <p>{{ selected()!.description }}</p>
          <p class="product-price">&#36;{{ selected()!.price }}</p>
          <div class="method-note">{{ selected()!.reason }}</div>
          <button class="primary green" (click)="save(selected()!.id)">
            <app-icon name="heart" />{{
              saved.has(selected()!.id)
                ? "Remove from saved"
                : "Save to my selection"
            }}
          </button>
          <p class="micro">
            Fictional sample product. No purchase is available.
          </p>
        </div>
      }
    </dialog>
  `,
})
export class DiscoverComponent implements OnInit {
  @ViewChild("productDialog") dialog!: ElementRef<HTMLDialogElement>;
  openProduct(p: Product) {
    this.selected.set(p);
    this.dialog.nativeElement.showModal();
  }
  query = "";
  category = "All objects";
  budget = 200;
  savedOnly = false;
  loading = signal(false);
  error = signal("");
  products = signal<Product[]>([]);
  selected = signal<Product | null>(null);
  showMethod = signal(false);
  saved = new Set<string>();
  request = 0;
  categories = ["All objects", "Carry", "Workspace", "Home"];
  suggestions = ["A lighter commute", "A focused workspace", "Slow mornings"];
  ngOnInit() {
    try {
      const ids = JSON.parse(localStorage.getItem("fieldwork-saved") || "[]");
      if (Array.isArray(ids))
        this.saved = new Set(ids.filter((x) => typeof x === "string"));
    } catch {}
    void this.search();
  }
  async search() {
    const n = ++this.request;
    this.loading.set(true);
    this.error.set("");
    try {
      const q = new URLSearchParams({
        q: this.query,
        category: this.category,
        budget: String(this.budget),
        saved: [...this.saved].join(","),
        saved_only: String(this.savedOnly),
      });
      const result = await api<Catalog>("catalog?" + q);
      if (n === this.request) this.products.set(result.products);
    } catch (e) {
      if (n === this.request) this.error.set((e as Error).message);
    } finally {
      if (n === this.request) this.loading.set(false);
    }
  }
  save(id: string) {
    this.saved.has(id) ? this.saved.delete(id) : this.saved.add(id);
    try {
      localStorage.setItem("fieldwork-saved", JSON.stringify([...this.saved]));
    } catch {}
    void this.search();
  }
  reset() {
    this.query = "";
    this.category = "All objects";
    this.budget = 200;
    this.savedOnly = false;
    void this.search();
  }
}
