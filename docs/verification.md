# Verification record

Verified on 2026-10-25.

GitHub Actions passed Go ranking/cache tests, Java filter tests, frontend build, Compose containers and production gateway tests.

The live Railway smoke test verified ranking, stock exclusion, category and budget filters, and invalid-budget rejection. Chrome verified search, the product dialog, saving an item, and focus restoration. A small burst of 30 read requests returned 14 successes and 16 rate-limit responses.

## Scope and limits

The catalog contains fictional sample products. TF IDF ranking and saved-item preferences are implemented; this is not a trained commercial recommendation model or a live retailer inventory feed. Saved selections remain in the visitor browser. There is no checkout.

Production containers ran successfully in GitHub Actions and Railway. The local Docker engine was unavailable. Phone-sized browser rendering was not verified in this session.
