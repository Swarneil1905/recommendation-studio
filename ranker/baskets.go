package main

import (
	"encoding/json"
	"fmt"
	"hash/fnv"
	"io"
	"math"
	"net/http"
	"sort"
	"strings"
)

type Basket struct {
	ID    string   `json:"id"`
	Items []string `json:"items"`
}
type BasketRequest struct {
	Orders        []Basket `json:"orders"`
	MinCount      int      `json:"min_count"`
	MinConfidence float64  `json:"min_confidence"`
	MinLift       float64  `json:"min_lift"`
}
type Rule struct {
	Anchor      string  `json:"anchor"`
	Product     string  `json:"product"`
	Count       int     `json:"count"`
	AnchorCount int     `json:"anchor_count"`
	Support     float64 `json:"support"`
	Confidence  float64 `json:"confidence"`
	Lift        float64 `json:"lift"`
}
type BasketReport struct {
	Orders     int            `json:"orders"`
	Products   int            `json:"products"`
	Rules      []Rule         `json:"rules"`
	Evaluation map[string]any `json:"evaluation"`
	Method     string         `json:"method"`
}

func normalizeBaskets(req *BasketRequest) error {
	if len(req.Orders) < 10 || len(req.Orders) > 5000 {
		return fmt.Errorf("Upload 10 to 5000 distinct orders")
	}
	if req.MinCount < 2 || req.MinCount > 5000 || req.MinConfidence < 0 || req.MinConfidence > 1 || req.MinLift < 1 || req.MinLift > 10000 {
		return fmt.Errorf("Invalid evidence thresholds")
	}
	seen, products := map[string]bool{}, map[string]bool{}
	for i, order := range req.Orders {
		if strings.TrimSpace(order.ID) == "" || len(order.ID) > 100 || seen[order.ID] || len(order.Items) == 0 || len(order.Items) > 30 {
			return fmt.Errorf("Each order needs a unique ID and 1 to 30 product IDs")
		}
		seen[order.ID] = true
		unique := map[string]bool{}
		for _, id := range order.Items {
			if strings.TrimSpace(id) == "" || len(id) > 80 {
				return fmt.Errorf("Invalid product ID")
			}
			unique[id] = true
			products[id] = true
		}
		req.Orders[i].Items = nil
		for id := range unique {
			req.Orders[i].Items = append(req.Orders[i].Items, id)
		}
		sort.Strings(req.Orders[i].Items)
	}
	if len(products) > 200 {
		return fmt.Errorf("This release supports up to 200 distinct products")
	}
	return nil
}
func mine(orders []Basket, count int, confidence, lift float64) ([]Rule, map[string]int) {
	singles := map[string]int{}
	pairs := map[[2]string]int{}
	for _, order := range orders {
		for i, a := range order.Items {
			singles[a]++
			for j := i + 1; j < len(order.Items); j++ {
				pairs[[2]string{a, order.Items[j]}]++
			}
		}
	}
	rules := []Rule{}
	for pair, n := range pairs {
		for _, ids := range [][2]string{pair, {pair[1], pair[0]}} {
			c := float64(n) / float64(singles[ids[0]])
			l := c / (float64(singles[ids[1]]) / float64(len(orders)))
			if n >= count && c >= confidence && l >= lift {
				rules = append(rules, Rule{ids[0], ids[1], n, singles[ids[0]], float64(n) / float64(len(orders)), c, l})
			}
		}
	}
	sort.Slice(rules, func(i, j int) bool {
		if rules[i].Lift != rules[j].Lift {
			return rules[i].Lift > rules[j].Lift
		}
		if rules[i].Count != rules[j].Count {
			return rules[i].Count > rules[j].Count
		}
		if rules[i].Anchor != rules[j].Anchor {
			return rules[i].Anchor < rules[j].Anchor
		}
		return rules[i].Product < rules[j].Product
	})
	return rules, singles
}
func hashID(id string) uint32 { h := fnv.New32a(); h.Write([]byte(id)); return h.Sum32() }
func evaluateBaskets(req BasketRequest) map[string]any {
	train, test := []Basket{}, []Basket{}
	for _, b := range req.Orders {
		if hashID(b.ID)%5 == 0 {
			test = append(test, b)
		} else {
			train = append(train, b)
		}
	}
	result := map[string]any{"method": "Deterministic order-ID holdout; hide one product and predict it in the top 3. Not a sales uplift estimate.", "train_orders": len(train), "test_orders": len(test), "eligible_orders": 0, "status": "insufficient_data"}
	rules, pop := mine(train, req.MinCount, req.MinConfidence, req.MinLift)
	if len(train) < 20 {
		return result
	}
	eligible, hits, baseline := 0, 0, 0
	for _, order := range test {
		if len(order.Items) < 2 {
			continue
		}
		targetIndex := int(hashID("target:"+order.ID) % uint32(len(order.Items)))
		target := order.Items[targetIndex]
		known := map[string]bool{}
		for i, id := range order.Items {
			if i != targetIndex {
				known[id] = true
			}
		}
		scores := map[string]float64{}
		popular := map[string]float64{}
		for id, n := range pop {
			if !known[id] {
				popular[id] = float64(n)
			}
		}
		for _, r := range rules {
			if known[r.Anchor] && !known[r.Product] {
				scores[r.Product] = math.Max(scores[r.Product], r.Confidence)
			}
		}
		hit := func(values map[string]float64) bool {
			ids := []string{}
			for id := range values {
				ids = append(ids, id)
			}
			sort.Slice(ids, func(i, j int) bool {
				if values[ids[i]] == values[ids[j]] {
					return ids[i] < ids[j]
				}
				return values[ids[i]] > values[ids[j]]
			})
			for i, id := range ids {
				if i >= 3 {
					break
				}
				if id == target {
					return true
				}
			}
			return false
		}
		eligible++
		if hit(scores) {
			hits++
		}
		if hit(popular) {
			baseline++
		}
	}
	result["eligible_orders"] = eligible
	if eligible >= 5 {
		result["status"] = "available"
		result["hit_rate_at_3"] = float64(hits) / float64(eligible)
		result["popularity_hit_rate_at_3"] = float64(baseline) / float64(eligible)
	}
	return result
}
func basketHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	fail := func(message string, status int) {
		w.WriteHeader(status)
		json.NewEncoder(w).Encode(map[string]string{"error": message})
	}
	if r.Method != "POST" {
		w.Header().Set("Allow", "POST")
		fail("Use POST", 405)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var req BasketRequest
	if err := decoder.Decode(&req); err != nil {
		fail("Send a valid basket request under 1 MB", 400)
		return
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		fail("Send one JSON object", 400)
		return
	}
	if err := normalizeBaskets(&req); err != nil {
		fail(err.Error(), 400)
		return
	}
	rules, products := mine(req.Orders, req.MinCount, req.MinConfidence, req.MinLift)
	if len(rules) > 200 {
		rules = rules[:200]
	}
	json.NewEncoder(w).Encode(BasketReport{len(req.Orders), len(products), rules, evaluateBaskets(req), "Pairwise association rules from distinct order baskets. Repeated quantities count once; historical association does not establish causation."})
}
