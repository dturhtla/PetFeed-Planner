package utils

import "math"

// CalculateRER 기초 대사량 계산
func CalculateRER(weight float64) float64 {
	// RER = 70 * (weight)^0.75
	return 70 * math.Pow(weight, 0.75)
}

// CalculateFeedingAmount 권장 급여량(g) 계산
func CalculateFeedingAmount(rer float64, activityFactor float64, kcalPerGram float64) float64 {
	// DER = RER * 활동계수
	der := rer * activityFactor
	return der / kcalPerGram
}
