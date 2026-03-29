from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.food import router as food_router

app = FastAPI(title="PetFeed Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(food_router, prefix="/food", tags=["food"])

@app.get("/")
def health_check():
    return {"status": "ok", "message": "PetFeed Planner 서버 정상 작동 중"}