import os
from dotenv import load_dotenv
from google import genai
from app.services.food_analyzer import FoodAnalysisResult

load_dotenv()


async def search_official_feeding_guide(
    brand: str,
    product_name: str,
    species: str,
    weight_kg: float,
    age_years: float
) -> float | None:
    """브랜드 공식 권장 급여량 검색"""

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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

    response = client.models.generate_content(
        model="gemini-2.5-flash",
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
        "puppy":          2.0,
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


def check_ingredient_warnings(
    species: str,
    health_conditions: list,
    ingredients: list
) -> list:
    """종별 위험 성분 + 건강 상태별 위험 성분 교차 체크"""
    warnings = []
    
    species_dangerous = {
        "dog": ["xylitol", "자일리톨", "포도", "grape", "양파", "onion",
            "마늘", "garlic", "초콜릿", "chocolate", "카페인", "caffeine"],
        "cat": ["양파", "onion", "마늘", "garlic", "초콜릿", "chocolate",
            "카페인", "caffeine", "참치통조림"],
    }

    condition_dangerous = {
        "kidney_disease": ["인", "나트륨", "phosphorus", "sodium"],
        "diabetes":       ["corn", "옥수수", "설탕", "당밀", "sugar"],
        "obesity":        ["corn syrup", "당밀", "fructose"],
        "heart_disease":  ["나트륨", "sodium", "salt", "소금"],
    }

    dangerous = species_dangerous.get(species, [])
    for ingredient in ingredients:
        if any(d.lower() in ingredient.lower() for d in dangerous):
            warnings.append(f"⚠️ {species} 금지 성분: '{ingredient}' 포함")

    for condition in health_conditions:
        dangerous = condition_dangerous.get(condition, [])
        for ingredient in ingredients:
            if any(d.lower() in ingredient.lower() for d in dangerous):
                warnings.append(f"⚠️ {condition} 주의: '{ingredient}' 성분 포함")

    return warnings


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

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

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
- 수식 계산 급여량: {daily_grams:.0f}g
- {official_info}
{warning_info}

위 정보를 바탕으로 보호자에게 친근한 말투로 급여 가이드를 3~4문장으로 작성해주세요.
급여 횟수, 주의사항, 물 섭취 팁을 포함해주세요."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
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

    # 2. 브랜드 공식 권장량 검색 (제품명 인식된 경우만)
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
            # 20% 이상 차이나면 공식 권장량 우선 + 경고
            final_grams = official_grams
            warning_message = f"수식 계산({formula_grams:.0f}g)과 공식 권장량({official_grams:.0f}g)이 {diff_pct:.0f}% 차이납니다. 공식 권장량을 우선 적용했어요."
        else:
            # 20% 이내면 두 값의 평균
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

    # 6. AI 추천 코멘트 생성
    recommendation_text = await generate_recommendation_text(
        pet_name, species, weight_kg, age_years,
        life_stage, health_conditions, food,
        final_grams, official_grams, warning_message
    )

    return {
        "daily_grams":      round(final_grams),
        "meals_per_day":    meals_per_day,
        "grams_per_meal":   round(final_grams / meals_per_day),
        "daily_kcal":       round(daily_kcal),
        "formula_grams":    round(formula_grams),
        "official_grams":   round(official_grams) if official_grams else None,
        "warning":          warning_message,
        "recommendation":   recommendation_text,
        "ingredient_warnings": warnings
    }