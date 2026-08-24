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
}
