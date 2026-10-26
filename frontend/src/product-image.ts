import { Component, Input } from "@angular/core";
import { ProductArtComponent } from "./art";
const images: Record<string, [number, number]> = {
  "canvas-tote": [0, 0],
  "desk-lamp": [1, 0],
  "steel-bottle": [2, 0],
  headphones: [3, 0],
  notebook: [0, 1],
  "ceramic-mug": [1, 1],
  "travel-bag": [2, 1],
  "reading-light": [3, 1],
};
@Component({
  selector: "product-image",
  standalone: true,
  imports: [ProductArtComponent],
  template: `@if (position; as pos) {
      <div
        class="photo"
        role="img"
        [attr.aria-label]="label + ' · sample product image'"
        [style.background-position]="pos"
      ></div>
    } @else {
      <product-art
        [kind]="kind"
        [color]="color"
        [label]="label + ' · category illustration'"
      />
    }`,
  styles: [
    ":host{display:block;position:relative;overflow:hidden;background:#e5e3de;width:100%;height:100%;min-height:40px}.photo{position:absolute;height:100%;aspect-ratio:1;left:50%;top:0;transform:translateX(-50%);background-image:url('/images/catalog-products.png');background-size:400% 200%;background-repeat:no-repeat}product-art{background:#eef1ec;width:100%;height:100%}",
  ],
})
export class ProductImageComponent {
  @Input() id = "";
  @Input() label = "Product image";
  @Input() sample = true;
  @Input() kind = "bag";
  @Input() color = "#879886";
  get position() {
    const cell = this.sample ? images[this.id] : undefined;
    return cell ? (cell[0] * 100) / 3 + "% " + cell[1] * 100 + "%" : null;
  }
}
