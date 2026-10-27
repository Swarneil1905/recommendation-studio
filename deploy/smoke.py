"""Exercise a production gateway and its real backend using only the standard library."""
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

base = sys.argv[1].rstrip("/")
kind = "recommendation-studio"
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def request(path, data=None, headers=None):
    try:
        with client.open(urllib.request.Request(base + path, data=data, headers=headers or {}), timeout=45) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as r:
        return r.code, r.read(), r.headers

status, body, headers = request("/healthz")
assert status == 200 and json.loads(body)["status"] == "ok", (status, body)
status, body, headers = request("/")
assert status == 200 and b"<app-root" in body
assert b'onload=' not in body, "Styles must load without CSP-blocked inline event handlers"
assert headers.get("X-Frame-Options") == "DENY"
assert "frame-ancestors 'none'" in headers.get("Content-Security-Policy", "")
if kind == "voice-practice-coach":
    status, body, _ = request("/api/capabilities")
    assert status == 200 and json.loads(body)["text_review"]
    csrf = next(c.value for c in jar if c.name == "csrftoken")
    answer = json.dumps({"scenario":"cache","answer":"Use a short TTL and invalidate stale inventory. Timeouts fall back to the database."}).encode()
    status, _, _ = request("/api/practice/review", answer, {"Content-Type":"application/json", "Origin":base})
    assert status == 403, status
    status, body, _ = request("/api/practice/review", answer, {"Content-Type":"application/json", "X-CSRFToken":csrf, "Origin":base})
    assert status == 200 and json.loads(body)["coverage"], (status, body)
    status, _, _ = request("/api/voice/token", b'{"scenario":"cache","consent":false}', {"Content-Type":"application/json", "X-CSRFToken":csrf, "Origin":base})
    assert status in (400,503), status
elif kind == "visual-inspection-desk":
    boundary = "inspectionSmokeBoundary"
    image = (Path(__file__).resolve().parents[1]/"tests/fixtures/calibration.png").read_bytes()
    body = ("--"+boundary+'\r\nContent-Disposition: form-data; name="image"; filename="calibration.png"\r\nContent-Type: image/png\r\n\r\n').encode() + image + ("\r\n--"+boundary+"--\r\n").encode()
    status, response, _ = request("/api/inspection/quality", body, {"Content-Type":"multipart/form-data; boundary="+boundary})
    assert status == 200 and len(json.loads(response)["checks"]) == 3, (status, response)
    status, _, _ = request("/api/inspection/quality", b"invalid", {"Content-Type":"application/json"})
    assert status == 400
else:
    status, body, _ = request("/api/catalog?q=quiet%20desk%20lamp")
    products = json.loads(body)["products"]
    assert status == 200 and products[0]["id"] == "desk-lamp"
    assert all(p["stock"] > 0 for p in products)
    status, body, _ = request("/api/catalog?category=Workspace&budget=40")
    assert all(p["price"] <= 40 and p["category"] == "Workspace" for p in json.loads(body)["products"])
    status, _, _ = request("/api/catalog?budget=NaN")
    assert status == 400
    custom = [
        {"id":"custom-coffee", "name":"Coffee mug", "category":"Kitchen", "price":20, "stock":4, "description":"A ceramic coffee mug"},
        {"id":"custom-bag", "name":"Laptop bag", "category":"Bags", "price":50, "stock":3, "description":"Canvas bag for the daily commute"},
        {"id":"sold-out", "name":"Coffee cup", "category":"Kitchen", "price":10, "stock":0, "description":"Coffee cup"},
    ]
    status, body, _ = request("/api/catalog/preview?q=coffee&budget=25", json.dumps(custom).encode(), {"Content-Type":"application/json"})
    imported = json.loads(body)
    assert status == 200 and [p["id"] for p in imported["products"]] == ["custom-coffee"], (status, body)
    assert set(imported["categories"]) == {"Bags","Kitchen"}
    status, body, _ = request("/api/catalog/preview", b"[]", {"Content-Type":"application/json"})
    assert status == 400, (status, body)
    status, body, _ = request("/api/catalog?q=desk%20lamp")
    assert status == 200 and json.loads(body)["products"][0]["id"] == "desk-lamp"
status,body,_=request("/data/retail-sample.json")
sample=json.loads(body)
assert status==200 and len(sample["orders"])==2000 and len(sample["names"])==100,(status,len(body))
assert all(set(order)=={"id","items"} for order in sample["orders"])
status,body,_=request("/data/ATTRIBUTION.txt")
assert status==200 and b"CC BY 4.0" in body,(status,body)
orders=[{"id":str(i),"items":["a","b"] if i<20 else ["c"]} for i in range(40)]
status,body,_=request("/api/baskets/analyze",json.dumps({"orders":orders,"min_count":5,"min_confidence":0.5,"min_lift":1.2}).encode(),{"Content-Type":"application/json"})
result=json.loads(body)
assert status==200 and result["orders"]==40, (status,body)
assert len(result["rules"])==2 and result["rules"][0]["lift"]==2, result
status,body,_=request("/api/baskets/analyze",b'{"orders":[]}',{"Content-Type":"application/json"})
assert status==400,(status,body)
print(kind + ": gateway, security headers, health and application flow passed")
