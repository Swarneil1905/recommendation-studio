package main

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func sample() Request {
	return Request{Query: "quiet desk lamp", Items: []Item{{"lamp", "quiet desk light lamp"}, {"bag", "commute travel bag"}}}
}
func TestRanksRelevantItem(t *testing.T) {
	r := rank(sample())
	if r.Matches[0].ID != "lamp" || r.Matches[0].Score <= r.Matches[1].Score {
		t.Fatal(r)
	}
}
func TestSavedProfile(t *testing.T) {
	q := sample()
	q.Query = ""
	q.Saved = []string{"bag"}
	if rank(q).Matches[0].ID != "bag" {
		t.Fatal("profile ignored")
	}
}
func TestExpiryAndCatalogKey(t *testing.T) {
	r := NewRanker()
	now := time.Unix(100, 0)
	r.now = func() time.Time { return now }
	r.cached(sample())
	q := sample()
	q.Items[0].Text = "changed"
	r.cached(q)
	if len(r.entries) != 2 {
		t.Fatal("catalog missing from key")
	}
	now = now.Add(31 * time.Second)
	r.cached(q)
	if len(r.entries) != 1 {
		t.Fatal("TTL did not expire")
	}
}
func TestBoundedCache(t *testing.T) {
	r := NewRanker()
	for i := 0; i < 300; i++ {
		q := sample()
		q.Query = strings.Repeat("x", i)
		r.cached(q)
	}
	if len(r.entries) > 256 {
		t.Fatal("unbounded cache")
	}
}
func TestRejectDuplicateIDs(t *testing.T) {
	w := httptest.NewRecorder()
	q := httptest.NewRequest("POST", "/rank", strings.NewReader(`{"items":[{"id":"a","text":"one"},{"id":"a","text":"two"}]}`))
	NewRanker().handler(w, q)
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
