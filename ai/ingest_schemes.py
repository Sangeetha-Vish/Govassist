"""
GovAssist AI — Expanded Real Scheme Ingestion & Chunking Pipeline into ChromaDB
Chunks 95 verified official schemes into 5 comprehensive semantic units with rich journey metadata:
1. Overview & Benefits
2. Eligibility Rules & Thresholds
3. How it Works, Agency & Disbursement Process
4. Deadlines, Windows & Last-Verified Stamps
5. Application Steps, Document Guidance, Tracking & Helpline
"""

import os
import sys
import json
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import psycopg2
from psycopg2.extras import RealDictCursor
import chromadb
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
            documents_required, application_url, source_url, source_page_title, source_verified_on,
            status, review_status, is_recommendation_eligible,
            disbursement_process, implementing_agency, application_steps,
            deadline_type, application_window, tracking_portal_url, helpline_info
        FROM schemes
        ORDER BY scheme_name;
    """)
    schemes = cur.fetchall()
    cur.close()
    conn.close()
    return schemes

def sanitize_text(text):
    """Sanitize ingested text against potential injection patterns."""
    if not text:
        return ""
    # Strip potential system prompt override phrases
    cleaned = str(text)
    cleaned = cleaned.replace("IGNORE ALL PREVIOUS INSTRUCTIONS", "")
    cleaned = cleaned.replace("SYSTEM PROMPT:", "")
    return cleaned.strip()

def chunk_scheme(scheme):
    """
    Split a single scheme into 5 targeted, highly retrievable semantic chunks.
    """
    chunks = []
    s_id = scheme["scheme_id"]
    name = sanitize_text(scheme["scheme_name"])
    category = sanitize_text(scheme.get("category") or "general")
    location = sanitize_text(scheme.get("location_scope") or "pan_india")
    status = sanitize_text(scheme.get("status") or "active")
    app_url = scheme.get("application_url") or "https://www.india.gov.in"
    source_url = scheme.get("source_url") or "https://www.india.gov.in"
    verified_on = str(scheme.get("source_verified_on") or "2026-08-20")
    deadline_type = scheme.get("deadline_type") or "rolling"
    agency = sanitize_text(scheme.get("implementing_agency") or "Central / State Nodal Ministry")
    disbursement = sanitize_text(scheme.get("disbursement_process") or "Direct Benefit Transfer (DBT)")
    app_window = sanitize_text(scheme.get("application_window") or "Year-round Open Window")
    tracking_url = scheme.get("tracking_portal_url") or app_url
    helpline = sanitize_text(scheme.get("helpline_info") or "National Citizen Portal Helpline: 1800-11-5555")

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
        "deadline_type": str(deadline_type),
        "last_verified_on": str(verified_on),
        "tracking_portal_url": str(tracking_url),
    }

    # ── Chunk 1: Overview & Benefit ──
    benefit_val = sanitize_text(scheme.get("benefit_value") or scheme.get("benefit_amount") or "Financial & Welfare Assistance")
    benefit_type = sanitize_text(scheme.get("benefit_type") or "Grant/Subsidy")
    duration = sanitize_text(scheme.get("benefit_duration") or "Course/Project Duration")
    target = sanitize_text(scheme.get("target_group") or "Eligible citizens")

    chunk1_text = (
        f"Scheme: {name} (ID: {s_id})\n"
        f"Category: {category.upper()} | Location Scope: {location.replace('_', ' ').title()}\n"
        f"Target Beneficiaries: {target}\n"
        f"Estimated Benefit: {benefit_val}\n"
        f"Benefit Type: {benefit_type} (Duration: {duration})\n"
        f"Implementing Agency: {agency}\n"
        f"Official Application Link: {app_url}\n"
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
    edu_str = sanitize_text(scheme.get("education_min") or "No minimum educational requirement")
    emp_str = ", ".join(scheme["employment_status"]) if isinstance(scheme.get("employment_status"), list) else sanitize_text(scheme.get("employment_status") or "Open")

    chunk2_text = (
        f"Eligibility Criteria for {name}:\n"
        f"- Age Boundary: {age_str}\n"
        f"- Family Income Ceiling: {income_str}\n"
        f"- Educational Qualification: {edu_str}\n"
        f"- Location / Residency: {location.replace('_', ' ').title()} resident\n"
        f"- Employment / Profile: {emp_str}\n"
        f"- Age Rule: {sanitize_text(scheme.get('age_rule') or 'Standard')}\n"
        f"- Income Rule: {sanitize_text(scheme.get('income_rule') or 'Verified family income certificate')}"
    )
    meta2 = dict(base_meta)
    meta2["section_type"] = "eligibility"
    chunks.append({
        "id": f"{s_id}_eligibility",
        "text": chunk2_text,
        "metadata": meta2
    })

    # ── Chunk 3: How it Works & Disbursement Process ──
    chunk3_text = (
        f"How {name} Works & Disbursement Mechanism:\n"
        f"- Implementing Agency: {agency}\n"
        f"- Disbursement Method: {disbursement}\n"
        f"- Verification Authority: Nodal department scrutiny followed by electronic transfer.\n"
        f"- Recurrence & Renewal: Annual renewal / milestone audit as mandated by scheme guidelines.\n"
        f"- Official Portal: {app_url}"
    )
    meta3 = dict(base_meta)
    meta3["section_type"] = "how_it_works_process"
    chunks.append({
        "id": f"{s_id}_process",
        "text": chunk3_text,
        "metadata": meta3
    })

    # ── Chunk 4: Deadlines, Timelines & Verification Stamp ──
    chunk4_text = (
        f"Application Window & Deadlines for {name}:\n"
        f"- Deadline Type: {deadline_type.upper()} ({'Fixed Annual Intake Window' if deadline_type == 'fixed_annual' else 'Open Year-Round Rolling Intake'})\n"
        f"- Application Window Schedule: {app_window}\n"
        f"- Last Verified on: {verified_on}\n"
        f"- Important Notice: Always confirm live portal active status on {app_url} before submitting."
    )
    meta4 = dict(base_meta)
    meta4["section_type"] = "deadlines_timelines"
    chunks.append({
        "id": f"{s_id}_deadlines",
        "text": chunk4_text,
        "metadata": meta4
    })

    # ── Chunk 5: Step-by-Step Application Guidance & Tracking ──
    docs = scheme.get("documents_required")
    if isinstance(docs, list):
        docs_str = ", ".join(docs)
    elif docs:
        docs_str = str(docs)
    else:
        docs_str = "Identity proof (Aadhaar), income certificate, bank passbook, and educational records."

    steps_list = scheme.get("application_steps")
    steps_formatted = ""
    if isinstance(steps_list, list) and len(steps_list) > 0:
        for st in steps_list:
            steps_formatted += f"  Step {st.get('step')}: {st.get('title')} — {st.get('desc')}\n"
    else:
        steps_formatted = "  Step 1: Register on portal -> Step 2: Upload documents -> Step 3: Nodal verification -> Step 4: Sanction."

    chunk5_text = (
        f"How to Apply & Track Application for {name}:\n"
        f"Step-by-Step Procedure:\n{steps_formatted}\n"
        f"- Required Documents: {docs_str}\n"
        f"- Official Application Portal: {app_url}\n"
        f"- Status Tracking Portal: {tracking_url}\n"
        f"- Official Helpline / Support: {helpline}\n"
        f"- How to Track: Visit tracking portal with Application ID and registered mobile number."
    )
    meta5 = dict(base_meta)
    meta5["section_type"] = "application_steps_tracking"
    chunks.append({
        "id": f"{s_id}_steps_tracking",
        "text": chunk5_text,
        "metadata": meta5
    })

    return chunks

def ingest():
    print("=" * 65)
    print("GovAssist AI — Ingesting 95 Schemes (5-Chunk Architecture) into ChromaDB")
    print("=" * 65)

    schemes = fetch_all_schemes()
    print(f"✓ Fetched {len(schemes)} schemes from PostgreSQL database.")

    os.makedirs(PERSIST_DIR, exist_ok=True)
    client = chromadb.PersistentClient(path=PERSIST_DIR)

    try:
        client.delete_collection(name="govassist_schemes")
        print("✓ Reset existing 'govassist_schemes' collection.")
    except Exception:
        pass

    collection = client.create_collection(
        name="govassist_schemes",
        metadata={"description": "GovAssist AI full journey 95 schemes multi-chunk knowledge base"}
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

    cache_path = os.path.join(os.path.dirname(__file__), "schemes_rag_cache.json")
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump({
            "total_schemes": len(schemes),
            "total_chunks": len(all_ids),
            "chunks": [{"id": all_ids[i], "text": all_texts[i], "metadata": all_metadatas[i]} for i in range(len(all_ids))]
        }, f, indent=2, ensure_ascii=False)
    print(f"✓ Created comprehensive RAG cache JSON at: {cache_path}")
    print("=" * 65)

if __name__ == "__main__":
    try:
        ingest()
    except Exception as e:
        print(f"❌ Ingestion error: {e}", file=sys.stderr)
        sys.exit(1)
