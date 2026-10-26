package dev.swarneil.recommendation;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;

class CatalogServerTest {
  CatalogServer.Product p(String id, int stock, double price) {
    return new CatalogServer.Product(
        id, "Item", "Home", price, stock, "mug", "#aaa", "#fff", "Coffee mug");
  }

  @Test
  void stockIsAlwaysAHardFilter() {
    assertEquals(
        1,
        CatalogServer.filter(
                List.of(p("a", 0, 5), p("b", 2, 5)), "All objects", 200, Set.of(), false)
            .size());
  }

  @Test
  void savedCannotBypassBudget() {
    assertTrue(
        CatalogServer.filter(List.of(p("a", 2, 80)), "Home", 40, Set.of("a"), true).isEmpty());
  }

  @Test
  void categoryAndSavedAreBothApplied() {
    assertTrue(
        CatalogServer.filter(List.of(p("a", 2, 20)), "Carry", 40, Set.of("a"), true).isEmpty());
  }

  @Test
  void queryDecodesSafely() {
    assertEquals("coffee & tea", CatalogServer.query("q=coffee+%26+tea").get("q"));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.query("q=%ZZ"));
  }

  @Test
  void invalidBudgetRejectedBeforeIO() {
    assertThrows(
        IllegalArgumentException.class, () -> CatalogServer.catalog(Map.of("budget", "NaN")));
  }

  byte[] imported(String extra) {
    return ("[{\"id\":\"sku-1\",\"name\":\"Mug\",\"category\":\"Kitchen\",\"description\":\"Ceramic coffee mug\",\"price\":24,\"stock\":5" + extra + "}]").getBytes(java.nio.charset.StandardCharsets.UTF_8);
  }

  @Test void acceptsOwnCatalogWithoutIllustrationFields() {
    var products = CatalogServer.parseCatalog(imported(""));
    assertEquals("Kitchen", products.getFirst().category());
    assertEquals(5, products.getFirst().stock());
  }
  @Test void rejectsMissingPriceAndFractionalStock() {
    String valid = new String(imported(""), java.nio.charset.StandardCharsets.UTF_8);
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(valid.replace(",\"price\":24", "").getBytes()));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(valid.replace("\"stock\":5", "\"stock\":1.5").getBytes()));
  }
  @Test void rejectsDuplicateIdsAndUnsafeIds() {
    String valid = new String(imported(""), java.nio.charset.StandardCharsets.UTF_8);
    String row = valid.substring(1, valid.length()-1);
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(("[" + row + "," + row + "]").getBytes()));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(valid.replace("sku-1", "sku,1").getBytes()));
  }
  @Test void rejectsOversizeAndMalformedImports() {
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(new byte[1048577]));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog("{}".getBytes()));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog("[]".getBytes()));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog("not json".getBytes()));
  }
  @Test void rejectsInvalidInventory() {
    String valid = new String(imported(""), java.nio.charset.StandardCharsets.UTF_8);
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(valid.replace("\"stock\":5", "\"stock\":-1").getBytes()));
    assertThrows(IllegalArgumentException.class, () -> CatalogServer.parseCatalog(valid.replace("\"price\":24", "\"price\":100001").getBytes()));
  }
}
