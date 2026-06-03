package models

// Pet 반려동물 프로필 구조체
type Pet struct {
	ID       int     `json:"pet_id"` // 명세서와 일치
	Name     string  `json:"name"`
	Species  string  `json:"species"`
	Weight   float64 `json:"current_weight"`
	BCS      int     `json:"bcs_score"` // 1~9 점수
	PhotoURL string  `json:"photo_url"` // DB의 PHOTO_URL 매핑
	RerValue float64 `json:"rer_value"` // 연산 캐싱용
}

// AnalysisResult AI 분석 결과 반환용
type AnalysisResult struct {
	ProductName string  `json:"product_name"`
	KcalPerGram float64 `json:"kcal_per_gram"`
	DailyAmount float64 `json:"daily_amount"` // 계산된 권장량
}
