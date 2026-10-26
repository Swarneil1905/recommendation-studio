import { Component } from "@angular/core";
import { DiscoverComponent } from "./discover";
@Component({
  selector: "app-root",
  standalone: true,
  imports: [DiscoverComponent],
  template: `<a class="skip-link" href="#workspace">Skip to workspace</a>
    <main id="workspace"><discover-studio /></main>`,
})
export class AppComponent {}
