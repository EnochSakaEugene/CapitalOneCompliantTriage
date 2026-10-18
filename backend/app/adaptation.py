"""Model adaptation: classic trained classifiers to compare against prompting.

The course asks to compare prompting, RAG and fine-tuning. Full fine-tuning of an LLM is
out of scope for a student budget (no GPU, and Gemini Flash-Lite tuning is not available on
the free tier), so we test the two adaptation routes a bank could actually run in-house:

  tfidf   TF-IDF word/bigram features + logistic regression, trained on the TRAIN split.
          Runs locally: no API calls, no data leaves the bank, ~milliseconds per complaint.
  embed   Gemini embeddings (gemini-embedding-001) + logistic regression ("light fine-tuning":
          a trained head on a frozen foundation model). Needs `python -m scripts.embed_complaints`.

Both predict product and issue (issue restricted to the predicted product's CFPB issues).
They do not write summaries or detect risk well, so risk flags come from the keyword rules;
that limitation is part of the comparison.
"""
import time

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agents import mock_rules
from app.models import Complaint, FewShotExample

TRAINED_VARIANTS = {
    "tfidf": "TF-IDF + logistic regression (trained, local)",
    "embed": "Gemini embeddings + logistic regression (trained head)",
}


class TrainedClassifier:
    def __init__(self, kind: str):
        if kind not in TRAINED_VARIANTS:
            raise ValueError(kind)
        self.kind = kind
        self.info: dict = {}

    # ---------- training ----------
    def fit(self, db: Session) -> "TrainedClassifier":
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression

        t0 = time.perf_counter()
        promoted = set(db.scalars(select(FewShotExample.complaint_id)).all())
        q = select(Complaint).where(Complaint.split == "train", Complaint.product.is_not(None),
                                    Complaint.issue.is_not(None))
        rows = [r for r in db.scalars(q).all() if r.id not in promoted]
        if self.kind == "tfidf":
            self.vec = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=60000, sublinear_tf=True,
                                       stop_words="english")
            X = self.vec.fit_transform([r.narrative for r in rows])
        else:
            rows = [r for r in rows if r.embedding is not None]
            if len(rows) < 50:
                raise RuntimeError("Too few train complaints have embeddings. Run: python -m scripts.embed_complaints")
            X = np.array([np.asarray(r.embedding, dtype=float) for r in rows])
        products = [r.product for r in rows]
        issues = [r.issue for r in rows]
        self.product_clf = LogisticRegression(max_iter=3000, C=4.0).fit(X, products)
        self.issue_clf = LogisticRegression(max_iter=3000, C=4.0).fit(X, issues)
        self.taxonomy: dict[str, set[str]] = {}
        for p, i in zip(products, issues):
            self.taxonomy.setdefault(p, set()).add(i)
        self.info = {"n_train": len(rows), "fit_seconds": round(time.perf_counter() - t0, 2),
                     "products": len(set(products)), "issues": len(set(issues))}
        return self

    # ---------- prediction ----------
    def _features(self, complaint: Complaint, narrative: str):
        if self.kind == "tfidf":
            return self.vec.transform([narrative])
        if complaint.embedding is None:
            raise RuntimeError("Complaint has no embedding. Run: python -m scripts.embed_complaints")
        return np.asarray(complaint.embedding, dtype=float).reshape(1, -1)

    def predict(self, complaint: Complaint, narrative: str, taxonomy: dict[str, list[str]]) -> dict:
        """Same shape as classifier.classify(): {"result", "usage", "ms", "in_taxonomy"}."""
        t0 = time.perf_counter()
        X = self._features(complaint, narrative)
        pp = self.product_clf.predict_proba(X)[0]
        product = self.product_clf.classes_[int(pp.argmax())]
        ip = self.issue_clf.predict_proba(X)[0]
        allowed = set(taxonomy.get(product, [])) | self.taxonomy.get(product, set())
        order = np.argsort(-ip)
        ranked = [self.issue_clf.classes_[i] for i in order if self.issue_clf.classes_[i] in allowed]
        issue = ranked[0] if ranked else self.issue_clf.classes_[int(order[0])]
        alt = ranked[1] if len(ranked) > 1 else issue
        rules = mock_rules.classify(narrative, taxonomy)  # risk flags/sentiment: classifiers can't do these
        result = {**rules, "product": product, "issue": issue, "issue_alt": alt,
                  "confidence": round(float(pp.max()), 3),
                  "summary": rules["summary"], "risk_reason": "Risk from keyword rules (trained classifier "
                                                              "predicts labels only). " + rules["risk_reason"]}
        return {"result": result, "usage": {"input_tokens": 0, "output_tokens": 0},
                "ms": round((time.perf_counter() - t0) * 1000), "in_taxonomy": True}


# Qualitative comparison used on the Evaluation page and in the report.
APPROACHES = [
    {"key": "rules", "approach": "Keyword rules", "family": "Non-GenAI baseline",
     "cost": "Free", "privacy": "Stays in-house", "scalability": "High",
     "maintenance": "High: rules hand-written and break on new wording",
     "outputs": "Labels + basic flags"},
    {"key": "tfidf", "approach": "TF-IDF + logistic regression", "family": "Trained classifier (classic ML)",
     "cost": "Free to run; needs labelled data", "privacy": "Stays in-house",
     "scalability": "High (milliseconds, CPU)",
     "maintenance": "Medium: retrain when products or issues change", "outputs": "Labels only"},
    {"key": "embed", "approach": "Embeddings + trained head", "family": "Light fine-tuning",
     "cost": "Very low (one embedding call)", "privacy": "Text sent to embedding API (redacted)",
     "scalability": "High", "maintenance": "Medium: retrain head; re-embed if the model changes",
     "outputs": "Labels only"},
    {"key": "v2", "approach": "Prompting + taxonomy (zero-shot)", "family": "Prompt engineering",
     "cost": "Per-token API cost", "privacy": "Redacted text sent to LLM API",
     "scalability": "Medium (rate limits, seconds per call)",
     "maintenance": "Low: change the prompt, no training", "outputs": "Labels, risk, summary, reasons"},
    {"key": "v3", "approach": "Few-shot prompting", "family": "Prompt engineering",
     "cost": "~70% more tokens than zero-shot", "privacy": "Redacted text sent to LLM API",
     "scalability": "Medium", "maintenance": "Low: curate examples", "outputs": "Labels, risk, summary, reasons"},
    {"key": "v4", "approach": "Prompting + disambiguation rules", "family": "Prompt engineering",
     "cost": "Per-token API cost", "privacy": "Redacted text sent to LLM API",
     "scalability": "Medium", "maintenance": "Low", "outputs": "Labels, top-2 issue, risk, summary"},
    {"key": "rag", "approach": "RAG for drafting (not classification)", "family": "Retrieval-augmented generation",
     "cost": "+1 embedding call per case", "privacy": "Policy text is public",
     "scalability": "High", "maintenance": "Low: edit knowledge base, re-index",
     "outputs": "Grounded replies with citations"},
    {"key": "finetune", "approach": "Full LLM fine-tuning", "family": "Fine-tuning (not built)",
     "cost": "High: GPU/training jobs + labelled data", "privacy": "Training data shared with provider or GPU host",
     "scalability": "High once trained", "maintenance": "High: retrain for every taxonomy or regulation change",
     "outputs": "Labels (and style)"},
]
