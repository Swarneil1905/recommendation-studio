package main

import (
	"math"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestBasketEvidenceAndDeduplication(t *testing.T) {
	r := BasketRequest{MinCount: 2, MinLift: 1, MinConfidence: .1}
	for i := 0; i < 20; i++ {
		items := []string{"c"}
		if i < 8 {
			items = []string{"a", "a", "b"}
		} else if i < 10 {
			items = []string{"a"}
		}
		r.Orders = append(r.Orders, Basket{ID: string(rune('A' + i)), Items: items})
	}
	if e := normalizeBaskets(&r); e != nil {
		t.Fatal(e)
	}
	rules, _ := mine(r.Orders, 2, .1, 1)
	for _, v := range rules {
		if v.Anchor == "a" && v.Product == "b" {
			if v.Count != 8 || v.AnchorCount != 10 || math.Abs(v.Confidence-.8) > .00001 || math.Abs(v.Lift-2) > .00001 {
				t.Fatal(v)
			}
			return
		}
	}
	t.Fatal("missing rule")
}
func TestBasketRejectsDuplicateOrders(t *testing.T) {
	r := BasketRequest{MinCount: 2, MinLift: 1}
	for i := 0; i < 10; i++ {
		r.Orders = append(r.Orders, Basket{"same", []string{"a"}})
	}
	if normalizeBaskets(&r) == nil {
		t.Fatal("duplicate order accepted")
	}
}
func TestBasketRejectsTrailingJSON(t *testing.T) {
	w := httptest.NewRecorder()
	basketHandler(w, httptest.NewRequest("POST", "/baskets", strings.NewReader("{}{}")))
	if w.Code != 400 {
		t.Fatal(w.Code)
	}
}
func TestEvaluationIsOrderIndependentAndUsesHeldOutOrders(t *testing.T) {
	r := BasketRequest{MinCount: 2, MinConfidence: .1, MinLift: 1}
	for i := 0; i < 200; i++ {
		items := []string{"c", "d"}
		if i%2 == 0 {
			items = []string{"a", "b"}
		}
		r.Orders = append(r.Orders, Basket{string(rune(100 + i)), items})
	}
	normalizeBaskets(&r)
	a := evaluateBaskets(r)
	if a["status"] != "available" || a["train_orders"].(int)+a["test_orders"].(int) != 200 || a["hit_rate_at_3"].(float64) != 1 {
		t.Fatal(a)
	}
	for i, j := 0, len(r.Orders)-1; i < j; i, j = i+1, j-1 {
		r.Orders[i], r.Orders[j] = r.Orders[j], r.Orders[i]
	}
	b := evaluateBaskets(r)
	if a["hit_rate_at_3"] != b["hit_rate_at_3"] || a["train_orders"] != b["train_orders"] {
		t.Fatal(a, b)
	}
}
