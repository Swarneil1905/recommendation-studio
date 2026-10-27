package dev.swarneil.recommendation;

import com.fasterxml.jackson.databind.*;
import com.sun.net.httpserver.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

public final class CatalogServer {
  static final ObjectMapper JSON = new ObjectMapper();
  static final HttpClient CLIENT =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(2))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();

  record Product(
      String id,
      String name,
      String category,
      double price,
      int stock,
      String kind,
      String color,
      String background,
      String description) {}

  static Map<String, String> query(String raw) {
    Map<String, String> result = new HashMap<>();
    if (raw == null) return result;
    if (raw.length() > 4000) throw new IllegalArgumentException("Query is too long");
    for (String part : raw.split("&")) {
      String[] p = part.split("=", 2);
      result.put(
          URLDecoder.decode(p[0], StandardCharsets.UTF_8),
          p.length > 1 ? URLDecoder.decode(p[1], StandardCharsets.UTF_8) : "");
    }
    return result;
  }

  static List<Product> filter(
      List<Product> all, String category, double budget, Set<String> saved, boolean onlySaved) {
    return all.stream()
        .filter(
            p ->
                p.stock() > 0
                    && p.price() <= budget
                    && (category.equals("All objects") || category.equals(p.category()))
                    && (!onlySaved || saved.contains(p.id())))
        .toList();
  }

  static Object catalog(Map<String, String> q) throws Exception { return catalog(q, null); }

  static List<Product> parseCatalog(byte[] data) {
    if (data.length > 1048576) throw new IllegalArgumentException("Catalog must be under 1 MB");
    try {
      JsonNode root = JSON.readTree(data);
      if (root == null || !root.isArray() || root.isEmpty() || root.size() > 500)
        throw new IllegalArgumentException("Provide an array of 1 to 500 products");
      Set<String> ids = new HashSet<>();
      for (JsonNode item : root) {
        for (String field : List.of("id", "name", "category", "description")) {
          JsonNode value = item.path(field);
          int max = field.equals("description") ? 2000 : field.equals("name") ? 120 : 60;
          if (!value.isTextual() || value.asText().isBlank() || value.asText().length() > max)
            throw new IllegalArgumentException("Each product needs a valid " + field + " (max " + max + " characters)");
        }
        String text = item.path("name").asText() + " " + item.path("category").asText() + " " + item.path("description").asText();
        if (text.getBytes(StandardCharsets.UTF_8).length > 4000)
          throw new IllegalArgumentException("Product text must be under 4000 UTF-8 bytes");
        String id = item.path("id").asText();
        if (!id.matches("[-A-Za-z0-9_]+") || !ids.add(id))
          throw new IllegalArgumentException("Product IDs must be unique and use letters, numbers, underscores or hyphens");
        if (!item.path("price").isNumber() || !Double.isFinite(item.path("price").asDouble())
            || item.path("price").asDouble() < 0 || item.path("price").asDouble() > 100000
            || !item.path("stock").isIntegralNumber() || !item.path("stock").canConvertToInt()
            || item.path("stock").asInt() < 0)
          throw new IllegalArgumentException("Each product needs a price from 0 to 100000 and nonnegative integer stock");
      }
      return Arrays.asList(JSON.treeToValue(root, Product[].class));
    } catch (IllegalArgumentException e) { throw e; }
    catch (Exception e) { throw new IllegalArgumentException("Catalog must be a valid JSON product array"); }
  }

  static Object catalog(Map<String, String> q, byte[] data) throws Exception {
    String query = q.getOrDefault("q", "").strip(),
        category = q.getOrDefault("category", "All objects");
    double budget;
    try {
      budget = Double.parseDouble(q.getOrDefault("budget", "200"));
    } catch (NumberFormatException e) {
      throw new IllegalArgumentException("Budget must be a number");
    }
    if (query.length() > 300 || !Double.isFinite(budget) || budget < 0 || budget > 100000)
      throw new IllegalArgumentException("Invalid query or budget");
    if (category.length() > 60) throw new IllegalArgumentException("Category is too long");
    String savedText = q.getOrDefault("saved", "");
    if (savedText.length() > 2000) throw new IllegalArgumentException("Too many saved items");
    Set<String> saved = new TreeSet<>(Arrays.asList(savedText.split(",")));
    saved.remove("");
    if (saved.size() > 100) throw new IllegalArgumentException("Too many saved items");
    String only = q.getOrDefault("saved_only", "false");
    if (!only.equals("true") && !only.equals("false"))
      throw new IllegalArgumentException("Invalid saved filter");
    // Imported catalogs are request scoped. They never replace the shared catalog.
    if (data == null) data = Files.readAllBytes(Path.of(System.getenv().getOrDefault("CATALOG_PATH", "catalog.json")));
    List<Product> all = parseCatalog(data);
    if (!category.equals("All objects") && all.stream().noneMatch(p -> p.category().equals(category)))
      throw new IllegalArgumentException("Unknown category");
    List<Map<String, String>> items =
        all.stream()
            .map(
                p ->
                    Map.of(
                        "id",
                        p.id(),
                        "text",
                        p.name() + " " + p.category() + " " + p.description()))
            .toList();
    byte[] request = JSON.writeValueAsBytes(Map.of("query", query, "saved", saved, "items", items));
    String url = System.getenv().getOrDefault("RANKER_URL", "http://127.0.0.1:8090");
    HttpResponse<String> response =
        CLIENT.send(
            HttpRequest.newBuilder(URI.create(url + "/rank"))
                .timeout(Duration.ofSeconds(3))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofByteArray(request))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() != 200 || response.body().length() > 200000)
      throw new IllegalStateException("Ranking service unavailable");
    JsonNode ranked = JSON.readTree(response.body());
    if (!ranked.path("matches").isArray()) throw new IllegalStateException("Invalid rank response");
    Map<String, Product> available = new HashMap<>();
    for (Product p : filter(all, category, budget, saved, Boolean.parseBoolean(only)))
      available.put(p.id(), p);
    List<Map<String, Object>> products = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    for (JsonNode match : ranked.path("matches")) {
      String id = match.path("id").asText();
      Product p = available.get(id);
      if (p == null || !seen.add(id)) continue;
      Map<String, Object> item =
          JSON.convertValue(
              p, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {});
      item.put("score", match.path("score").asDouble());
      item.put("reason", match.path("reason").asText("Available within your filters"));
      products.add(item);
    }
    return Map.of(
        "products",
        products,
        "categories", all.stream().map(Product::category).distinct().sorted().toList(),
        "total_items", all.size(),
        "method",
        ranked.path("method").asText(),
        "catalog_version",
        HexFormat.of()
            .formatHex(MessageDigest.getInstance("SHA-256").digest(data))
            .substring(0, 12));
  }

  static void send(HttpExchange x, int status, Object value) throws java.io.IOException {
    byte[] bytes = JSON.writeValueAsBytes(value);
    x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    x.getResponseHeaders().set("Cache-Control", "no-store");
    x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
    x.sendResponseHeaders(status, bytes.length);
    try (var output = x.getResponseBody()) {
      output.write(bytes);
    }
  }

  static void handle(HttpExchange x) throws java.io.IOException {
    try {
      String path = x.getRequestURI().getPath();
      if (path.equals("/api/baskets/analyze")) {
        if (!x.getRequestMethod().equals("POST")) {
          x.getResponseHeaders().set("Allow", "POST");
          send(x, 405, Map.of("error", "Use POST")); return;
        }
        String type = x.getRequestHeaders().getFirst("Content-Type");
        if (type == null || !type.split(";")[0].strip().equalsIgnoreCase("application/json")) {
          send(x, 415, Map.of("error", "Use application/json")); return;
        }
        byte[] data = x.getRequestBody().readNBytes(1048577);
        if (data.length > 1048576) { send(x, 413, Map.of("error", "Order data must be under 1 MB")); return; }
        String url = System.getenv().getOrDefault("RANKER_URL", "http://127.0.0.1:8090");
        HttpResponse<String> response = CLIENT.send(
          HttpRequest.newBuilder(URI.create(url + "/baskets")).timeout(Duration.ofSeconds(8))
            .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofByteArray(data)).build(),
          HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200 && response.statusCode() != 400)
          throw new IllegalStateException("Basket analysis unavailable");
        send(x, response.statusCode(), JSON.readTree(response.body())); return;
      }
      if (path.equals("/api/catalog/preview")) {
        if (!x.getRequestMethod().equals("POST")) {
          x.getResponseHeaders().set("Allow", "POST");
          send(x, 405, Map.of("error", "Use POST")); return;
        }
        String contentType = x.getRequestHeaders().getFirst("Content-Type");
        if (contentType == null || !contentType.split(";")[0].strip().equalsIgnoreCase("application/json")) {
          send(x, 415, Map.of("error", "Use application/json")); return;
        }
        byte[] data = x.getRequestBody().readNBytes(1048577);
        if (data.length > 1048576) { send(x, 413, Map.of("error", "Catalog must be under 1 MB")); return; }
        send(x, 200, catalog(query(x.getRequestURI().getRawQuery()), data)); return;
      }
      if (!x.getRequestMethod().equals("GET")) {
        x.getResponseHeaders().set("Allow", "GET"); send(x, 405, Map.of("error", "Use GET")); return;
      }
      switch (x.getRequestURI().getPath()) {
        case "/api/health" -> {
          catalog(Map.of());
          send(x, 200, Map.of("status", "ok", "service", "recommendation-studio"));
        }
        case "/api/catalog" -> send(x, 200, catalog(query(x.getRequestURI().getRawQuery())));
        default -> send(x, 404, Map.of("error", "Not found"));
      }
    } catch (IllegalArgumentException e) {
      send(x, 400, Map.of("error", e.getMessage()));
    } catch (Exception e) {
      System.err.println("Catalog request failed: " + e.getClass().getSimpleName());
      send(x, 503, Map.of("error", "The catalog or ranking service is unavailable. Please retry."));
    }
  }

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8002"));
    String bind = System.getenv().getOrDefault("BIND_ADDRESS", "127.0.0.1");
    HttpServer server = HttpServer.create(new InetSocketAddress(bind, port), 64);
    ThreadPoolExecutor executor =
        new ThreadPoolExecutor(
            4,
            16,
            30,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(128),
            new ThreadPoolExecutor.CallerRunsPolicy());
    server.setExecutor(executor);
    server.createContext("/", CatalogServer::handle);
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread(
                () -> {
                  server.stop(3);
                  executor.shutdown();
                }));
    server.start();
    System.out.println("Catalog API listening on " + bind + ":" + port);
  }
}
