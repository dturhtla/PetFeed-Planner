import asyncio
import os
from dotenv import load_dotenv
from google import genai
from app.services.food_analyzer import FoodAnalysisResult, generate_with_retry

load_dotenv()


async def search_official_feeding_guide(
    brand: str,
    product_name: str,
    species: str,
    weight_kg: float,
    age_years: float
) -> float | None:
    """브랜드 공식 권장 급여량 검색"""

    species_korean = {
        "dog": "강아지", "cat": "고양이"
    }

    prompt = f"""{brand} {product_name} 사료의 공식 권장 급여량을 알려주세요.

- 종: {species_korean.get(species, species)}
- 체중: {weight_kg}kg
- 나이: {age_years:.1f}살

하루 권장 급여량(g)을 숫자만 반환해주세요.
예: 52
모르면 null을 반환해주세요.
다른 텍스트 없이 숫자 또는 null만 반환해야 합니다."""

    response = await generate_with_retry(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    result = response.text.strip()

    try:
        if result.lower() == "null":
            return None
        return float(result)
    except ValueError:
        return None


def calculate_daily_kcal(species: str, weight_kg: float, life_stage: str) -> float:
    """RER 기반 하루 필요 칼로리 계산"""

    rer = 70 * (weight_kg ** 0.75)

    life_stage_factors = {
        "dog": {
            "puppy":          3.0,
            "adult":          1.6,
            "adult_neutered": 1.4,
            "senior":         1.2,
            "obese":          1.0,
            "pregnant":       3.0,
        },
        "cat": {
            "kitten":         1.5,
            "adult":          1.2,
            "adult_neutered": 1.0,
            "senior":         1.1,
            "obese":          0.8,
            "pregnant":       2.0,
        },
    }

    species_factors = life_stage_factors.get(species, life_stage_factors["dog"])
    factor = species_factors.get(life_stage, 1.6)

    return rer * factor


def check_nutrition_standards(
    species: str,
    life_stage: str,
    protein_pct: float | None,
    fat_pct: float | None,
    calories_per_100g: float | None,
) -> list:
    issues = []

    standards = {
        "dog": {
            "protein_max": 30.0,
            "fat_max": 16.0,
            "kcal_max": 390.0,
        },
        "cat": {
            "protein_min": 28.0,
            "fat_max": 15.0,
            "kcal_max": 400.0,
        },
    }

    std = standards.get(species, standards["dog"])
    is_obese = "obese" in life_stage or "비만" in life_stage

    if species == "dog":
        if protein_pct is not None and protein_pct >= std["protein_max"]:
            issues.append(f"⚠️ 단백질 과다: {protein_pct}% (기준 {std['protein_max']}% 미만)")

        # 비만일 때만 지방, 칼로리 체크
        if is_obese:
            if fat_pct is not None and fat_pct >= std["fat_max"]:
                issues.append(f"⚠️ 지방 과다: {fat_pct}% (기준 {std['fat_max']}% 미만)")
            if calories_per_100g is not None and calories_per_100g > std["kcal_max"]:
                issues.append(f"⚠️ 고칼로리: {calories_per_100g}kcal/100g (기준 {std['kcal_max']}kcal 이하)")

    if species == "cat":
        if protein_pct is not None and protein_pct < std["protein_min"]:
            issues.append(f"⚠️ 단백질 부족: {protein_pct}% (권장 {std['protein_min']}% 이상)")

        if is_obese:
            if fat_pct is not None and fat_pct >= std["fat_max"]:
                issues.append(f"⚠️ 지방 과다: {fat_pct}% (기준 {std['fat_max']}% 미만)")
            if calories_per_100g is not None and calories_per_100g > std["kcal_max"]:
                issues.append(f"⚠️ 고칼로리: {calories_per_100g}kcal/100g (기준 {std['kcal_max']}kcal 이하)")

    return issues

def check_ingredient_warnings(
    species: str,
    health_conditions: list,
    ingredients: list
) -> list:
    """종별 위험 성분 + 건강 상태별 위험 성분 교차 체크"""
    warnings = []

    species_dangerous = {
        "dog": ["자일리톨", "포도", "건포도", "양파", "마늘", "부추", "초콜릿", "카페인", "마카다미아", "아보카도", "알코올"],
        "cat": ["양파", "마늘", "부추", "초콜릿", "카페인", "참치통조림", "생선뼈", "알코올", "포도", "건포도"],
    }

    condition_dangerous = {
        "kidney_disease":   ["인", "나트륨", "인산염", "칼륨", "마그네슘", "단백질"],
        "heart_disease":    ["나트륨", "소금", "염화나트륨", "MSG", "간장"],
        "diabetes":         ["옥수수", "설탕", "당밀", "과당", "포도당", "전분", "꿀"],
        "obesity":          ["물엿", "당밀", "과당", "지방", "오일"],
        "pancreatitis":     ["지방", "오일", "버터", "치즈"],
        "arthritis":        ["오메가6", "해바라기유", "옥수수유"],
        "hypothyroidism":   ["요오드", "해조류", "미역", "다시마"],
        "hyperthyroidism":  ["요오드", "해조류", "미역", "다시마"],
        "urinary_disease":  ["마그네슘", "인", "나트륨", "칼슘"],
    }

    dangerous = species_dangerous.get(species, [])
    for ingredient in ingredients:
        if any(d.lower() in ingredient.lower() for d in dangerous):
            warnings.append(f"⚠️ {species} 금지 성분: '{ingredient}' 포함")

    for condition in health_conditions:
        cond_dangerous = condition_dangerous.get(condition, [])
        for ingredient in ingredients:
            if any(d.lower() in ingredient.lower() for d in cond_dangerous):
                warnings.append(f"⚠️ {condition} 주의: '{ingredient}' 성분 포함")

    return warnings


async def recommend_alternative_food(
    species: str,
    health_conditions: list,
    current_food_brand: str,
    current_food_name: str,
    warnings: list,
    nutrition_issues: list,
) -> str | None:
    """위험 성분 또는 영양 기준 미달 시 대체 사료 추천"""

    all_issues = warnings + nutrition_issues

    if not all_issues:
        return None

    species_korean = {
        "dog": "강아지", "cat": "고양이"
    }

    condition_korean = {
        "kidney_disease":   "신장질환",
        "heart_disease":    "심장질환",
        "diabetes":         "당뇨",
        "obesity":          "비만",
        "pancreatitis":     "췌장염",
        "arthritis":        "관절염",
        "hypothyroidism":   "갑상선기능저하증",
        "hyperthyroidism":  "갑상선기능항진증",
        "urinary_disease":  "비뇨기질환",
    }

    conditions_korean = [condition_korean.get(c, c) for c in health_conditions]

    prompt = f"""반려동물 정보:
- 종: {species_korean.get(species, species)}
- 건강 상태: {', '.join(conditions_korean) if conditions_korean else "없음"}
- 현재 사료: {current_food_brand} {current_food_name}
- 문제점: {', '.join(all_issues)}

위 반려동물의 건강 상태와 영양 문제를 고려했을 때 현재 사료 대신 추천할 수 있는 사료를 알려주세요.
다음 형식으로 2~3개 추천해주세요:
- 브랜드명 제품명: 추천 이유 한 줄

마크다운 문법 없이 일반 텍스트로 작성해주세요."""

    response = await generate_with_retry(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    return response.text.strip()


async def generate_recommendation_text(
    pet_name: str,
    species: str,
    weight_kg: float,
    age_years: float,
    life_stage: str,
    health_conditions: list,
    food: FoodAnalysisResult,
    daily_grams: float,
    official_grams: float | None,
    warning_message: str | None
) -> str:
    """Gemini로 자연어 급여 추천 코멘트 생성"""

    species_korean = {
        "dog": "강아지", "cat": "고양이"
    }

    official_info = f"브랜드 공식 권장량: {official_grams:.0f}g" if official_grams else "브랜드 공식 권장량: 정보 없음"
    warning_info = f"\n주의: {warning_message}" if warning_message else ""

    prompt = f"""반려동물 정보:
- 이름: {pet_name}
- 종: {species_korean.get(species, species)}
- 체중: {weight_kg}kg
- 나이: {age_years:.1f}살
- 생애단계: {life_stage}
- 건강상태: {health_conditions if health_conditions else "특이사항 없음"}

사료 정보:
- 제품명: {food.product_name}
- 브랜드: {food.brand}
- 주요 원재료: {food.main_ingredients}
- 100g당 칼로리: {food.calories_per_100g}kcal
- 조단백질: {food.protein_pct}%
- 조지방: {food.fat_pct}%

급여량 계산 결과:
- 최종 권장 급여량: {daily_grams:.0f}g
- {official_info}
{warning_info}

위 정보를 바탕으로 보호자에게 친근한 말투로 반드시 2문장으로만 작성해주세요.
급여량과 횟수는 절대 언급하지 마세요.
비만이거나 과체중이면 반드시 체중 관리 주의사항을 포함해주세요.
건강 상태(질병)가 있다면 반드시 해당 질병 주의사항을 포함해주세요.
마크다운 문법(**굵게** 등)은 사용하지 마세요."""

    response = await generate_with_retry(
        model="gemini-2.5-flash-lite",
        contents=prompt
    )

    return response.text


async def calculate_feeding(
    pet_name: str,
    species: str,
    weight_kg: float,
    age_years: float,
    life_stage: str,
    health_conditions: list,
    food: FoodAnalysisResult
) -> dict:
    """최종 급여량 계산 및 추천 반환"""

    # 1. RER 수식으로 계산
    daily_kcal = calculate_daily_kcal(species, weight_kg, life_stage)

    default_kcal = {
        "dog": 385,
        "cat": 400,
    }
    kcal_per_100g = food.calories_per_100g if food.calories_per_100g else default_kcal.get(species, 385)
    formula_grams = (daily_kcal / kcal_per_100g) * 100

    # 2. 공식 권장량 검색
    official_grams = None
    if food.brand and food.product_name:
        official_grams = await search_official_feeding_guide(
            food.brand, food.product_name, species, weight_kg, age_years
        )

    # 3. 교차 검증 및 최종 급여량 결정
    warning_message = None

    if official_grams:
        diff_pct = abs(formula_grams - official_grams) / official_grams * 100

        if diff_pct > 20:
            final_grams = official_grams
            warning_message = f"수식 계산({formula_grams:.0f}g)과 공식 권장량({official_grams:.0f}g)이 {diff_pct:.0f}% 차이납니다. 공식 권장량을 우선 적용했어요."
        else:
            final_grams = (formula_grams + official_grams) / 2
    else:
        final_grams = formula_grams

    # 4. 하루 급여 횟수
    meals_map = {
        "dog": 3 if age_years <= 1 else 2,
        "cat": 3 if age_years <= 1 else 2,
    }
    meals_per_day = meals_map.get(species, 2)

    # 5. 성분 경고 체크
    warnings = check_ingredient_warnings(
        species,
        health_conditions,
        food.main_ingredients if food.main_ingredients else []
    )

    # 6. 영양 기준 체크
    nutrition_issues = check_nutrition_standards(
        species,
        life_stage,
        food.protein_pct,
        food.fat_pct,
        food.calories_per_100g,
    )

    # 7. 위험 성분 또는 영양 기준 미달 시 대체 사료 추천
    alternative_food = None
    if warnings or nutrition_issues:
        alternative_food = await recommend_alternative_food(
            species,
            health_conditions,
            food.brand or "",
            food.product_name or "",
            warnings,
            nutrition_issues,
    )

    # 8. 최종 급여량 확정 후 추천 코멘트 생성
    recommendation_text = await generate_recommendation_text(
        pet_name, species, weight_kg, age_years,
        life_stage, health_conditions, food,
        final_grams, official_grams, warning_message
    )

    return {
        "daily_grams":         round(final_grams),
        "meals_per_day":       meals_per_day,
        "grams_per_meal":      round(final_grams / meals_per_day),
        "daily_kcal":          round(daily_kcal),
        "formula_grams":       round(formula_grams),
        "official_grams":      round(official_grams) if official_grams else None,
        "warning":             warning_message,
        "recommendation":      recommendation_text,
        "ingredient_warnings": warnings + nutrition_issues,
        "alternative_food":    alternative_food,
    }