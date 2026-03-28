from fastapi import APIRouter, UploadFile, File, HTTPException
from enum import Enum
from app.services.food_analyzer import analyze_food_image
from app.services.feeding_calculator import calculate_feeding
from app.utils.image_processor import preprocess_food_image

router = APIRouter()


class SpeciesEnum(str, Enum):
    강아지 = "강아지"
    고양이 = "고양이"


class LifeStageEnum(str, Enum):
    어린강아지 = "어린강아지"
    성견 = "성견"
    중성화성견 = "중성화성견"
    노령견 = "노령견"
    비만견 = "비만견"
    임신견 = "임신견"
    어린고양이 = "어린고양이"
    성묘 = "성묘"
    중성화성묘 = "중성화성묘"
    노령묘 = "노령묘"
    비만묘 = "비만묘"
    임신묘 = "임신묘"


SPECIES_MAP = {
    "강아지": "dog",
    "고양이": "cat",
}

LIFE_STAGE_MAP = {
    "어린강아지":  "puppy",
    "성견":       "adult",
    "중성화성견":  "adult_neutered",
    "노령견":     "senior",
    "비만견":     "obese",
    "임신견":     "pregnant",
    "어린고양이":  "puppy",
    "성묘":       "adult",
    "중성화성묘":  "adult_neutered",
    "노령묘":     "senior",
    "비만묘":     "obese",
    "임신묘":     "pregnant",
}


@router.post("/analyze")
async def analyze_food(
    pet_name: str,
    species: SpeciesEnum,
    weight_kg: float,
    age_year: int = 0,
    age_month: int = 0,
    life_stage: LifeStageEnum = None,
    health_conditions: str = "",
    image: UploadFile = File(...)
):
    """
    사료 포장지 이미지 분석 + 급여량 추천 API

    - species: 강아지 / 고양이
    - life_stage: 종에 맞는 생애단계 선택
    - health_conditions: 쉼표로 구분 (예: kidney_disease,obesity)
    """

    if image.content_type not in ["image/jpeg", "image/jpg", "image/png"]:
        raise HTTPException(
            status_code=400,
            detail="JPG 또는 PNG 이미지만 업로드 가능해요."
        )

    age_years_calc = age_year + (age_month / 12)

    if age_years_calc <= 0:
        raise HTTPException(
            status_code=400,
            detail="나이를 입력해주세요. (age_year 또는 age_month 중 하나 이상)"
        )

    species_en = SPECIES_MAP.get(species.value)
    if not species_en:
        raise HTTPException(
            status_code=400,
            detail="올바른 종을 선택해주세요."
        )

    life_stage_en = LIFE_STAGE_MAP.get(life_stage.value) if life_stage else None
    if not life_stage_en:
        raise HTTPException(
            status_code=400,
            detail="올바른 생애단계를 선택해주세요."
        )

    conditions_list = [c.strip() for c in health_conditions.split(",") if c.strip()]

    image_bytes = await image.read()
    image_b64 = preprocess_food_image(image_bytes)
    food_info = await analyze_food_image(image_b64)

    if food_info.confidence < 0.6:
        return {
            "status": "needs_retry",
            "message": "사료 포장지를 선명하게 인식하지 못했어요. 성분표가 잘 보이도록 다시 찍어주세요.",
            "confidence": food_info.confidence,
            "partial_result": {
                "brand": food_info.brand,
                "product_name": food_info.product_name,
            }
        }

    feeding = await calculate_feeding(
        pet_name=pet_name,
        species=species_en,
        weight_kg=weight_kg,
        age_years=age_years_calc,
        life_stage=life_stage_en,
        health_conditions=conditions_list,
        food=food_info
    )

    return {
        "status": "success",
        "food_info": {
            "brand":             food_info.brand,
            "product_name":      food_info.product_name,
            "target_animal":     food_info.target_animal,
            "weight_kg":         food_info.weight_kg,
            "main_ingredients":  food_info.main_ingredients,
            "calories_per_100g": food_info.calories_per_100g,
            "protein_pct":       food_info.protein_pct,
            "fat_pct":           food_info.fat_pct,
            "confidence":        food_info.confidence,
        },
        "feeding_recommendation": feeding
    }