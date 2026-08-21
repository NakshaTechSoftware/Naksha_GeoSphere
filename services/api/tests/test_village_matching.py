"""Tests for the KGIS <-> Kaveri name-matching algorithm. Pure functions,
no network/DB - covers the task spec's 4-priority cascade and score bands
directly, without needing either live external service this sandbox can't
reach."""

from __future__ import annotations

from app.modules.pricing.village_matching import (
    AUTO_CONFIRM_THRESHOLD,
    PENDING_REVIEW_THRESHOLD,
    match_hierarchy_name,
    match_village,
    normalize_name,
    status_for_score,
)


def test_normalize_name_collapses_case_and_punctuation() -> None:
    assert normalize_name("Belthangadi") == normalize_name("BELTHANGADI")
    assert normalize_name("Hosa-Halli") == normalize_name("Hosa Halli")


def test_normalize_name_collapses_common_transliteration_variants() -> None:
    # "th" -> "t" collapse: "Belthangadi" and "Beltangadi" are the same
    # village written two common ways.
    assert normalize_name("Belthangadi") == normalize_name("Beltangadi")


def test_match_hierarchy_name_exact_normalized_match_scores_100() -> None:
    candidates = [{"code": "1", "name": "Dakshina Kannada"}, {"code": "2", "name": "Udupi"}]
    result = match_hierarchy_name("dakshina kannada", candidates, name_key="name")
    assert result is not None
    assert result.score == 100.0
    assert result.candidate["code"] == "1"


def test_match_hierarchy_name_falls_back_to_fuzzy() -> None:
    candidates = [{"code": "1", "name": "Chikkamagaluru"}, {"code": "2", "name": "Udupi"}]
    result = match_hierarchy_name("Chikmagalur", candidates, name_key="name")
    assert result is not None
    assert result.candidate["code"] == "1"
    assert 0 < result.score < 100


def test_match_hierarchy_name_empty_candidates_returns_none() -> None:
    assert match_hierarchy_name("Anything", [], name_key="name") is None


def test_match_village_priority1_exact_name_match() -> None:
    candidates = [{"villagecode": "V1", "villagename": "Beltangadi"}]
    result = match_village("Belthangadi", "Beltangady", "Dakshina Kannada", candidates)
    assert result is not None
    assert result.priority == 1
    assert result.candidate["villagecode"] == "V1"
    assert result.score >= AUTO_CONFIRM_THRESHOLD


def test_match_village_priority2_exact_name_plus_taluk_wins_over_wrong_taluk_duplicate() -> None:
    # Two candidates share the exact same normalized name but belong to
    # different taluks - the one whose taluk matches the KGIS village's own
    # taluk must win, not just the first exact-name hit found.
    candidates = [
        {"villagecode": "WRONG", "villagename": "Kasaba", "taluk": "Other Taluk"},
        {"villagecode": "RIGHT", "villagename": "Kasaba", "taluk": "Beltangady"},
    ]
    result = match_village("Kasaba", "Beltangady", "Dakshina Kannada", candidates)
    assert result is not None
    assert result.priority == 2
    assert result.candidate["villagecode"] == "RIGHT"
    assert result.score == 100.0


def test_match_village_priority3_exact_name_plus_district_when_no_taluk_field() -> None:
    candidates = [
        {"villagecode": "WRONG", "villagename": "Kasaba", "district": "Other District"},
        {"villagecode": "RIGHT", "villagename": "Kasaba", "district": "Dakshina Kannada"},
    ]
    result = match_village("Kasaba", "Beltangady", "Dakshina Kannada", candidates)
    assert result is not None
    assert result.priority == 3
    assert result.candidate["villagecode"] == "RIGHT"


def test_match_village_priority4_fuzzy_fallback_when_no_exact_name_match() -> None:
    candidates = [{"villagecode": "V1", "villagename": "Heggadahalli"}]
    result = match_village("Heggadahali", "Beltangady", "Dakshina Kannada", candidates)
    assert result is not None
    assert result.priority == 4
    assert result.candidate["villagecode"] == "V1"
    assert result.score >= AUTO_CONFIRM_THRESHOLD  # near-identical spelling


def test_match_village_no_candidates_returns_none() -> None:
    assert match_village("Anything", "Taluk", "District", []) is None


def test_match_village_poor_match_scores_below_pending_threshold() -> None:
    candidates = [{"villagecode": "V1", "villagename": "Completely Different Place"}]
    result = match_village("Beltangadi", "Beltangady", "Dakshina Kannada", candidates)
    assert result is not None
    assert result.score < PENDING_REVIEW_THRESHOLD


def test_status_for_score_bands() -> None:
    assert status_for_score(100.0) == "confirmed"
    assert status_for_score(AUTO_CONFIRM_THRESHOLD) == "confirmed"
    assert status_for_score(AUTO_CONFIRM_THRESHOLD - 0.01) == "pending_review"
    assert status_for_score(PENDING_REVIEW_THRESHOLD) == "pending_review"
    assert status_for_score(PENDING_REVIEW_THRESHOLD - 0.01) == "failed"
    assert status_for_score(0.0) == "failed"


def test_ancestor_dampening_via_min_score_pattern() -> None:
    """Mirrors how `scripts/generate_kaveri_village_mapping.py`'s
    `resolve_village` combines scores - a perfect village-name match under a
    weak (fuzzy, low-confidence) hobli match must not be reported as
    confirmed just because the village name itself matched exactly."""
    village_score = 100.0
    weak_hobli_score = 40.0  # a poor/uncertain hobli-level match
    final_score = min(village_score, weak_hobli_score)
    assert status_for_score(final_score) == "failed"
