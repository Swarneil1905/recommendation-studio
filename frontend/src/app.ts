import { ProductImageComponent } from "./product-image";
import { BasketComponent } from "./baskets";
import { Component } from "@angular/core";
import { DiscoverComponent } from "./discover";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [BasketComponent, DiscoverComponent, ProductImageComponent],
  templateUrl: "./app.html",
  styleUrl: "./home.css",
})
export class AppComponent {
  skipHref = location.pathname + location.search + "#main";
  workspace = window.location.pathname.replace(/\/$/, "") === "/workspace";
  catalog = new URLSearchParams(location.search).get("tool") === "catalog";
}
