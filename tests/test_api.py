import os
import httpx

BASE = os.getenv("CATALOG_API", "http://127.0.0.1:8002")


def get(**params):
    return httpx.get(BASE + "/api/catalog", params=params)


def test_stock_budget_and_category():
    response = get(category="Workspace", budget=40)
    assert response.status_code == 200
    products = response.json()["products"]
    assert products and all(
        p["stock"] > 0 and p["price"] <= 40 and p["category"] == "Workspace"
        for p in products
    )


def test_out_of_stock_saved_item_is_excluded():
    assert get(saved="travel-bag", saved_only="true").json()["products"] == []


def test_search_ranks_related_description_first():
    products = get(q="quiet desk lamp").json()["products"]
    assert products[0]["id"] == "desk-lamp"
    assert products[0]["score"] >= products[-1]["score"]


def test_invalid_filters_are_rejected():
    assert get(budget="NaN").status_code == 400
    assert get(category="unknown").status_code == 400
    assert get(saved_only="maybe").status_code == 400
