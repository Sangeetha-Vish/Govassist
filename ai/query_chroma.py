"""
GovAssist AI — Query ChromaDB Knowledge Base
Invoked by Node.js RAG service to perform semantic search over 95 official schemes.
"""

import os
import sys
import json
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import chromadb

PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

def query_schemes(query_text, n_results=6, filters=None):
    if not os.path.exists(PERSIST_DIR):
        print(json.dumps({"error": "ChromaDB directory not found", "results": []}))
        return

    client = chromadb.PersistentClient(path=PERSIST_DIR)
    try:
        collection = client.get_collection(name="govassist_schemes")
    except Exception as e:
        print(json.dumps({"error": f"Collection not found: {e}", "results": []}))
        return

    where_filter = None
    if filters and isinstance(filters, dict):
        conds = []
        if filters.get("category") and filters["category"] != "all":
            conds.append({"category": {"$eq": str(filters["category"])}})
        if filters.get("location_scope") and filters["location_scope"] != "all":
            conds.append({"location_scope": {"$in": [filters["location_scope"], "pan_india"]}})
        if filters.get("status"):
            conds.append({"status": {"$eq": str(filters["status"])}})

        if len(conds) == 1:
            where_filter = conds[0]
        elif len(conds) > 1:
            where_filter = {"$and": conds}

    query_params = {
        "query_texts": [query_text],
        "n_results": min(n_results, 15),
    }
    if where_filter:
        query_params["where"] = where_filter

    try:
        res = collection.query(**query_params)
        
        results = []
        docs = res.get("documents", [[]])[0]
        metas = res.get("metadatas", [[]])[0]
        ids = res.get("ids", [[]])[0]
        distances = res.get("distances", [[]])[0] if "distances" in res else [0] * len(docs)

        for i in range(len(docs)):
            results.append({
                "id": ids[i],
                "text": docs[i],
                "metadata": metas[i],
                "distance": distances[i] if i < len(distances) else None
            })

        print(json.dumps({"success": True, "results": results}, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e), "results": []}, ensure_ascii=False))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Query argument missing", "results": []}))
        sys.exit(1)

    query_arg = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 6
    filter_arg = json.loads(sys.argv[3]) if len(sys.argv) > 3 else None

    query_schemes(query_arg, limit, filter_arg)
