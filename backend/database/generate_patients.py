import random
import json
import datetime as dt
from typing import Any, Dict, List

random.seed(0)

FIRST_NAMES = [
    "John", "Sophia", "Michael", "Emily", "Liam", "Olivia", "Noah", "Ava",
    "Ethan", "Isabella", "Mason", "Mia", "Logan", "Amelia", "Lucas", "Harper",
    "Alexander", "Evelyn", "Daniel", "Abigail"
]

LAST_NAMES = [
    "Carter", "Martinez", "Johnson", "Rodriguez", "Miller", "Brown",
    "Garcia", "Davis", "Wilson", "Anderson", "Thomas", "Taylor", "Moore",
    "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris"
]

DIAGNOSES = [
    "Type 2 Diabetes",
    "Hypertension",
    "Asthma",
    "Coronary Artery Disease",
    "Atrial Fibrillation",
    "Chronic Kidney Disease",
    "Hyperlipidemia",
    "Depression",
    "Generalized Anxiety Disorder",
    "Osteoarthritis",
    "COPD",
    "Hypothyroidism"
]

SYMPTOM_TRENDS = [
    "Symptoms stable over the last month",
    "Gradual improvement over the past 2 weeks",
    "Worsening symptoms during physical activity",
    "Increased fatigue over the past 3 weeks",
    "Shortness of breath on exertion",
    "Occasional chest discomfort at night",
    "Sleep quality has improved slightly",
    "Frequent headaches reported in the last 10 days"
]

LIFESTYLE_FACTORS = [
    "Sedentary lifestyle, high processed food intake",
    "Moderately active, occasional exercise",
    "Highly active, regular exercise routine",
    "Smoker, limited physical activity",
    "Former smoker, moderate activity level",
    "Balanced diet, good fluid intake",
    "High-stress job, irregular meal patterns"
]

NOTE_SUMMARIES = [
    "Condition stable with current treatment.",
    "Requires closer follow-up due to lab trends.",
    "Patient reports partial symptom relief.",
    "Medication side effects discussed and monitored.",
    "Lifestyle modification strongly recommended."
]

QUAL_IMPRESSIONS = [
    "Patient appears motivated to improve.",
    "Adherence is inconsistent but improving.",
    "Limited understanding of condition, education provided.",
    "Family support present and helpful.",
    "Patient expresses concern about long-term prognosis."
]

MED_NAMES = [
    "Metformin", "Lisinopril", "Atorvastatin", "Albuterol", "Levothyroxine",
    "Aspirin", "Warfarin", "Sertraline", "Losartan", "Amlodipine"
]


def random_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def random_dob(start_year: int = 1950, end_year: int = 2007) -> str:
    start = dt.date(start_year, 1, 1).toordinal()
    end = dt.date(end_year, 12, 31).toordinal()
    return dt.date.fromordinal(random.randint(start, end)).isoformat()


def random_recent_date() -> str:
    start = dt.date(2024, 1, 1).toordinal()
    end = dt.date(2025, 11, 1).toordinal()
    return dt.date.fromordinal(random.randint(start, end)).isoformat()


def make_patient(idx: int) -> Dict[str, Any]:
    patient_id = f"P{idx:03d}"
    dob = random_dob()
    dob_dt = dt.date.fromisoformat(dob)
    # rough age as of mid-2025
    age = 2025 - dob_dt.year - (1 if (dob_dt.month, dob_dt.day) > (6, 30) else 0)

    vitals: Dict[str, Any] = {
        "blood_pressure": {
            "systolic": random.randint(100, 170),
            "diastolic": random.randint(60, 105),
        },
        "heart_rate": random.randint(55, 110),
        "temperature_c": round(random.uniform(36.3, 38.2), 1),
        "respiratory_rate": random.randint(14, 24),
        "oxygen_saturation": random.randint(90, 100),
    }

    risk_scores: Dict[str, float] = {
        "cardiac_risk_score": round(random.uniform(0.1, 0.95), 2),
        "diabetes_risk_score": round(random.uniform(0.0, 0.95), 2),
        "hospital_readmission_probability_30d": round(random.uniform(0.0, 0.9), 2),
        "medication_noncompliance_probability": round(random.uniform(0.0, 0.9), 2),
    }

    diagnoses: List[str] = random.sample(DIAGNOSES, k=random.randint(1, 3))

    medical_history: Dict[str, Any] = {
        "diagnoses": diagnoses,
        "symptom_trend": random.choice(SYMPTOM_TRENDS),
        "lifestyle_factors": random.choice(LIFESTYLE_FACTORS),
    }

    labs: Dict[str, Any] = {
        "hba1c": round(random.uniform(4.8, 10.5), 1),
        "fasting_glucose_mg_dl": random.randint(80, 220),
        "creatinine_mg_dl": round(random.uniform(0.6, 2.2), 1),
        "cholesterol": {
            "ldl": random.randint(70, 210),
            "hdl": random.randint(30, 80),
            "triglycerides": random.randint(60, 280),
        },
    }

    meds: List[Dict[str, Any]] = []
    meds_count = random.randint(1, 4)
    for name in random.sample(MED_NAMES, k=meds_count):
        med: Dict[str, Any] = {"name": name}

        if name in [
            "Metformin", "Lisinopril", "Atorvastatin", "Levothyroxine",
            "Aspirin", "Warfarin", "Losartan", "Amlodipine"
        ]:
            med["dose_mg"] = random.choice([5, 10, 20, 40, 50, 500, 750])
        else:
            med["dose"] = random.choice(["1 puff", "2 puffs", "10 mg", "20 mg"])

        med["frequency"] = random.choice(["1x daily", "2x daily", "At bedtime", "As needed"])
        med["adherence_rating"] = random.choice(["Low", "Moderate", "High"])
        meds.append(med)

    provider_notes: List[Dict[str, Any]] = []
    for _ in range(random.randint(1, 3)):
        provider_notes.append({
            "date": random_recent_date(),
            "note_summary": random.choice(NOTE_SUMMARIES),
            "qualitative_impression": random.choice(QUAL_IMPRESSIONS),
            "severity_index": round(random.uniform(0.1, 0.95), 2),
        })

    accessible_users: List[str] = [
        f"U{u:04d}" for u in random.sample(range(1001, 1011), k=random.randint(1, 4))
    ]

    return {
        "patient_id": patient_id,
        "user_access": accessible_users,
        "demographics": {
            "name": random_name(),
            "age": age,
            "gender": random.choice(["Male", "Female"]),
            "dob": dob,
        },
        "vitals": vitals,
        "risk_scores": risk_scores,
        "medical_history": medical_history,
        "labs": labs,
        "medications_active": meds,
        "provider_notes": provider_notes,
    }


def main() -> None:
    patients: List[Dict[str, Any]] = [make_patient(i) for i in range(1, 101)]
    with open("patients_100.json", "w") as f:
        json.dump(patients, f, indent=2)
    print("✅ Generated 100 patients into patients_100.json")


if __name__ == "__main__":
    main()
