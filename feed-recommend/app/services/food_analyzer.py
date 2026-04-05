import json
import os
import base64
from google import genai
from google.genai import types
from dotenv import load_dotenv
from dataclasses import dataclass

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


@dataclass
class FoodAnalysisResult:
    brand: str | None
    product_name: str | None
    target_animal: str | None
    weight_kg: float | None
    main_ingredients: list | None
    calories_per_100g: float | None
    protein_pct: float | None
    fat_pct: float | None
    confidence: float


async def analyze_food_image(image_b64: str) -> FoodAnalysisResult:
    """Gemini Vision API로 사료 포장지 분석"""

    prompt = """이 반려동물 사료 포장지 이미지를 분석해서 JSON만 반환해주세요.
다른 텍스트, 설명, 마크다운 없이 JSON만 반환해야 합니다.

{
  "brand": "브랜드명 또는 null",
  "product_name": "제품명 또는 null",
  "target_animal": "dog 또는 cat 또는 null",
  "weight_kg": 숫자 또는 null,
  "main_ingredients": ["원재료1", "원재료2"] 또는 null,
  "calories_per_100g": 숫자 또는 null,
  "protein_pct": 숫자 또는 null,
  "fat_pct": 숫자 또는 null,
  "confidence": 0.0에서 1.0 사이 숫자
}

주의사항:
- 읽기 어렵거나 확실하지 않은 필드는 null로 표시
- confidence는 전체적인 인식 정확도 (0.9 이상이면 잘 인식된 것)
- 한국 사료의 경우 조단백질 = protein_pct, 조지방 = fat_pct
- target_animal은 dog / cat 중 하나로만 반환
- weight_kg은 kg 단위로 변환 (500g이면 0.5)
- 칼로리는 대사에너지, ME, kcal/kg 표기를 찾아서 100g 단위로 변환
- 예: 4000kcal/kg → 400kcal/100g
- brand와 product_name은 포장지에 적힌 원어 그대로 반환해주세요
- 나머지 텍스트 값은 한국어로 반환해주세요"""

    image_bytes = base64.b64decode(image_b64)

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
            prompt
        ]
    )

    result_text = response.text.strip()

    if result_text.startswith("```"):
        result_text = result_text.split("```")[1]
        if result_text.startswith("json"):
            result_text = result_text[4:]
        result_text = result_text.strip()

    result_dict = json.loads(result_text)

    food = FoodAnalysisResult(**result_dict)

    # 칼로리 인식 못했으면 제품명으로 검색
    if food.calories_per_100g is None and food.product_name and food.brand:
        food.calories_per_100g = await search_product_calories(
            food.brand, food.product_name
        )

    # 단백질 인식 못했으면 제품명으로 검색
    if food.protein_pct is None and food.product_name and food.brand:
        food.protein_pct = await search_product_nutrition(
            food.brand, food.product_name, "조단백질"
        )

    # 지방 인식 못했으면 제품명으로 검색
    if food.fat_pct is None and food.product_name and food.brand:
        food.fat_pct = await search_product_nutrition(
            food.brand, food.product_name, "조지방"
        )

    return food


async def search_product_calories(brand: str, product_name: str) -> float | None:
    """제품명으로 실제 칼로리 검색"""

    prompt = f"""반려동물 사료 제품의 칼로리 정보를 알려주세요.

브랜드: {brand}
제품명: {product_name}

주의사항:
- 해당 제품의 공식 칼로리 정보를 최우선으로 사용해주세요
- 공식 정보를 찾지 못하면 동일 브랜드 유사 제품 기준으로 추정해주세요
- kcal/kg 단위로 나와있으면 반드시 10으로 나눠서 100g 단위로 변환해주세요
- 예: 3525kcal/kg → 352.5kcal/100g
- 절대로 null을 반환하지 마세요. 반드시 숫자를 반환해주세요

이 제품의 100g당 칼로리(kcal)를 숫자만 반환해주세요.
예: 352.5

다른 텍스트 없이 숫자만 반환해야 합니다."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    result = response.text.strip()

    try:
        return float(result)
    except ValueError:
        return None


async def search_product_nutrition(brand: str, product_name: str, nutrient: str) -> float | None:
    """제품명으로 영양성분 검색 (단백질, 지방 등)"""

    prompt = f"""반려동물 사료 제품의 영양성분 정보를 알려주세요.

브랜드: {brand}
제품명: {product_name}
찾는 영양성분: {nutrient}

주의사항:
- 해당 제품의 공식 영양성분 정보를 최우선으로 사용해주세요
- 공식 정보를 찾지 못하면 동일 브랜드 유사 제품 기준으로 추정해주세요
- 반드시 % 단위로 반환해주세요
- 같은 제품이라도 시기별로 성분이 다를 수 있으므로 가장 최신 정보를 사용해주세요
- 절대로 null을 반환하지 마세요. 반드시 숫자를 반환해주세요

이 제품의 {nutrient} 함량(%)을 숫자만 반환해주세요.
예: 32.5

다른 텍스트 없이 숫자만 반환해야 합니다."""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    result = response.text.strip()

    try:
        return float(result)
    except ValueError:
        return None