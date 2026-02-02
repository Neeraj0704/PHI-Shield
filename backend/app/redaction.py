"""
PHI redaction module (Aparavi-compliant).
Uses Microsoft Presidio for PII/PHI detection and redaction when available;
falls back to regex-based redaction otherwise.
"""
import logging
import re
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Tuple

logger = logging.getLogger(__name__)

# Optional: Microsoft Presidio for better redaction (person, location, email, phone, SSN, dates, medical IDs, etc.)
_PRESIDIO_AVAILABLE = False
_PRESIDIO_ANALYZER = None
_PRESIDIO_ANONYMIZER = None

try:
    from presidio_analyzer import AnalyzerEngine
    from presidio_anonymizer import AnonymizerEngine
    from presidio_anonymizer.entities import OperatorConfig

    _PRESIDIO_AVAILABLE = True
except ImportError:
    pass

# Entities to detect (healthcare-relevant). Subset of Presidio's supported entities.
_PRESIDIO_ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "DATE_TIME",
    "US_SSN",
    "LOCATION",
    "MEDICAL_LICENSE",
    "US_DRIVER_LICENSE",
    "US_BANK_NUMBER",
    "CREDIT_CARD",
    "US_ITIN",
    "US_PASSPORT",
]


def _get_presidio_engines():
    """Lazy-init Presidio analyzer and anonymizer (can be slow / load spacy)."""
    global _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER
    if not _PRESIDIO_AVAILABLE:
        return None, None
    if _PRESIDIO_ANALYZER is None:
        try:
            _PRESIDIO_ANALYZER = AnalyzerEngine()
            _PRESIDIO_ANONYMIZER = AnonymizerEngine()
        except Exception:
            return None, None
    return _PRESIDIO_ANALYZER, _PRESIDIO_ANONYMIZER


def _redact_with_presidio(text: str) -> Tuple[str, List["PHIClassification"]]:
    """Use Presidio to analyze and anonymize text. Returns (redacted_text, classifications)."""
    analyzer, anonymizer = _get_presidio_engines()
    if analyzer is None or anonymizer is None:
        raise RuntimeError("Presidio not available")

    # Get supported entities for English and restrict to our list
    try:
        supported = analyzer.get_supported_entities(language="en")
    except Exception:
        supported = _PRESIDIO_ENTITIES
    entities = [e for e in _PRESIDIO_ENTITIES if e in supported] or supported[:20]

    results = analyzer.analyze(text=text, language="en", entities=entities)
    # Redact with # (replace each PII with ########)
    operators = {
        e: OperatorConfig("replace", {"new_value": "########"})
        for e in entities
    }
    operators["DEFAULT"] = OperatorConfig("replace", {"new_value": "########"})
    anonymized = anonymizer.anonymize(
        text=text,
        analyzer_results=results,
        operators=operators,
    )
    redacted_text = anonymized.text if hasattr(anonymized, "text") else str(anonymized)

    # Aggregate by entity type for classifications
    counts = defaultdict(int)
    for r in results:
        counts[r.entity_type] += 1
    classifications = [
        PHIClassification(type=entity_type, count=count)
        for entity_type, count in counts.items()
    ]
    return redacted_text, classifications


@dataclass
class PHIClassification:
    type: str
    count: int
    confidence: float = 1.0


@dataclass
class RedactionResult:
    redacted_text: str
    classifications: List[PHIClassification] = field(default_factory=list)
    risk_severity: str = "LOW"


# Month names for date pattern (e.g. August 19, 1953)
_MONTHS = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"

# Patterns for PHI detection (replace with #)
PATTERNS = [
    (r"\b\d{3}-\d{2}-\d{4}\b", "SSN"),  # SSN 123-45-6789
    (r"\b\d{9}\b", "SSN_OR_ID"),  # 9-digit number
    (r"\b\d{4}-\d{2}-\d{2}\b", "DATE"),  # ISO date
    (r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", "DATE"),  # MM/DD/YYYY
    (r"\b\d{1,2}-\d{1,2}-\d{2,4}\b", "DATE"),  # MM-DD-YYYY
    (_MONTHS + r"\s+\d{1,2},?\s+\d{4}\b", "DATE"),  # August 19, 1953 or August 19 1953
    (r"\bMRN\s*#?\s*\d+\w*\b", "MRN"),  # MRN 12345 or MRN #12345
    (r"\b(?:patient\s+)?(?:id|ID)\s*#?\s*\d+\w*\b", "PATIENT_ID", True),  # case insensitive
    (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "EMAIL"),
    (r"\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b", "PHONE"),  # US phone
    (r"\b(?:Dr\.|Dr)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", "DOCTOR_NAME"),
    (r"\b(?:Mr|Mrs|Ms|Miss)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b", "PATIENT_NAME"),
]

# Simple name pattern: Title Case words (2-3 words) that might be names
NAME_PATTERN = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b"
)


def _redact_with_patterns(text: str) -> Tuple[str, List[PHIClassification]]:
    classifications = []
    result = text
    seen_types = {}

    for item in PATTERNS:
        if len(item) == 3:
            pattern, phi_type, _ = item
            flags = re.IGNORECASE
        else:
            pattern, phi_type = item
            flags = 0
        regex = re.compile(pattern, flags)

        def repl(m):
            seen_types[phi_type] = seen_types.get(phi_type, 0) + 1
            return "#" * min(len(m.group()), 8)

        result = regex.sub(repl, result)

    for phi_type, count in seen_types.items():
        classifications.append(PHIClassification(type=phi_type, count=count))

    return result, classifications


# MRN value when it appears as "(MRN) is 60225458" or "MRN is 60225458" (number not adjacent to MRN in pattern)
_MRN_IS_PATTERN = re.compile(r"((?:\(MRN\)|MRN)\s*is\s+)(\d{6,10})\b", re.IGNORECASE)


def _redact_mrn_standalone(text: str, classifications: List[PHIClassification]) -> str:
    """Redact MRN value when it appears after '(MRN) is ' or 'MRN is '."""
    count = [0]

    def repl(m):
        count[0] += 1
        return m.group(1) + "#" * min(8, len(m.group(2)))

    result = _MRN_IS_PATTERN.sub(repl, text)
    if count[0] > 0:
        classifications.append(PHIClassification(type="MRN", count=count[0]))
    return result


def _redact_names(text: str, classifications: List[PHIClassification]) -> str:
    """Redact likely names (Title Case multi-word). Be conservative."""
    count = [0]  # use list to allow mutation in closure

    def replace(m):
        name = m.group(1)
        if any(
            name.lower().startswith(x)
            for x in ("blood", "heart", "patient", "doctor", "medication")
        ):
            return name
        count[0] += 1
        return "#" * min(len(name), 12)

    result = NAME_PATTERN.sub(replace, text)
    if count[0] > 0:
        classifications.append(PHIClassification(type="NAME", count=count[0]))
    return result


def _risk_severity(classifications: List[PHIClassification]) -> str:
    if not classifications:
        return "LOW"
    # High-risk: identifiers and names (regex + Presidio entity names)
    high_risk = {
        "SSN", "SSN_OR_ID", "PATIENT_NAME", "DOCTOR_NAME",
        "US_SSN", "PERSON", "US_ITIN", "US_PASSPORT", "MEDICAL_LICENSE",
    }
    types_found = {c.type for c in classifications}
    if high_risk & types_found and len(classifications) >= 3:
        return "HIGH"
    if high_risk & types_found or len(classifications) >= 4:
        return "MEDIUM"
    return "LOW"


def redact(text: str) -> RedactionResult:
    """Redact PHI from text. Uses Presidio when available, else regex fallback."""
    if not text or not text.strip():
        return RedactionResult(redacted_text=text, risk_severity="LOW")

    # Prefer Microsoft Presidio for better coverage (person, location, email, phone, SSN, dates, medical IDs)
    if _PRESIDIO_AVAILABLE:
        try:
            result, classifications = _redact_with_presidio(text)
            severity = _risk_severity(classifications)
            logger.info("Redaction: Presidio")
            print("[Redaction] Presidio", flush=True)
            return RedactionResult(
                redacted_text=result.strip(),
                classifications=classifications,
                risk_severity=severity,
            )
        except Exception as e:
            logger.debug("Redaction: Presidio failed (%s), using regex fallback", e)
            pass  # fall back to regex

    # Fallback: regex-based redaction
    logger.info("Redaction: regex")
    print("[Redaction] regex", flush=True)
    result, classifications = _redact_with_patterns(text)
    result = _redact_mrn_standalone(result, classifications)
    result = _redact_names(result, classifications)
    severity = _risk_severity(classifications)
    return RedactionResult(
        redacted_text=result.strip(),
        classifications=classifications,
        risk_severity=severity,
    )


def redact_query_and_answer(query: str, answer: str) -> Tuple[str, str, List[dict], str]:
    """
    Redact both query and answer. Returns:
    (query_redacted, answer_redacted, phi_classifications_list, risk_severity)
    """
    rq = redact(query or "")
    ra = redact(answer or "")
    # Merge classifications
    all_classes = {}
    for c in rq.classifications + ra.classifications:
        all_classes[c.type] = all_classes.get(c.type, 0) + c.count
    phi_list = [
        {"type": t, "count": n, "confidence": 0.95, "redaction_status": "redacted"}
        for t, n in all_classes.items()
    ]
    # Take higher severity
    order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    severity = rq.risk_severity
    if order.index(ra.risk_severity) > order.index(severity):
        severity = ra.risk_severity
    return rq.redacted_text, ra.redacted_text, phi_list, severity
