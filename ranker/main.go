package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type Item struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}
type Request struct {
	Query string   `json:"query"`
	Saved []string `json:"saved"`
	Items []Item   `json:"items"`
}
type Match struct {
	ID     string  `json:"id"`
	Score  float64 `json:"score"`
	Reason string  `json:"reason"`
}
type Response struct {
	Matches []Match `json:"matches"`
	Method  string  `json:"method"`
}
type entry struct {
	expires  time.Time
	response Response
}
type Ranker struct {
	mu      sync.Mutex
	entries map[string]entry
	now     func() time.Time
}

func NewRanker() *Ranker { return &Ranker{entries: map[string]entry{}, now: time.Now} }

var words = regexp.MustCompile(`[a-z0-9]+`)
var stop = map[string]bool{"a": true, "an": true, "and": true, "the": true, "for": true, "with": true, "to": true, "my": true, "of": true, "at": true, "i": true}

func tokens(s string) map[string]float64 {
	out := map[string]float64{}
	for _, word := range words.FindAllString(strings.ToLower(s), -1) {
		if !stop[word] {
			out[word]++
		}
	}
	return out
}
func normalize(v map[string]float64) {
	sum := 0.0
	for _, n := range v {
		sum += n * n
	}
	if sum > 0 {
		for k := range v {
			v[k] /= math.Sqrt(sum)
		}
	}
}
func rank(req Request) Response {
	docs := make([]map[string]float64, len(req.Items))
	df := map[string]float64{}
	for i, item := range req.Items {
		docs[i] = tokens(item.Text)
		for term := range docs[i] {
			df[term]++
		}
	}
	idf := func(term string) float64 { return math.Log((1+float64(len(docs)))/(1+df[term])) + 1 }
	for _, doc := range docs {
		for term, count := range doc {
			doc[term] = (1 + math.Log(count)) * idf(term)
		}
		normalize(doc)
	}
	query := tokens(req.Query)
	for term, count := range query {
		query[term] = (1 + math.Log(count)) * idf(term)
	}
	normalize(query)
	saved := map[string]bool{}
	for _, id := range req.Saved {
		saved[id] = true
	}
	profile := map[string]float64{}
	for i, item := range req.Items {
		if saved[item.ID] {
			for term, n := range docs[i] {
				profile[term] += n
			}
		}
	}
	normalize(profile)
	result := Response{Matches: []Match{}, Method: "TF IDF cosine similarity with saved item profile; stock, category and budget filtered by catalog API"}
	for i, item := range req.Items {
		q, p := 0.0, 0.0
		for term, n := range docs[i] {
			q += n * query[term]
			p += n * profile[term]
		}
		score := q
		if len(profile) > 0 {
			if len(query) > 0 {
				score = .75*q + .25*p
			} else {
				score = p
			}
		}
		reason := "Available within your filters"
		if q > 0 {
			reason = "Description matches your search"
		} else if p > 0 {
			reason = "Similar to your saved items"
		}
		result.Matches = append(result.Matches, Match{item.ID, math.Round(score*10000) / 10000, reason})
	}
	sort.SliceStable(result.Matches, func(i, j int) bool {
		if result.Matches[i].Score == result.Matches[j].Score {
			return result.Matches[i].ID < result.Matches[j].ID
		}
		return result.Matches[i].Score > result.Matches[j].Score
	})
	return result
}
func (r *Ranker) cached(req Request) Response {
	encoded, _ := json.Marshal(req)
	digest := sha256.Sum256(encoded)
	key := hex.EncodeToString(digest[:])
	now := r.now()
	r.mu.Lock()
	defer r.mu.Unlock()
	if v, ok := r.entries[key]; ok && now.Before(v.expires) {
		return v.response
	}
	for k, v := range r.entries {
		if !now.Before(v.expires) {
			delete(r.entries, k)
		}
	}
	if len(r.entries) >= 256 {
		for k := range r.entries {
			delete(r.entries, k)
			break
		}
	}
	result := rank(req)
	r.entries[key] = entry{now.Add(30 * time.Second), result}
	return result
}
func (r *Ranker) handler(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	if req.URL.Path == "/health" && req.Method == "GET" {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}
	if req.URL.Path != "/rank" {
		http.Error(w, `{"error":"Not found"}`, 404)
		return
	}
	if req.Method != "POST" {
		w.Header().Set("Allow", "POST")
		http.Error(w, `{"error":"Use POST"}`, 405)
		return
	}
	req.Body = http.MaxBytesReader(w, req.Body, 1<<20)
	var body Request
	decoder := json.NewDecoder(req.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || len(body.Query) > 1200 || len(body.Items) == 0 || len(body.Items) > 500 || len(body.Saved) > 100 {
		http.Error(w, `{"error":"Invalid ranking request"}`, 400)
		return
	}
	ids := map[string]bool{}
	for _, item := range body.Items {
		if item.ID == "" || len(item.ID) > 80 || len(item.Text) > 4000 || ids[item.ID] {
			http.Error(w, `{"error":"Invalid or duplicate item"}`, 400)
			return
		}
		ids[item.ID] = true
	}
	json.NewEncoder(w).Encode(r.cached(body))
}
func main() {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8090"
	}
	server := &http.Server{Addr: addr, Handler: http.HandlerFunc(NewRanker().handler), ReadHeaderTimeout: 3 * time.Second, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8192}
	log.Printf("Ranker listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}
