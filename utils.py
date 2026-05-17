import ast
import json
import os
import numpy as np

def categorize_trend(value):
    if value > 0.05:
        return "increasing"
    elif value < -0.05:
        return "decreasing"
    return "stable"


def _parse_list_col(val):
    if isinstance(val, list):
        return val
    try:
        return ast.literal_eval(val)
    except Exception:
        return [str(val)]


def render_patient_note(row):
    chief = ", ".join(_parse_list_col(row["chiefcomplaint"]))
    meds  = ", ".join(_parse_list_col(row["med_record"]))
    return (
        f"Patient Record\n"
        f"- Gender: {row['gender']}\n"
        f"- Race: {row['race']}\n"
        f"- Disposition: {row['disposition']}\n"
        f"- Chief complaint: {chief}\n"
        f"- Acuity: {int(row['acuity'])}\n"
        f"- Pain score: {int(row['pain'])}\n"
        f"- Medication history: {meds}\n"
        f"\n"
        f"Vitals on Arrival\n"
        f"- Temperature: {row['temperature']} F\n"
        f"- Heart rate: {row['heartrate']} bpm\n"
        f"- Respiratory rate: {row['resprate']} breaths/min\n"
        f"- O2 saturation: {row['o2sat']}%\n"
        f"- Blood pressure: {row['sbp']}/{row['dbp']} mmHg\n"
        f"\n"
        f"ICU Vital Trends (mean, trend)\n"
        f"- Heart rate: {row['heartrate_vital_mean']} bpm, {categorize_trend(row['heartrate_vital_trend'])}\n"
        f"- Respiratory rate: {row['resprate_vital_mean']}, {categorize_trend(row['resprate_vital_trend'])}\n"
        f"- O2 saturation: {row['o2sat_vital_mean']}%, {categorize_trend(row['o2sat_vital_trend'])}\n"
        f"- SBP: {row['sbp_vital_mean']}, {categorize_trend(row['sbp_vital_trend'])}\n"
        f"- DBP: {row['dbp_vital_mean']}, {categorize_trend(row['dbp_vital_trend'])}"
    )

_STAGE1_INSTRUCTION = (
    "You are a clinical decision support assistant. "
    "Given a patient record, output a JSON object with exactly three keys:\n"
    "  \"icd_titles\": list of ICD diagnosis titles\n"
    "  \"retrieval_query\": short query string for retrieving relevant clinical guidelines\n"
    "  \"adm_medications\": list of medications administered during the visit"
)


def format_stage1_prompt(patient_note, response=None):
    prompt = f"<s>[INST] {_STAGE1_INSTRUCTION}\n\n{patient_note} [/INST]"
    if response is not None:
        prompt += f" {response} </s>"
    return prompt

_STAGE2_INSTRUCTION = (
    "You are a clinical decision support assistant. "
    "Given a patient record, predicted diagnoses, and retrieved clinical guidelines, "
    "write a treatment recommendation. "
    "End each suggestion with a citation in the form: \u2014 Developer (strength)."
)


def format_stage2_prompt(patient_note, icd_titles, snippets, response=None):
    icd_str = ", ".join(icd_titles)
    snippet_blocks = [
        f"[{i+1}] {s['title']} ({s['developer']}, {s['recommendation_norm']}):\n{s['text']}"
        for i, s in enumerate(snippets)
    ]
    snippets_str = "\n\n".join(snippet_blocks)
    user_content = (
        f"{_STAGE2_INSTRUCTION}\n\n"
        f"Patient Record:\n{patient_note}\n\n"
        f"Predicted diagnoses: {icd_str}\n\n"
        f"Retrieved Guidelines:\n{snippets_str}"
    )
    prompt = f"<s>[INST] {user_content} [/INST]"
    if response is not None:
        prompt += f" {response} </s>"
    return prompt

_embed_model = None


def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        from sentence_transformers import SentenceTransformer
        _embed_model = SentenceTransformer("pritamdeka/S-PubMedBert-MS-MARCO")
    return _embed_model


def build_rag_index(crest_df):
    """Embed CREST title+text, build FAISS IndexFlatIP, return (index, id_map)."""
    import faiss

    model = _get_embed_model()
    docs = (crest_df["title"] + "\n\n" + crest_df["text"]).tolist()
    embeddings = model.encode(
        docs, batch_size=32, show_progress_bar=True, normalize_embeddings=True
    ).astype("float32")

    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)

    id_map = {
        i: {
            "title": str(row["title"]),
            "developer": str(row["developer"]),
            "text": str(row["text"]),
            "recommendation_norm": str(row["recommendation_norm"]),
        }
        for i, row in crest_df.reset_index(drop=True).iterrows()
    }
    return index, id_map


def retrieve(query, index, id_map, k=5):
    """Return top-k CREST rows for query using cosine similarity."""
    model = _get_embed_model()
    q_emb = model.encode([query], normalize_embeddings=True).astype("float32")
    _, indices = index.search(q_emb, k)
    return [id_map[int(i)] for i in indices[0] if int(i) in id_map]


def load_biomistral_4bit():
    """Load BioMistral-7B in 4-bit NF4. Returns (model, tokenizer)."""
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=torch.float16,
    )

    model_id = "BioMistral/BioMistral-7B"
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
    )
    model.config.use_cache = False

    return model, tokenizer
