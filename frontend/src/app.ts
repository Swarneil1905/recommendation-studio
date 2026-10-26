import { Component, signal } from "@angular/core";
import { DiscoverComponent } from "./discover";
import { IconComponent } from "./icon";
import { ProductImageComponent } from "./product-image";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [DiscoverComponent, IconComponent, ProductImageComponent],
  templateUrl: "./app.html",
  styleUrl: "./home.css",
})
export class AppComponent {
  skipHref = location.pathname + location.search + "#main";
  workspace = window.location.pathname.replace(/\/$/, "") === "/workspace";
  menu = signal(false);
  example = signal(0);

  queries = [
    "A bag for my commute",
    "A comfortable workspace",
    "A slower morning",
  ];
  previews = [
    [
      {
        id: "canvas-tote",
        name: "The daily carry",
        price: 38,
        category: "Carry",
      },
      {
        id: "steel-bottle",
        name: "The everyday bottle",
        price: 28,
        category: "Carry",
      },
      {
        id: "notebook",
        name: "Room for a thought",
        price: 18,
        category: "Workspace",
      },
    ],
    [
      {
        id: "desk-lamp",
        name: "A softer light",
        price: 68,
        category: "Workspace",
      },
      {
        id: "headphones",
        name: "A little more focus",
        price: 95,
        category: "Workspace",
      },
      {
        id: "notebook",
        name: "Room for a thought",
        price: 18,
        category: "Workspace",
      },
    ],
    [
      {
        id: "ceramic-mug",
        name: "The slow morning",
        price: 24,
        category: "Home",
      },
      {
        id: "reading-light",
        name: "One more chapter",
        price: 54,
        category: "Home",
      },
      {
        id: "notebook",
        name: "Room for a thought",
        price: 18,
        category: "Workspace",
      },
    ],
  ];
  searchUrl() {
    return "/workspace?q=" + encodeURIComponent(this.queries[this.example()]);
  }
}
