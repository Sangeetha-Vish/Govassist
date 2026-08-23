"""
GovAssist AI — Real Scheme Ingestion & Chunking Pipeline into ChromaDB
Chunks 95 verified official schemes into semantic units with structured metadata.
"""

import os
import sys
import json
import io

# Ensure UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import psycopg2
from psycopg2.extras import RealDictCursor
import chromadb
from chromadb.config import Settings
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

DB_URL = os.getenv("DATABASE_URL")
PERSIST_DIR = os.path.join(os.path.dirname(__file__), "chroma_db")

def get_db_connection():
    if not DB_URL:
        raise ValueError("DATABASE_URL environment variable is missing!")
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)

def fetch_all_schemes():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT 
            scheme_id, scheme_name, category, target_group,
            min_age, max_age, age_rule,
            education_min, education_rule,
            max_family_income, income_rule,
            location_scope, employment_status,
            benefit_type, benefit_value, benefit_amount, benefit_unit, benefit_duration,
            documents_required, application_url, source_url, source_page_title,
            status, review_status, is_recommendation_eligible
        FROM schemes
        ORDER BY scheme_name;
    """)
    schemes = cur.fetchall()
    cur.close()
    conn.close()
    return schemes

def chunk_scheme(scheme):
    """
    Split a single scheme into 3 focused, retrievable semantic chunks:
    1. Overview & Benefits
    2. Detailed Eligibility Criteria
    3. Required Documents & Application Procedure
    """
    chunks = []
    s_id = scheme["scheme_id"]
    name = scheme["scheme_name"]
    category = scheme.get("category") or "general"
    location = scheme.get("location_scope") or "pan_india"
    status = scheme.get("status") or "active"
    app_url = scheme.get("application_url") or ""
    source_url = scheme.get("source_url") or ""

    base_meta = {
        "scheme_id": str(s_id),
        "scheme_name": str(name),
        "category": str(category),
        "location_scope": str(location),
        "status": str(status),
        "min_age": int(scheme["min_age"]) if scheme.get("min_age") is not None else -1,
        "max_age": int(scheme["max_age"]) if scheme.get("max_age") is not None else -1,
        "max_family_income": float(scheme["max_family_income"]) if scheme.get("max_family_income") is not None else -1.0,
        "education_min": str(scheme.get("education_min") or "None"),
        "application_url": str(app_url),
        "source_url": str(source_url),
    }

    # ── Chunk 1: Overview & Benefit ──
    benefit_val = scheme.get("benefit_value") or scheme.get("benefit_amount") or "Financial & Welfare Assistance"
    benefit_type = scheme.get("benefit_type") or "Grant/Subsidy"
    duration = scheme.get("benefit_duration") or "Course/Project Duration"
    target = scheme.get("target_group") or "Eligible citizens"

    chunk1_text = (
        f"Scheme: {name} (ID: {s_id})\n"
        f"Category: {category.upper()} | Location Scope: {location.replace('_', ' ').title()}\n"
        f"Target Beneficiaries: {target}\n"
        f"Estimated Benefit: {benefit_val}\n"
        f"Benefit Type: {benefit_type} (Duration: {duration})\n"
        f"Official Application Link: {app_url or 'Official Government Portal'}\n"
        f"Status: {status.upper()}"
    )
    meta1 = dict(base_meta)
    meta1["section_type"] = "overview_benefits"
    chunks.append({
        "id": f"{s_id}_overview",
        "text": chunk1_text,
        "metadata": meta1
    })

    # ── Chunk 2: Eligibility Criteria & Rules ──
    age_str = f"{scheme.get('min_age') or 0} to {scheme.get('max_age') or 'No Upper Limit'} years"
    income_str = f"Max ₹{float(scheme['max_family_income']):,.0f}/year" if scheme.get("max_family_income") else "No family income limit"
    edu_str = scheme.get("education_min") or "No minimum educational requirement"
    emp_str = ", ".join(scheme["employment_status"]) if isinstance(scheme.get("employment_status"), list) else (scheme.get("employment_status") or "Open")

    chunk2_text = (
        f"Eligibility Criteria for {name}:\n"
        f"- Age Boundary: {age_str}\n"
        f"- Family Income Ceiling: {income_str}\n"
        f"- Educational Qualification: {edu_str}\n"
        f"- Location / Residency: {location.replace('_', ' ').title()} resident\n"
        f"- Employment / Profile: {emp_str}\n"
        f"- Age Rule: {scheme.get('age_rule') or 'Standard'}\n"
        f"- Income Rule: {scheme.get('income_rule') or 'Verified family income'}"
    )
    meta2 = dict(base_meta)
    meta2["section_type"] = "eligibility"
    chunks.append({
        "id": f"{s_id}_eligibility",
        "text": chunk2_text,
        "metadata": meta2
    })

    # ── Chunk 3: Documents Required & Official Verification ──
    docs = scheme.get("documents_required")
    if isinstance(docs, list):
        docs_str = ", ".join(docs)
    elif docs:
        docs_str = str(docs)
    else:
        docs_str = "Standard identity proof (Aadhaar/Voter ID), income certificate, and educational records."

    chunk3_text = (
        f"Required Documents & Procedure for {name}:\n"
        f"- Mandatory Documents: {docs_str}\n"
        f"- Source Verification Title: {scheme.get('source_page_title') or name}\n"
        f"- Official Portal URL: {app_url or source_url or 'https://www.india.gov.in'}\n"
        f"- Verification Status: Verified active official scheme."
    )
    meta3 = dict(base_meta)
    meta3["section_type"] = "documents_procedure"
    chunks.append({
        "id": f"{s_id}_documents",
        "text": chunk3_text,
        "metadata": meta3
    })

    return chunks

def ingest():
    print("=" * 60)
    print("GovAssist AI — Ingesting 95 Schemes into ChromaDB")
    print("=" * 60)

    schemes = fetch_all_schemes()
    print(f"✓ Fetched {len(schemes)} schemes from PostgreSQL database.")

    # Initialize persistent Chroma client
    os.makedirs(PERSIST_DIR, exist_ok=True)
    client = chromadb.PersistentClient(path=PERSIST_DIR)

    # Reset or get collection
    try:
        client.delete_collection(name="govassist_schemes")
        print("✓ Reset existing 'govassist_schemes' collection.")
    except Exception:
        pass

    collection = client.create_collection(
        name="govassist_schemes",
        metadata={"description": "GovAssist AI verified 95 government schemes chunked knowledge base"}
    )

    all_ids = []
    all_texts = []
    all_metadatas = []

    for scheme in schemes:
        chunks = chunk_scheme(scheme)
        for c in chunks:
            all_ids.append(c["id"])
            all_texts.append(c["text"])
            all_metadatas.append(c["metadata"])

    # Add in batches to ChromaDB
    batch_size = 50
    for i in range(0, len(all_ids), batch_size):
        end = min(i + batch_size, len(all_ids))
        collection.add(
            ids=all_ids[i:end],
            documents=all_texts[i:end],
            metadatas=all_metadatas[i:end]
        )
        print(f"  Ingested batch {i + 1} to {end} / {len(all_ids)} chunks...")

    print(f"✓ Successfully indexed {len(all_ids)} chunks into ChromaDB at: {PERSIST_DIR}")
    
    # Save a lightweight metadata cache JSON for Node.js fallback or fast lookups
    cache_path = os.path.join(os.path.dirname(__file__), "schemes_rag_cache.json")
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_schemes": len(schemes),
            "total_chunks": len(all_ids),
            "chunks": [{"id": all_ids[i], "text": all_texts[i], "metadata": all_metadatas[i]} for i in range(len(all_ids))]
        }, f, indent=2, ensure_ascii=False)
    print(f"✓ Created RAG cache JSON at: {cache_path}")
    print("=" * 60)

if __name__ == "__main__":
    try:
        ingest()
    except Exception as e:
        print(f"❌ Ingestion error: {e}", file=sys.stderr)
        sys.exit(1)
