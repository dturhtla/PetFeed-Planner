package main

import (
	"database/sql"
	"fmt"
	"log"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"petfeed-backend/database" // DB 연결 패키지
	_ "petfeed-backend/docs"
	"petfeed-backend/utils" // 급여량 계산 로직

	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"golang.org/x/crypto/bcrypt"
)

// @title PetFeed API Server
// @version 1.0
// @description 반려동물 건강 관리 및 AI 분석 백엔드 서버입니다.
// @BasePath /api/v1
func main() {
	// 1. 서버 시작 시 DB 연결 초기화
	// DB 연결 세션을 넉넉하게 잡는 InitDB가 실행됩니다.
	if err := database.InitDB(); err != nil {
		log.Fatalf("서버 중단: DB 연결에 실패했습니다: %v", err)
	}
	// 서버 종료 시 DB 연결을 안전하게 닫습니다.
	defer database.DB.Close()

	r := gin.Default()
	// [추가] 모든 오리진(IP)에서의 요청을 허용하는 설정 이거 해야 외부 연결 가능
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// [중요] 1. 정적 파일 서빙 설정 (보현 님이 사진을 볼 수 있게 함)
	r.Static("/static", "./uploads") // 외부에서 사진 확인 가능
	// [스워거 웹 페이지 주소 설정]
	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	// 라우터 등록 (기존과 동일)
	r.POST("/api/v1/pets", RegisterPet) // 초보 양육자 온보딩 (반려동물 등록)
	// 반려동물 사진 업로드 엔드포인트 등록
	r.POST("/api/v1/pets/photo", HandlePetPhotoUpload)

	// [테스트용] DB 연결 상태 확인 API
	r.GET("/ping", func(c *gin.Context) {
		err := database.DB.Ping()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": "DB 연결 오류", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "DB 및 서버 정상 작동 중"})
	})
	// [기능 2] 사료 봉투 이미지 분석 및 저장
	r.POST("/api/v1/analyze/feed", func(c *gin.Context) {
		file, err := c.FormFile("image")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "이미지 파일이 없습니다."})
			return
		}

		// 이미지 파일 로컬 저장 (uploads/feeds 폴더가 미리 생성되어 있어야 합니다)
		dst := filepath.Join("uploads/feeds", file.Filename)
		if err := c.SaveUploadedFile(file, dst); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "이미지 저장 실패"})
			return
		}

		// [AI 분석 대행 로직]
		// 실제로는 병창/칸 님의 모듈에서 결과값을 받아와야 합니다.
		kcal := 4.0
		petWeight := 5.0 // 예시 데이터
		rer := utils.CalculateRER(petWeight)
		amount := utils.CalculateFeedingAmount(rer, 1.6, kcal)

		c.JSON(http.StatusOK, gin.H{
			"product_name":           "프리미엄 건강사료",
			"kcal_per_gram":          kcal,
			"daily_recommendation_g": amount,
			"image_url":              dst,
		})
	})
	// [기능 3] AI 분석 결과 반영 API
	r.PATCH("/api/v1/pets/:id/bcs", UpdatePetBCS)

	// [기능 4] 반려동물 상세 정보 조회 (병창님/보현님용)
	r.GET("/api/v1/pets/:id", GetPetDetail)

	// [기능 5] AI 분석 결과 통합 저장 (BCS + 급여량)
	r.PATCH("/api/v1/pets/:id/analysis", UpdateAnalysisResult)

	// [기능 6] 특정 유저의 강아지 목록 가져오기
	r.GET("/api/v1/users/:id/pets", GetUserPets) // 유저가 등록한 모든 반려동물의 리스트를 가져옵니다.

	// [기능 7] 사료 마스터 정보 등록
	r.POST("/api/v1/foods", RegisterFood) // 사료의 영양 성분을 먼저 등록하고 생성된 food_id를 반환받습니다.

	// [기능 8] 사료 봉투 사진 업로드 및 DB 매핑
	r.POST("/api/v1/foods/photo", HandleFoodPhotoUpload) // 등록된 사료 ID에 분석용 사진 경로를 매핑합니다.

	// [기능 9] iot 장비로 사료 무게 측정 데이터 DB에 저장
	r.POST("/api/v1/iot/weight", HandleIoTWeight)

	// [기능 10] 사용자와 AI의 대화 내용을 DB에 저장
	r.POST("/api/v1/chat/save-turn", SaveChatTurn) // 대화 세트(질문+답변) 동시 저장
	// [기능 11] 특정 유저의 최근 대화 10개 내역 조회
	r.GET("/api/v1/chat/history/:userId", GetChatHistory)
	// [기능 12] 신규 사용자 등록 (회원가입)
	r.POST("/api/v1/auth/register", RegisterUser)
	// [기능 13] 반려동물 정보 삭제
	r.DELETE("/api/v1/pets/:id", DeletePet)

	// [기능 14] 반려동물 정보 업데이트 (예: 건강 상태 변경)
	r.PUT("/api/v1/pets/:id", UpdatePetDetail)
	// [기능 15] 일일 총 섭취량 조회 (IoT 저울 데이터 기반)
	r.GET("/api/v1/pets/:id/consumption", GetDailyConsumption)

	// [기능 16]  통계 및 상세 조회 관련 엔드포인트
	r.POST("/api/v1/pets/meal-details", GetMealDetails)
	// [기능 17] 수동으로 급여량 기록하는 엔드포인트 (IoT 데이터 누락 시 대체)
	r.POST("/api/v1/iot/self-manual-weight", SaveManualFeedLog)
	// [기능 18] 급여 기록과 후속 섭취 기록을 동시에 삭제하는 엔드포인트
	r.DELETE("/api/v1/iot/weight-pair", DeleteFeedLogPair)
	// [기능 19] 특정 반려동물의 일일 섭취 세션 목록 조회 (섭취 시작/종료 시간, 급여량, 섭취량 등)
	r.GET("/api/v1/pets/:id/sessions", GetDailySessionList)
	// [기능 20] 사용자 비밀번호 업데이트 (보안 강화)
	r.PUT("/api/v1/users/password", UpdatePassword)
	// [기능 21] 사용자 로그인 (JWT 토큰 발급)
	r.POST("/api/v1/users/login", Login)

	// 반려동물 current_food_id사료 교체 API 등록
	r.PUT("/api/v1/pets/food", ChangePetFood)
	// 반려동물 월별 섭취량 조회 API 등록
	r.GET("/api/v1/pets/:id/monthly-consumption", GetMonthlyConsumption)

	// [기능 24] 반려동물 활성화 설정 API (사용자가 여러 마리를 등록했을 때, 현재 집중 관리할 반려동물을 선택하는 기능)
	r.PUT("/api/v1/config/active-pet", SetActivePetID)
	// [기능 25] 가장 최근에 iot에 등록된 반려동물 ID 조회 API
	r.GET("/api/v1/config/active-pet", GetActivePetID)

	// [기능 26] 반려동물의 현재 사료 정보 업데이트 API (예: 사료 변경 시 CURRENT_FOOD_ID 갱신)
	r.PATCH("/api/v1/pets/:id/food", UpdatePetCurrentFood)

	// 특정 로그 삭제 API (URL의 경로 변수로 logId를 받음)
	r.DELETE("/api/v1/logs/:logId", DeleteWeightLog)
	// 사용자 관련 그룹
	userGroup := r.Group("/api/v1/users")
	{
		userGroup.DELETE("/:id", DeleteUser)
	}

	// 8080 포트에서 서버 실행
	log.Println("PetFeed Backend Server 시작 중... [Port :8080]")
	r.Run("0.0.0.0:8080")
}

// PetRegistrationInput 반려동물 등록을 위한 입력 구조체
type PetRegistrationInput struct {
	UserID        int      `json:"user_id" example:"1"`
	Name          string   `json:"name" example:"성공이"`
	Species       string   `json:"species" example:"Dog"`
	Breed         string   `json:"breed" example:"Poodle"`
	Gender        string   `json:"gender" example:"U"`
	BirthDate     string   `json:"birth_date" example:"2024-01-01"`
	CurrentWeight float64  `json:"current_weight" example:"7.5"`
	BCSScore      int      `json:"bcs_score" example:"1"` // [추가] BCS 점수
	HealthStatus  []string `json:"health_status"`         // [수정] 문자열 배열로 변경
}

// RegisterPet
// @Summary 반려동물 등록
// @Description 새로운 반려동물을 등록하고 별도 테이블에 다중 건강 상태를 저장합니다.
// @Accept  json
// @Produce  json
// @Param   pet  body  PetRegistrationInput  true  "반려동물 등록 정보"
// @Success 200 {object} map[string]interface{}
// @Router /pets [post]
func RegisterPet(c *gin.Context) {
	var input PetRegistrationInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	// 생일 정보가 빈 값일 경우 DB에 NULL로 들어가도록 처리
	var birthDate interface{}
	if input.BirthDate == "" {
		birthDate = nil
	} else {
		birthDate = input.BirthDate
	}

	rerValue := utils.CalculateRER(input.CurrentWeight)
	var newPetID int64

	// 1. 트랜잭션 시작 (원자성 보장: 중간에 에러 나면 롤백)
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("❌ 트랜잭션 시작 오류: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류"})
		return
	}
	defer tx.Rollback() // 성공 시 아래에서 Commit 되므로 지연 롤백은 안전장치 역할

	// 2. 부모 테이블(PETS)에 기본 정보 저장
	// (기존 쿼리에서 더 이상 필요 없는 HEALTH_STATUS 컬럼은 제거했습니다)
	insertPetQuery := `
		INSERT INTO PETS (NAME, SPECIES, BREED, GENDER, CURRENT_WEIGHT, RER_VALUE, USER_ID, BIRTH_DATE, BCS_SCORE) 
		VALUES (:1, :2, :3, :4, :5, :6, :7, TO_DATE(:8, 'YYYY-MM-DD'), :9) 
		RETURNING PET_ID INTO :id`

	_, err = tx.Exec(insertPetQuery,
		input.Name, input.Species, input.Breed, input.Gender, input.CurrentWeight, rerValue, input.UserID, birthDate, input.BCSScore,
		sql.Named("id", sql.Out{Dest: &newPetID}),
	)

	if err != nil {
		log.Printf("❌ 반려동물 기본 정보 저장 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 저장 실패: " + err.Error()})
		return
	}

	// 3. 자식 테이블(PET_HEALTH_STATUSES)에 질병 정보 다중 Insert
	insertHealthQuery := `INSERT INTO PET_HEALTH_STATUSES (PET_ID, DISEASE_NAME) VALUES (:1, :2)`

	if len(input.HealthStatus) > 0 {
		// 배열에 값이 있으면 개수만큼 루프 돌면서 Insert
		for _, disease := range input.HealthStatus {
			_, err = tx.Exec(insertHealthQuery, newPetID, disease)
			if err != nil {
				log.Printf("❌ 질병 정보 저장 실패 (%s): %v", disease, err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "건강 상태 저장 중 오류가 발생했습니다."})
				return
			}
		}
	} else {
		// 질병 배열이 비어있다면 기본값으로 'none' 하나를 넣어줌
		_, err = tx.Exec(insertHealthQuery, newPetID, "none")
		if err != nil {
			log.Printf("❌ 기본 건강 상태 저장 실패: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "기본 건강 상태 저장 중 오류가 발생했습니다."})
			return
		}
	}

	// 4. 모든 쿼리가 성공했으므로 트랜잭션 확정(Commit)
	err = tx.Commit()
	if err != nil {
		log.Printf("❌ 트랜잭션 Commit 오류: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 저장 확정 중 오류가 발생했습니다."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "반려동물과 질병 정보가 정상적으로 등록되었습니다.",
		"pet_id":     newPetID,
		"rer_result": rerValue,
	})
}

// @Summary 반려동물 사진 업로드
// @Description 비만도 분석을 위한 사진을 업로드하고 DB에 경로를 저장합니다.
// @Accept  mpfd
// @Produce  json
// @Param   pet_id  formData  string  true  "Pet ID"
// @Param   photo   formData  file    true  "Pet Photo File"
// @Success 200 {object} map[string]interface{}
// @Router /pets/photo [post]
// 반려동물 사진 업로드 및 DB 경로 매핑 핸들러
func HandlePetPhotoUpload(c *gin.Context) { // BCS 분석을 위한 반려동물 사진 저장
	petID := c.PostForm("pet_id") // 1. 프론트에서 보낸 강아지 ID 수신
	if petID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pet_id 필드가 필요합니다."})
		return
	}

	file, err := c.FormFile("photo") // 2. 프론트에서 보낸 사진 파일 수신
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "사진 파일이 누락되었습니다."})
		return
	}

	// 3. 파일명 생성 (중복 방지를 위해 petID와 타임스탬프 조합)
	ext := filepath.Ext(file.Filename)
	fileName := fmt.Sprintf("pet_%s_%d%s", petID, time.Now().Unix(), ext)

	// 물리적 저장 경로: uploads/pets/파일명
	savePath := filepath.Join("uploads", "pets", fileName)
	// 브라우저 접근 경로: /static/pets/파일명
	displayURL := "/static/pets/" + fileName

	// 4. 서버 로컬 폴더에 파일 물리 저장
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 파일 저장 실패"})
		return
	}

	// 5. Oracle DB에 이미지 경로 업데이트
	query := "UPDATE PETS SET PHOTO_URL = :1 WHERE PET_ID = :2"
	_, err = database.DB.Exec(query, displayURL, petID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 경로 매핑 실패: " + err.Error()})
		return
	}

	// 6. 결과 반환
	c.JSON(http.StatusOK, gin.H{
		"status":    "success",
		"photo_url": displayURL,
		"message":   "사진 업로드 및 DB 경로 저장 완료",
	})
}

// PetBCSUpdateInput AI 분석 결과(BCS) 업데이트를 위한 구조체
type PetBCSUpdateInput struct { // 값 누락시 에러 출력
	BCS int `json:"bcs" example:"5" binding:"required"` // 1~9 사이의 비만도 점수
}

// UpdatePetBCS
// @Summary 반려동물 비만도(BCS) 업데이트
// @Description AI 분석 결과를 받아 반려동물의 BCS 점수와 분석 날짜를 최신화합니다.
// @Accept  json
// @Produce  json
// @Param   id   path    string  true  "Pet ID"
// @Param   bcs  body    PetBCSUpdateInput  true  "BCS 분석 결과"
// @Success 200 {object} map[string]interface{}
// @Router /pets/{id}/bcs [patch]
func UpdatePetBCS(c *gin.Context) {
	petID := c.Param("id")
	var input PetBCSUpdateInput

	// 1. 데이터 바인딩
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	// 2. 비즈니스 로직 검증 (BCS는 1~9 사이여야 함)
	if input.BCS < 1 || input.BCS > 9 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "BCS 점수는 1에서 9 사이여야 합니다."})
		return
	}

	// 3. Oracle DB 업데이트
	// BCS_VALUE와 함께 마지막 분석 날짜(LAST_ANALYSIS_DATE)를 현재 시간(SYSDATE)으로 갱신
	query := `UPDATE PETS 
	          SET BCS_SCORE = :1, LAST_ANALYSIS_DATE = SYSDATE 
	          WHERE PET_ID = :2`

	result, err := database.DB.Exec(query, input.BCS, petID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 업데이트 실패: " + err.Error()})
		return
	}

	// 4. 업데이트된 행이 있는지 확인 (잘못된 ID 방지)
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 ID의 반려동물을 찾을 수 없습니다."})
		return
	}

	// 5. 성공 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "AI 분석 결과가 성공적으로 반영되었습니다.",
		"bcs":     input.BCS,
	})
}

// FoodRegistrationInput 사료 기초 정보 등록용
type FoodRegistrationInput struct {
	ProductName string  `json:"product_name" example:"로얄캐닌 인도어"`
	KcalPerG    float64 `json:"kcal_per_g" example:"3.85"`
	ProteinPct  float64 `json:"protein_pct" example:"27.5"`
	FatPct      float64 `json:"fat_pct" example:"13.0"`
}

// RegisterFood
// @Summary 사료 기초 정보 등록
// @Description 사료의 영양 성분을 먼저 등록하고 생성된 food_id를 반환받습니다.
// @Accept  json
// @Produce  json
// @Param   food  body  FoodRegistrationInput  true  "사료 상세 정보"
// @Success 200 {object} map[string]interface{}
// @Router /foods [post]
func RegisterFood(c *gin.Context) {
	var input FoodRegistrationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	var newFoodID int64
	query := `INSERT INTO FOOD_MASTER (PRODUCT_NAME, KCAL_PER_G, PROTEIN_PCT, FAT_PCT) 
	          VALUES (:1, :2, :3, :4) 
	          RETURNING FOOD_ID INTO :id`

	_, err := database.DB.Exec(query,
		input.ProductName, input.KcalPerG, input.ProteinPct, input.FatPct,
		sql.Named("id", sql.Out{Dest: &newFoodID}),
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "사료 등록 실패: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "food_id": newFoodID})
}

// HandleFoodPhotoUpload
// @Summary 사료 봉투 사진 업로드
// @Description 등록된 사료 ID에 분석용 사진 경로를 매핑합니다.
// @Accept  mpfd
// @Param   food_id  formData  string  true  "Food ID"
// @Param   photo    formData  file    true  "Food Pack Photo"
// @Router /foods/photo [post]
func HandleFoodPhotoUpload(c *gin.Context) {
	foodID := c.PostForm("food_id")
	if foodID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "food_id가 필요합니다."})
		return
	}

	file, err := c.FormFile("photo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "사진 파일이 없습니다."})
		return
	}

	// 파일명 생성: food_101_1712890000.jpg
	ext := filepath.Ext(file.Filename)
	fileName := fmt.Sprintf("food_%s_%d%s", foodID, time.Now().Unix(), ext)
	savePath := filepath.Join("uploads", "feeds", fileName)
	displayURL := "/static/feeds/" + fileName

	// 서버 저장
	if err := c.SaveUploadedFile(file, savePath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "파일 저장 실패"})
		return
	}

	// DB 업데이트
	query := "UPDATE FOOD_MASTER SET PACK_PHOTO_URL = :1 WHERE FOOD_ID = :2"
	_, err = database.DB.Exec(query, displayURL, foodID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 경로 반영 실패"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "photo_url": displayURL})
}

// GetPetDetail
// @Summary 반려동물 상세 정보 조회
// @Description AI 모듈이나 프론트엔드에서 반려동물의 현재 상태 및 다중 질병 목록을 가져옵니다.
// @Produce   json
// @Param     id    path    string   true  "Pet ID"
// @Success   200 {object} map[string]interface{}
// @Router    /pets/{id} [get]
func GetPetDetail(c *gin.Context) {
	petID := c.Param("id")

	// 1. 응답용 구조체 정의 (health_status를 단일 string에서 문자열 배열 []string으로 변경)
	var pet struct {
		PetID         int      `json:"pet_id"`
		Name          string   `json:"name"`
		CurrentWeight float64  `json:"current_weight"`
		RerValue      float64  `json:"rer_value"`
		BcsScore      int      `json:"bcs_score"`
		HealthStatus  []string `json:"health_status"` // 수정: 다중 질병 배열 반환
		FeedName      string   `json:"feed_name"`
		BirthDate     string   `json:"birth_date"`
		Gender        string   `json:"gender"`
		Species       string   `json:"species"`
	}

	// NULL 값을 안전하게 받아낼 '임시 바구니' 변수들
	var bcsScore sql.NullInt64
	var feedName sql.NullString
	var birthDate sql.NullString
	var gender sql.NullString
	var species sql.NullString
	var healthStatusesRaw sql.NullString // 추가: 콤마로 연결된 질병 문자열을 임시로 담을 바구니

	// 2. 오라클 쿼리 수정 (LISTAGG 함수를 이용해 자식 테이블 행들을 한 줄로 병합 추출)
	query := `SELECT 
                p.PET_ID, p.NAME, p.CURRENT_WEIGHT, p.RER_VALUE, p.BCS_SCORE,
                f.PRODUCT_NAME as FEED_NAME,
                TO_CHAR(p.BIRTH_DATE, 'YYYY-MM-DD') AS BIRTH_DATE,
                p.GENDER, p.SPECIES,
                (SELECT LISTAGG(DISEASE_NAME, ',') WITHIN GROUP (ORDER BY DISEASE_NAME) 
                 FROM PET_HEALTH_STATUSES 
                 WHERE PET_ID = p.PET_ID) AS HEALTH_STATUSES
              FROM PETS p
              LEFT JOIN FOOD_MASTER f ON p.CURRENT_FOOD_ID = f.FOOD_ID
              WHERE p.PET_ID = :1`

	// 3. 스캔 대상 매핑
	err := database.DB.QueryRow(query, petID).Scan(
		&pet.PetID, &pet.Name, &pet.CurrentWeight, &pet.RerValue, &bcsScore,
		&feedName, &birthDate, &gender, &species, &healthStatusesRaw, // 마지막에 추가된 바구니 매핑
	)

	if err != nil {
		log.Printf("데이터 조회 중 에러 발생: %v", err)
		c.JSON(http.StatusNotFound, gin.H{"error": "반려동물을 찾을 수 없거나 데이터 오류가 발생했습니다."})
		return
	}

	// 4. 임시 바구니 데이터 검증 및 유효값 매핑
	if bcsScore.Valid {
		pet.BcsScore = int(bcsScore.Int64)
	} else {
		pet.BcsScore = 0
	}

	if feedName.Valid {
		pet.FeedName = feedName.String
	} else {
		pet.FeedName = ""
	}

	if birthDate.Valid {
		pet.BirthDate = birthDate.String
	} else {
		pet.BirthDate = ""
	}

	if gender.Valid {
		pet.Gender = gender.String
	} else {
		pet.Gender = "미지정"
	}

	if species.Valid {
		pet.Species = species.String
	} else {
		pet.Species = "미지정"
	}

	// [추가] 콤마 분리 문자열 가공 처리 -> Go 슬라이스로 변환
	if healthStatusesRaw.Valid && healthStatusesRaw.String != "" {
		// 예: "arthritis,diabetes" -> ["arthritis", "diabetes"]
		pet.HealthStatus = strings.Split(healthStatusesRaw.String, ",")
	} else {
		// 질병 데이터가 전혀 없는 경우 null 대신 프론트엔드가 다루기 편하게 빈 배열 [] 반환
		pet.HealthStatus = []string{}
	}

	c.JSON(http.StatusOK, pet)
}

type AIAnalysisResultInput struct {
	BCS               int     `json:"bcs" example:"5"`
	RecommendedAmount float64 `json:"recommended_amount" example:"150.5"`
	FoodID            int     `json:"food_id" example:"101"` // 분석 결과 식별된 사료 번호
}

// UpdateAnalysisResult
// @Summary AI 분석 결과 통합 저장 (BCS + 급여량 + 사료 연결)
// @Description 비만도, 급여량과 함께 분석된 사료의 ID(FK)를 PETS 테이블에 저장합니다.
// @Accept  json
// @Produce  json
// @Param   id    path    string                true  "Pet ID"
// @Param   body  body    AIAnalysisResultInput true  "AI 분석 결과 (BCS, 추천급여량)"
// @Success 200 {object} map[string]interface{}
// @Router /pets/{id}/analysis [patch]
func UpdateAnalysisResult(c *gin.Context) {
	petID := c.Param("id")
	var input AIAnalysisResultInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	// 2. SQL 쿼리: PETS 테이블의 컬럼들을 업데이트
	// CURRENT_FOOD_ID는 PETS 테이블의 컬럼이므로 여기서 직접 수정 가능합니다.
	query := `UPDATE PETS 
              SET BCS_SCORE = :1, 
                  RECOMMENDED_FEED_AMOUNT = :2, 
                  CURRENT_FOOD_ID = :3, 
                  LAST_ANALYSIS_DATE = SYSDATE 
              WHERE PET_ID = :4`

	// 파라미터 매핑: :1(BCS), :2(Amount), :3(FoodID), :4(PetID)
	result, err := database.DB.Exec(query, input.BCS, input.RecommendedAmount, input.FoodID, petID)

	if err != nil {
		log.Printf("분석 결과 업데이트 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 저장 실패: " + err.Error()})
		return
	}

	// 3. 실제 반영 여부 체크
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 반려동물을 찾을 수 없습니다."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "사료 정보 포함 모든 결과가 업데이트되었습니다."})
}

// GetUserPets
// @Summary 유저별 반려동물 목록 조회
// @Description 특정 유저가 등록한 모든 반려동물의 리스트를 가져옵니다.
// @Produce  json
// @Param   id   path    string  true  "User ID"
// @Success 200 {array} map[string]interface{}
// @Router /users/{id}/pets [get]
func GetUserPets(c *gin.Context) {
	userID := c.Param("id")

	// 1. 여러 마리를 담을 슬라이스(배열) 준비
	type PetSummary struct {
		PetID        int    `json:"pet_id"`
		Name         string `json:"name"`
		Species      string `json:"species"`
		Breed        string `json:"breed"`
		PhotoURL     string `json:"photo_url"`
		BcsScore     int    `json:"bcs_score"`
		HealthStatus string `json:"health_status"` // DB의 HEALTH_STATUS 매핑 추가 (2024-06-20)
	}
	pets := []PetSummary{}

	// 2. 쿼리 실행 (목록 조회이므로 Query 사용)
	query := `SELECT PET_ID, NAME, SPECIES, BREED, PHOTO_URL, BCS_SCORE, HEALTH_STATUS 
	          FROM PETS WHERE USER_ID = :1 ORDER BY CREATED_AT DESC`

	rows, err := database.DB.Query(query, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "목록 조회 실패: " + err.Error()})
		return
	}
	defer rows.Close()

	// 3. 데이터를 하나씩 꺼내서 배열에 담기
	for rows.Next() {
		var p PetSummary
		var photoURL sql.NullString
		var bcsScore sql.NullInt64

		err := rows.Scan(&p.PetID, &p.Name, &p.Species, &p.Breed, &photoURL, &bcsScore, &p.HealthStatus)
		if err != nil {
			continue // 한 마리 오류 나도 나머지는 보여줌
		}

		// NULL 처리
		if photoURL.Valid {
			p.PhotoURL = photoURL.String
		}
		if bcsScore.Valid {
			p.BcsScore = int(bcsScore.Int64)
		}

		pets = append(pets, p)
	}

	// 4. 결과 반환 (데이터가 없어도 [] 빈 배열을 주는 것이 프론트 입장에서 편함)
	c.JSON(http.StatusOK, pets)
}

// =========================================================================
// 1. IoT 데이터 수신 API (서브쿼리 인서트 적용으로 FK 정합성 확보)
// =========================================================================

// IoTWeightInput 저울 데이터 수신용 구조체
type IoTWeightInput struct {
	PetID int `json:"pet_id" binding:"required" example:"126"` // 기기 할당 반려동물 ID
	// 💡 변경점: float64 -> *float64 로 변경하여 0.0 값을 허용하도록 처리
	FeedWeight *float64 `json:"feed_weight" binding:"required" example:"45.2"` // 현재 사료 무게 (g)
}

// HandleIoTWeight
// @Summary      IoT 사료 무게 수신
// @Description  실시간 사료 잔량 데이터를 수신합니다. PETS에서 사료 ID를 선조회 후 로그 테이블에 정석 인서트하여 바인딩 오류를 해결합니다.
// @Tags         IoT
// @Accept       json
// @Produce      json
// @Param        data  body      IoTWeightInput  true  "무게 데이터"
// @Success      200   {object}  map[string]interface{}
// @Router       /iot/weight [post]
func HandleIoTWeight(c *gin.Context) {
	var input IoTWeightInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "데이터 형식이 올바르지 않거나 필수 값이 누락되었습니다."})
		return
	}

	// [1단계] 명시적 조회를 통해 드라이버 매핑 버그 차단
	var currentFoodID int
	querySelect := `SELECT CURRENT_FOOD_ID FROM PETS WHERE PET_ID = :1`
	err := database.DB.QueryRow(querySelect, input.PetID).Scan(&currentFoodID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "등록되지 않은 반려동물 ID입니다.", "pet_id": input.PetID})
		return
	} else if err != nil {
		log.Printf("❌ PETS 테이블 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류 (조회 실패)"})
		return
	}

	// [2단계] 확보된 사료 ID를 가지고 안전하게 일반 INSERT 실행 (IDENTITY PK 자동 반영)
	queryInsert := `
		INSERT INTO FOOD_WEIGHT_LOGS (
			PET_ID, 
			CURRENT_FOOD_ID, 
			FEED_WEIGHT,
			FEED_TYPE
		) VALUES (:1, :2, :3, 'AUTO')`

	// 💡 변경점: input.FeedWeight 가 포인터이므로 *input.FeedWeight 로 값을 꺼냅니다.
	_, err = database.DB.Exec(queryInsert, input.PetID, currentFoodID, *input.FeedWeight)
	if err != nil {
		log.Printf("❌ FOOD_WEIGHT_LOGS 적재 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류 (삽입 실패)"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":          "success",
		"pet_id":          input.PetID,
		"current_food_id": currentFoodID,
		// 💡 변경점: 응답 JSON에도 *를 붙여서 실제 숫자를 반환합니다.
		"feed_weight": *input.FeedWeight,
		"received_at": time.Now().Format("2006-01-02 15:04:05"),
	})
}

// =========================================================================
// 2. 일일 총 섭취량 및 통계 조회 API
// =========================================================================

type DailyConsumptionResponse struct {
	PetID            int     `json:"pet_id"`
	Date             string  `json:"date"`
	TotalFed         float64 `json:"total_fed"`
	TotalConsumption float64 `json:"total_consumption"`
	TotalRemaining   float64 `json:"total_remaining"`
	ConsumptionRate  float64 `json:"consumption_rate"`
	StatusColor      string  `json:"status_color"`
	LogCount         int     `json:"log_count"`
}

// GetDailyConsumption
// @Summary      일일 총 섭취량 및 통계 조회
// @Description  특정 날짜의 무게 변화를 분석하여 총 급여량, 섭취량, 잔량을 반환합니다. 수동 입력 데이터는 이전 잔량 차감 없이 입력값 그대로 누적하며, 잔량은 (총급여-총섭취)로 계산됩니다.
// @Tags         Pets
// @Param        id    path      int     true  "Pet ID"
// @Param        date  query     string  true  "조회 날짜 (YYYY-MM-DD)"
// @Success      200   {object}  DailyConsumptionResponse
// @Router       /pets/{id}/consumption [get]
func GetDailyConsumption(c *gin.Context) {
	petID := c.Param("id")
	targetDate := c.Query("date")

	if targetDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "날짜(date) 파라미터가 필요합니다."})
		return
	}

	petIDInt, _ := strconv.Atoi(petID)

	query := `
		SELECT 
			FEED_WEIGHT, 
			CONSUMPTION,
			TO_CHAR(MEASURED_AT, 'YYYY-MM-DD HH24:MI:SS') AS MEASURED_TIME
		FROM FOOD_WEIGHT_LOGS 
		WHERE PET_ID = :1 
		  AND TO_CHAR(MEASURED_AT, 'YYYY-MM-DD') = :2 
		ORDER BY MEASURED_AT ASC`

	rows, err := database.DB.Query(query, petID, targetDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 조회 중 오류 발생"})
		return
	}
	defer rows.Close()

	type LogRow struct {
		Weight      float64
		Consumption float64
		Time        string
	}

	var logs []LogRow
	for rows.Next() {
		var r LogRow
		if err := rows.Scan(&r.Weight, &r.Consumption, &r.Time); err == nil {
			logs = append(logs, r)
		}
	}

	var totalFed float64 = 0
	var totalConsumption float64 = 0
	var totalRemaining float64 = 0
	var consumptionRate float64 = 0
	var statusColor string = "빨강"

	if len(logs) > 0 {
		i := 0
		for i < len(logs) {
			isManual := false
			if i+1 < len(logs) {
				curr := logs[i]
				next := logs[i+1]

				tCurr, _ := time.Parse("2006-01-02 15:04:05", curr.Time)
				tNext, _ := time.Parse("2006-01-02 15:04:05", next.Time)

				if next.Consumption > 0 && tNext.Sub(tCurr) == 1*time.Second {
					isManual = true
				}
			}

			if isManual {
				// A. 수동 급여 로그 세트 처리
				totalFed += logs[i].Weight
				totalConsumption += logs[i+1].Consumption
				i += 2
			} else {
				// B. 일반 자동 IoT 로그 처리
				if i == 0 {
					totalFed = logs[i].Weight
				} else {
					prev := logs[i-1]
					curr := logs[i]
					if curr.Weight < prev.Weight {
						totalConsumption += (prev.Weight - curr.Weight)
					} else if curr.Weight > prev.Weight {
						totalFed += (curr.Weight - prev.Weight)
					}
				}
				i++
			}
		}

		// ✅ [수정 완료]: 총 급여 - 총 섭취 공식으로 잔량 확정 (프론트엔드 수치 동기화)
		totalRemaining = totalFed - totalConsumption
		if totalRemaining < 0 {
			totalRemaining = 0
		}

		if totalFed > 0 {
			consumptionRate = (totalConsumption / totalFed) * 100
			consumptionRate = math.Round(consumptionRate*100) / 100

			if consumptionRate >= 90 {
				statusColor = "초록"
			} else if consumptionRate >= 70 {
				statusColor = "노랑"
			} else {
				statusColor = "빨강"
			}
		}
	}

	c.JSON(http.StatusOK, DailyConsumptionResponse{
		PetID:            petIDInt,
		Date:             targetDate,
		TotalFed:         math.Round(totalFed*100) / 100,
		TotalConsumption: math.Round(totalConsumption*100) / 100,
		TotalRemaining:   math.Round(totalRemaining*100) / 100,
		ConsumptionRate:  consumptionRate,
		StatusColor:      statusColor,
		LogCount:         len(logs),
	})
}

// =========================================================================
// 3. 반려동물 회당 급여 및 섭취 목록 조회 API (세션 리스트)
// =========================================================================

// FeedingSessionElement 회당 급여/섭취 기록 단위
type FeedingSessionElement struct {
	LogID          int     `json:"log_id"`          // [추가] 로그 고유 고유 ID
	FeedingTime    string  `json:"feeding_time"`    // 급여 시작 시간 (YYYY-MM-DD HH24:MI:SS)
	CurrentFoodID  int     `json:"current_food_id"` // 해당 세션 당시의 사료 고유 ID
	FoodName       string  `json:"food_name"`       // [추가] 실제 사료 이름 (예: 로얄캐닌 닥터)
	FedAmount      float64 `json:"fed_amount"`      // 회당 급여량 (g)
	ConsumedAmount float64 `json:"consumed_amount"` // 회당 섭취량 (g)
	FeedType       string  `json:"feed_type"`       // [추가] 'AUTO' 또는 'MANUAL'
}

type PetSessionListResponse struct {
	PetID        int                     `json:"pet_id"`
	Date         string                  `json:"date"`
	SessionCount int                     `json:"session_count"`
	Sessions     []FeedingSessionElement `json:"sessions"`
}

// GetDailySessionList
// @Summary      반려동물 회당 급여 및 섭취 목록 조회
// @Description  특정 날짜의 사료 무게 로그를 분석하여 LOG_ID와 FEED_TYPE이 포함된 세션 타임라인을 반환합니다.
// @Tags         Pets
// @Produce      json
// @Param        id     path      int     true  "Pet ID"
// @Param        date   query     string  true  "조회 날짜 (YYYY-MM-DD)"
// @Success      200    {object}  PetSessionListResponse
// @Router       /pets/{id}/sessions [get]
func GetDailySessionList(c *gin.Context) {
	petID := c.Param("id")
	targetDate := c.Query("date")

	if targetDate == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "날짜(date) 파라미터가 필요합니다."})
		return
	}

	petIDInt, _ := strconv.Atoi(petID)

	query := `
		SELECT 
			l.LOG_ID,
			l.CURRENT_FOOD_ID,
			NVL(f.PRODUCT_NAME, '미지정 사료') AS FOOD_NAME,
			l.FEED_WEIGHT, 
			l.CONSUMPTION,
			TO_CHAR(l.MEASURED_AT, 'YYYY-MM-DD HH24:MI:SS') AS MEASURED_TIME,
			l.FEED_TYPE
		FROM FOOD_WEIGHT_LOGS l
		LEFT JOIN FOOD_MASTER f ON l.CURRENT_FOOD_ID = f.FOOD_ID
		WHERE l.PET_ID = :1 
		  AND TO_CHAR(l.MEASURED_AT, 'YYYY-MM-DD') = :2 
		ORDER BY l.MEASURED_AT ASC`

	rows, err := database.DB.Query(query, petID, targetDate)
	if err != nil {
		log.Printf("❌ 세션 목록 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 조회 중 오류 발생"})
		return
	}
	defer rows.Close()

	type LogRow struct {
		LogID       int
		FoodID      int
		FoodName    string
		Weight      float64
		Consumption float64
		Time        string
		FeedType    string
	}

	var logs []LogRow
	for rows.Next() {
		var r LogRow
		if err := rows.Scan(&r.LogID, &r.FoodID, &r.FoodName, &r.Weight, &r.Consumption, &r.Time, &r.FeedType); err == nil {
			logs = append(logs, r)
		}
	}

	var sessions []FeedingSessionElement
	var currentSession *FeedingSessionElement

	// [핵심 추가] 저울 무게뿐만 아니라, 해당 잔량이 확정된 시점의 정보도 함께 추적합니다.
	var lastKnownWeight float64 = 0
	var lastKnownLogID int = 0
	var lastKnownTime string = ""

	i := 0
	for i < len(logs) {
		curr := logs[i]

		// DB 데이터 공백 오염 방어
		currentFeedType := strings.TrimSpace(curr.FeedType)

		// 1. MANUAL 급여 처리 (AUTO 상태 머신과 완전 분리)
		if currentFeedType == "MANUAL" {
			nextFeedType := ""
			if i+1 < len(logs) {
				nextFeedType = strings.TrimSpace(logs[i+1].FeedType)
			}

			if i+1 < len(logs) && nextFeedType == "MANUAL" {
				next := logs[i+1]
				sessions = append(sessions, FeedingSessionElement{
					LogID:          curr.LogID,
					FeedingTime:    curr.Time,
					CurrentFoodID:  curr.FoodID,
					FoodName:       curr.FoodName,
					FedAmount:      curr.Weight,
					ConsumedAmount: next.Consumption,
					FeedType:       "MANUAL",
				})
				i += 2
			} else {
				sessions = append(sessions, FeedingSessionElement{
					LogID:          curr.LogID,
					FeedingTime:    curr.Time,
					CurrentFoodID:  curr.FoodID,
					FoodName:       curr.FoodName,
					FedAmount:      curr.Weight,
					ConsumedAmount: curr.Consumption,
					FeedType:       "MANUAL",
				})
				i++
			}
			continue
		}

		// 2. AUTO 급여 및 섭취 분리 처리
		if curr.Weight > lastKnownWeight {
			// 2-1. 무게 증가 (배식 발생)
			if currentSession != nil && (currentSession.FedAmount > 0 || currentSession.ConsumedAmount > 0) {
				currentSession.ConsumedAmount = math.Round(currentSession.ConsumedAmount*100) / 100
				currentSession.FedAmount = math.Round(currentSession.FedAmount*100) / 100
				sessions = append(sessions, *currentSession)
			}

			currentSession = &FeedingSessionElement{
				LogID:          curr.LogID,
				FeedingTime:    curr.Time,
				CurrentFoodID:  curr.FoodID,
				FoodName:       curr.FoodName,
				FedAmount:      curr.Weight - lastKnownWeight,
				ConsumedAmount: 0,
				FeedType:       "AUTO",
			}
		} else if curr.Weight < lastKnownWeight {
			// 2-2. 무게 감소 (사료 섭취 발생)
			consumed := lastKnownWeight - curr.Weight

			if currentSession == nil {
				currentSession = &FeedingSessionElement{
					LogID:          lastKnownLogID, // [수정] 해당 잔량이 기준이 된 시점 상속
					FeedingTime:    lastKnownTime,
					CurrentFoodID:  curr.FoodID,
					FoodName:       curr.FoodName,
					FedAmount:      lastKnownWeight,
					ConsumedAmount: consumed,
					FeedType:       "AUTO",
				}
			} else {
				if currentSession.ConsumedAmount == 0 {
					currentSession.ConsumedAmount = consumed
				} else {
					currentSession.ConsumedAmount = math.Round(currentSession.ConsumedAmount*100) / 100
					currentSession.FedAmount = math.Round(currentSession.FedAmount*100) / 100
					sessions = append(sessions, *currentSession)

					currentSession = &FeedingSessionElement{
						LogID:          lastKnownLogID, // [수정] 5g 잔량이 남게 된 바로 그 시점(994번) 상속
						FeedingTime:    lastKnownTime,  // 20:56:59
						CurrentFoodID:  curr.FoodID,
						FoodName:       curr.FoodName,
						FedAmount:      lastKnownWeight,
						ConsumedAmount: consumed,
						FeedType:       "AUTO",
					}
				}
			}
		}

		// [중요] 다음 연산을 위해 무게와 함께 로그 ID, 시간 정보도 갱신
		lastKnownWeight = curr.Weight
		lastKnownLogID = curr.LogID
		lastKnownTime = curr.Time
		i++
	}

	// 잔여 세션 확정 처리
	if currentSession != nil && (currentSession.FedAmount > 0 || currentSession.ConsumedAmount > 0) {
		currentSession.ConsumedAmount = math.Round(currentSession.ConsumedAmount*100) / 100
		currentSession.FedAmount = math.Round(currentSession.FedAmount*100) / 100
		sessions = append(sessions, *currentSession)
	}

	if sessions == nil {
		sessions = []FeedingSessionElement{}
	}

	c.JSON(http.StatusOK, PetSessionListResponse{
		PetID:        petIDInt,
		Date:         targetDate,
		SessionCount: len(sessions),
		Sessions:     sessions,
	})
}

// SaveChatTurnInput 대화 1턴(질문+답변) 동시 저장용 구조체
type SaveChatTurnInput struct {
	UserID      int    `json:"user_id" binding:"required" example:"1"`
	UserMessage string `json:"user_message" binding:"required" example:"성공이 오늘 사료 얼마나 먹었어?"`
	AIMessage   string `json:"ai_message" binding:"required" example:"오늘 성공이는 총 120g을 먹었습니다."`
}

// SaveChatTurn
// @Summary 대화 세트(질문+답변) 동시 저장
// @Description 사용자의 질문과 AI의 답변을 하나의 트랜잭션으로 DB에 안전하게 기록합니다.
// @Accept  json
// @Produce json
// @Param   data  body      SaveChatTurnInput  true  "저장할 대화 세트"
// @Success 200   {object}  map[string]interface{}
// @Router /chat/save-turn [post]
func SaveChatTurn(c *gin.Context) {
	var input SaveChatTurnInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	// 1. DB 트랜잭션 시작 (안전장치)
	tx, err := database.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB 연결 오류"})
		return
	}

	// 2. 사용자 질문 먼저 저장 (Role: 'user')
	query := `INSERT INTO CHAT_HISTORY (USER_ID, ROLE, MESSAGE) VALUES (:1, 'user', :2)`
	_, err = tx.Exec(query, input.UserID, input.UserMessage)
	if err != nil {
		tx.Rollback() // 에러 나면 취소!
		c.JSON(http.StatusInternalServerError, gin.H{"error": "사용자 질문 저장 실패"})
		return
	}

	// 3. AI 답변 이어서 저장 (Role: 'assistant')
	query = `INSERT INTO CHAT_HISTORY (USER_ID, ROLE, MESSAGE) VALUES (:1, 'assistant', :2)`
	_, err = tx.Exec(query, input.UserID, input.AIMessage)
	if err != nil {
		tx.Rollback() // 여기서 에러 나도 질문 저장했던 것까지 전부 취소!
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI 답변 저장 실패"})
		return
	}

	// 4. 둘 다 성공하면 최종 승인(Commit)
	err = tx.Commit()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 반영 실패"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "대화가 성공적으로 저장되었습니다."})
}

type ChatLog struct {
	Role    string `json:"role"`
	Message string `json:"message"`
}

// GetChatHistory
// @Summary 최근 대화 내역 조회
// @Description 특정 유저의 최근 대화 10건을 가져와 AI 문맥으로 활용합니다.
// @Produce  json
// @Param   userId   path    int  true  "User ID"
// @Success 200 {array} ChatLog
// @Router /chat/history/{userId} [get]
func GetChatHistory(c *gin.Context) {
	userID := c.Param("userId")

	var logs []ChatLog

	// 1. 최근 10개를 역순으로 뽑은 뒤, 다시 시간순(ASC)으로 정렬하여 문맥을 맞춤
	query := `
		SELECT ROLE, MESSAGE FROM (
			SELECT ROLE, MESSAGE, CREATED_AT 
			FROM CHAT_HISTORY 
			WHERE USER_ID = :1 
			ORDER BY CREATED_AT DESC
		) 
		WHERE ROWNUM <= 20 
		ORDER BY CREATED_AT ASC`

	rows, err := database.DB.Query(query, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "대화 기록 조회 실패"})
		return
	}
	defer rows.Close()

	for rows.Next() {
		var log ChatLog
		if err := rows.Scan(&log.Role, &log.Message); err != nil {
			continue
		}
		logs = append(logs, log)
	}

	c.JSON(http.StatusOK, logs)
}

// RegisterInput 회원가입 입력 구조체
type RegisterInput struct {
	Email    string `json:"email" binding:"required" example:"test@sunmoon.ac.kr"`
	Password string `json:"password" binding:"required" example:"pass1234"`
}

// RegisterUser
// @Summary 신규 사용자 등록 (ID 반환)
// @Description Email과 Password를 받아 등록하고, 생성된 USER_ID를 반환합니다.
// @Accept  json
// @Produce json
// @Param   data  body      RegisterInput  true  "회원가입 정보"
// @Success 200   {object}  map[string]interface{}
// @Router /auth/register [post]
func RegisterUser(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다."})
		return
	}

	var newID int
	// RETURNING 절을 사용하여 생성된 USER_ID를 바로 가져옵니다.
	query := `INSERT INTO USERS (EMAIL, PASSWORD) VALUES (:1, :2) RETURNING USER_ID INTO :3`

	// DB 드라이버에 따라 파라미터 바인딩 방식이 다를 수 있으나,
	// 일반적으로 QueryRow를 사용하여 결과를 스캔합니다.
	_, err := database.DB.Exec(query, input.Email, input.Password, sql.Out{Dest: &newID})

	if err != nil {
		fmt.Println("DB Error:", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "사용자 등록 실패 (중복 이메일 등)"})
		return
	}

	// 성공 시 생성된 ID와 함께 응답
	c.JSON(http.StatusOK, gin.H{
		"message": "회원가입이 완료되었습니다.",
		"user_id": newID, // 생성된 PK 반환
		"email":   input.Email,
	})
}

// DeletePet
// @Summary 반려동물 정보 삭제
// @Description pet_id를 이용해 해당 반려동물의 정보를 DB에서 영구 삭제합니다.
// @Accept  json
// @Produce json
// @Param   id    path      int  true  "Pet ID"
// @Success 200   {object}  map[string]interface{}
// @Router /pets/{id} [delete]
func DeletePet(c *gin.Context) {
	petID := c.Param("id")

	query := `DELETE FROM PETS WHERE PET_ID = :1`
	result, err := database.DB.Exec(query, petID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "삭제 중 오류가 발생했습니다."})
		return
	}

	// 삭제된 행이 있는지 확인
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 ID의 반려동물을 찾을 수 없습니다."})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "성공적으로 삭제되었습니다.", "pet_id": petID})
}

type UpdatePetInput struct {
	Name                  string   `json:"name" binding:"required" example:"성공이"`
	Species               string   `json:"species" example:"Dog"`
	Breed                 string   `json:"breed" example:"Poodle"`
	Gender                string   `json:"gender" binding:"oneof=M F U" example:"U"`
	BirthDate             string   `json:"birth_date" example:"2024-01-01"` // 포맷 가이드 변경 (YYYY-MM-DD)
	CurrentWeight         float64  `json:"current_weight" example:"7.5"`
	BcsScore              int      `json:"bcs_score" example:"1"`
	PhotoUrl              string   `json:"photo_url" example:""`
	RerValue              float64  `json:"rer_value" example:"317.24"`
	CurrentFoodId         int      `json:"current_food_id" example:"0"`
	RecommendedFeedAmount float64  `json:"recommended_feed_amount" example:"0"`
	HealthStatus          []string `json:"health_status" example:"diabetes,arthritis"` // 수정: 단일 string에서 문자열 슬라이스로 변경
}

// UpdatePetDetail
// @Summary 반려동물 상세 정보 통합 수정
// @Description 제공된 모든 필드 및 다중 질병 목록을 바탕으로 반려동물 정보를 최신화합니다.
// @Accept   json
// @Produce  json
// @Param    id    path      int             true  "Pet ID"
// @Param    data  body      UpdatePetInput  true  "수정할 상세 데이터"
// @Success  200   {object}  map[string]interface{}
// @Router   /pets/{id} [put]
func UpdatePetDetail(c *gin.Context) {
	petID := c.Param("id")
	var input UpdatePetInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 데이터 형식이 잘못되었습니다."})
		return
	}

	// 데이터 전처리 (빈 값 방어)
	var birthDate interface{}
	if input.BirthDate == "" {
		birthDate = nil
	} else {
		birthDate = input.BirthDate
	}

	var photoURL interface{}
	if input.PhotoUrl == "" {
		photoURL = nil
	} else {
		photoURL = input.PhotoUrl
	}

	var foodID interface{}
	if input.CurrentFoodId == 0 {
		foodID = nil
	} else {
		foodID = input.CurrentFoodId
	}

	// 1. 트랜잭션 시작 (PETS 테이블과 PET_HEALTH_STATUSES 테이블을 동시에 수정하므로 필수)
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("❌ 트랜잭션 시작 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 오류 발생"})
		return
	}
	defer tx.Rollback() // 에러 발생 시 자동 롤백

	// 2. PETS 테이블 업데이트 (HEALTH_STATUS 컬럼 제외, 바인딩 변수 총 12개로 축소)
	updatePetQuery := `
		UPDATE PETS 
		SET NAME = :1, 
			SPECIES = :2, 
			BREED = :3, 
			GENDER = :4, 
			BIRTH_DATE = TO_DATE(:5, 'YYYY-MM-DD'), 
			CURRENT_WEIGHT = :6, 
			BCS_SCORE = :7, 
			PHOTO_URL = :8, 
			RER_VALUE = :9, 
			CURRENT_FOOD_ID = :10, 
			RECOMMENDED_FEED_AMOUNT = :11, 
			LAST_ANALYSIS_DATE = SYSDATE
		WHERE PET_ID = :12`

	result, err := tx.Exec(updatePetQuery,
		input.Name,
		input.Species,
		input.Breed,
		input.Gender,
		birthDate,
		input.CurrentWeight,
		input.BcsScore,
		photoURL,
		input.RerValue,
		foodID,
		input.RecommendedFeedAmount,
		petID, // :12
	)

	if err != nil {
		log.Printf("❌ PETS 테이블 수정 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "반려동물 기본 정보 수정 실패"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 반려동물을 찾을 수 없습니다."})
		return
	}

	// 3. 교차 테이블(PET_HEALTH_STATUSES) 내 기존 질병 기록 완전히 삭제 (Clear)
	deleteStatusQuery := `DELETE FROM PET_HEALTH_STATUSES WHERE PET_ID = :1`
	_, err = tx.Exec(deleteStatusQuery, petID)
	if err != nil {
		log.Printf("❌ 기존 질병 기록 삭제 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "질병 데이터 동기화 실패"})
		return
	}

	// 4. 새로운 다중 질병 목록 배열 순회하며 새로 삽입 (Insert)
	// 만약 프론트에서 빈 배열을 보냈거나 설정된 질병이 없다면 기본값 "none"으로 전환 적재
	healthStatuses := input.HealthStatus
	if len(healthStatuses) == 0 {
		healthStatuses = []string{"none"}
	}

	insertStatusQuery := `INSERT INTO PET_HEALTH_STATUSES (PET_ID, DISEASE_NAME) VALUES (:1, :2)`
	for _, disease := range healthStatuses {
		if disease == "" {
			disease = "none"
		}
		_, err = tx.Exec(insertStatusQuery, petID, disease)
		if err != nil {
			log.Printf("❌ 질병 기록 삽입 실패 (%s): %v", disease, err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "질병 데이터 저장 중 오류 발생"})
			return
		}
	}

	// 5. 모든 DB 작업이 성공적으로 완결되었을 때 최종 커밋
	if err := tx.Commit(); err != nil {
		log.Printf("❌ 트랜잭션 커밋 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 최종 반영 실패"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":        "success",
		"message":       "반려동물 정보 및 다중 질병 정보가 성공적으로 최신화되었습니다.",
		"pet_id":        petID,
		"health_status": healthStatuses,
	})
}

// DeleteUser
// @Summary 회원 탈퇴
// @Description 사용자와 관련된 모든 데이터(반려동물, 로그 등)를 삭제하고 탈퇴 처리합니다.
// @Param   id    path      int     true  "User ID"
// @Success 200   {object}  map[string]interface{}
// @Router /users/{id} [delete]
func DeleteUser(c *gin.Context) {
	userID := c.Param("id")

	// 1. 트랜잭션 시작 (선택 사항이나 데이터 무결성을 위해 권장)
	// 유저 삭제 시 연관된 모든 테이블에서 ON DELETE CASCADE가 설정되어 있다면
	// USERS 테이블만 지워도 하위 데이터가 모두 삭제됩니다.

	query := `DELETE FROM USERS WHERE USER_ID = :1`

	result, err := database.DB.Exec(query, userID)
	if err != nil {
		log.Printf("회원 탈퇴 처리 중 DB 오류: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "회원 탈퇴 처리 실패",
			"details": err.Error(),
		})
		return
	}

	// 2. 삭제된 행이 있는지 확인
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "존재하지 않는 사용자입니다."})
		return
	}

	// 3. 성공 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "회원 탈퇴가 완료되었습니다. 관련된 모든 데이터가 삭제되었습니다.",
		"user_id": userID,
	})
}

// MeatDetailsRequest 프론트엔드 입력 데이터 구조체
type MealDetailsRequest struct {
	PetID    int    `json:"pet_id" example:"166"`
	FeedTime string `json:"feed_time" example:"2026-05-13 14:12:39"` // YYYY-MM-DD HH24:MI:SS 형식
}

// MealDetailsResponse 프론트엔드 반환 데이터 구조체
type MealDetailsResponse struct {
	FeedAmount  float64 `json:"feed_amount"` // 1회 급여량 (g)
	Consumption float64 `json:"consumption"` // 1회 섭취량 (g)
	FoodName    string  `json:"food_name"`   // 사료명
}

// GetMealDetails
// @Summary 1회 급여량 및 섭취량 상세 조회
// @Description 특정 급여 시간을 기준으로 사료명, 급여량, 실제 섭취량을 계산하여 반환합니다.
// @Accept   json
// @Produce  json
// @Param    request  body      MealDetailsRequest  true  "급여 조회 요청 정보"
// @Success  200      {object}  MealDetailsResponse
// @Router   /pets/meal-details [post]
func GetMealDetails(c *gin.Context) {
	var input MealDetailsRequest

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 데이터 형식이 올바르지 않습니다."})
		return
	}

	// 1. 사료명(PRODUCT_NAME) 조회 (PETS 테이블과 FOOD_MASTER 테이블 JOIN)
	var foodName string
	foodQuery := `
		SELECT NVL(f.PRODUCT_NAME, '지정되지 않음')
		FROM PETS p
		LEFT JOIN FOOD_MASTER f ON p.CURRENT_FOOD_ID = f.FOOD_ID
		WHERE p.PET_ID = :1`

	err := database.DB.QueryRow(foodQuery, input.PetID).Scan(&foodName)
	if err != nil {
		log.Printf("사료 정보 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "사료 정보 조회 실패"})
		return
	}

	// 2. 입력된 급여 시간 이후 최초로 기록된 로그(급여 시점) 조회
	// IoT 기기의 전송 딜레이를 고려하여, 입력 시간과 가장 가까운 미래의 로그 1건을 찾습니다.
	var feedAmount float64
	var mealTimestamp time.Time

	startLogQuery := `
		SELECT FEED_WEIGHT, MEASURED_AT 
		FROM (
			SELECT FEED_WEIGHT, MEASURED_AT 
			FROM FOOD_WEIGHT_LOGS 
			WHERE PET_ID = :1 
			  AND MEASURED_AT >= TO_TIMESTAMP(:2, 'YYYY-MM-DD HH24:MI:SS') 
			ORDER BY MEASURED_AT ASC
		) 
		WHERE ROWNUM = 1`

	err = database.DB.QueryRow(startLogQuery, input.PetID, input.FeedTime).Scan(&feedAmount, &mealTimestamp)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 시간에 기록된 급여 로그가 없습니다."})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "급여 데이터 조회 실패"})
		return
	}

	// 3. 해당 급여 시점 이후의 로그들을 가져와 다음 급여(사료 보충) 전까지의 섭취량 계산
	subsequentQuery := `
		SELECT FEED_WEIGHT 
		FROM FOOD_WEIGHT_LOGS 
		WHERE PET_ID = :1 
		  AND MEASURED_AT > :2 
		ORDER BY MEASURED_AT ASC`

	rows, err := database.DB.Query(subsequentQuery, input.PetID, mealTimestamp)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "섭취량 추적 실패"})
		return
	}
	defer rows.Close()

	var consumption float64 = 0
	prevWeight := feedAmount

	for rows.Next() {
		var currWeight float64
		if err := rows.Scan(&currWeight); err != nil {
			continue
		}

		// 만약 현재 무게가 이전 무게보다 크다면 사료가 새로 보충된 것(다음 급여)이므로 섭취량 계산을 중단합니다.
		if currWeight > prevWeight {
			break
		}

		// 무게가 줄어든 경우 섭취량에 누적
		if currWeight < prevWeight {
			consumption += (prevWeight - currWeight)
		}
		prevWeight = currWeight
	}

	// 4. 최종 결과 반환
	c.JSON(http.StatusOK, MealDetailsResponse{
		FeedAmount:  feedAmount,
		Consumption: consumption,
		FoodName:    foodName,
	})
}

// ManualFeedInput 수동 급여 입력 구조체
type ManualFeedInput struct {
	PetID       int     `json:"pet_id" example:"166"`
	FeedAmount  float64 `json:"feed_amount" example:"23.0"`              // 급여량 (g)
	Consumption float64 `json:"consumption" example:"20.0"`              // 섭취량 (g)
	FeedTime    string  `json:"feed_time" example:"2026-05-20 13:05:00"` // YYYY-MM-DD HH24:MI:SS
}

// SaveManualFeedLog
// @Summary      수동 급여 기록 저장
// @Description  이전 잔량을 무시하고 입력값을 저장하되, 동일한 시간의 중복 입력은 차단합니다.
// @Tags         Pets
// @Accept       json
// @Produce      json
// @Param        data  body      ManualFeedInput  true  "수동 급여 데이터"
// @Success      200   {object}  map[string]interface{}
// @Router       /iot/self-manual-weight [post]
func SaveManualFeedLog(c *gin.Context) {
	var input ManualFeedInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "데이터 형식이 올바르지 않습니다."})
		return
	}

	// 1. 시간 파싱 및 1초 추가 연산 (쌍으로 묶기 위함)
	t, err := time.Parse("2006-01-02 15:04:05", input.FeedTime)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "feed_time 형식이 올바르지 않습니다. (YYYY-MM-DD HH24:MI:SS)"})
		return
	}
	feedTime1 := input.FeedTime
	feedTime2 := t.Add(1 * time.Second).Format("2006-01-02 15:04:05")

	// 2. [추가된 로직] 중복 데이터 검사 (동일한 펫, 동일한 시간에 기록이 있는지 확인)
	var exists int
	checkDupQuery := `
		SELECT 1 
		FROM FOOD_WEIGHT_LOGS 
		WHERE PET_ID = :1 AND MEASURED_AT = TO_TIMESTAMP(:2, 'YYYY-MM-DD HH24:MI:SS') 
		AND ROWNUM = 1`

	err = database.DB.QueryRow(checkDupQuery, input.PetID, input.FeedTime).Scan(&exists)
	if err == nil {
		// 에러 없이 값이 반환되었다면 이미 동일한 시간에 데이터가 존재함
		c.JSON(http.StatusConflict, gin.H{"error": "해당 시간에 이미 등록된 급여 기록이 존재합니다."})
		return
	} else if err != sql.ErrNoRows {
		// 데이터 없음(ErrNoRows)이 아닌 다른 데이터베이스 에러가 발생한 경우
		log.Printf("❌ 중복 검사 중 DB 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 중복 검사 중 오류가 발생했습니다."})
		return
	}
	// err == sql.ErrNoRows 인 경우, 중복 데이터가 없으므로 아래 로직 정상 진행

	// 3. PETS 테이블에서 현재 사료(CURRENT_FOOD_ID) 선조회
	var currentFoodID int
	querySelect := `SELECT CURRENT_FOOD_ID FROM PETS WHERE PET_ID = :1`
	err = database.DB.QueryRow(querySelect, input.PetID).Scan(&currentFoodID)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "등록되지 않은 반려동물 ID입니다.", "pet_id": input.PetID})
		return
	} else if err != nil {
		log.Printf("❌ 수동 급여 처리 중 PETS 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류 (사료 정보 조회 실패)"})
		return
	}

	// 4. 이전 잔량 조회 및 합산 로직 완전 제거 (절대값 반영)
	initialWeight := input.FeedAmount
	remainingWeight := input.FeedAmount - input.Consumption

	// 섭취량이 입력한 급여량보다 클 수 없음
	if remainingWeight < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "섭취량이 입력한 급여량보다 클 수 없습니다."})
		return
	}

	// 5. 트랜잭션 시작
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("트랜잭션 시작 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 오류"})
		return
	}
	defer tx.Rollback()

	queryInsert := `
		INSERT INTO FOOD_WEIGHT_LOGS (
			PET_ID, 
			CURRENT_FOOD_ID, 
			FEED_WEIGHT, 
			MEASURED_AT, 
			CONSUMPTION,
			FEED_TYPE
		) VALUES (:1, :2, :3, TO_TIMESTAMP(:4, 'YYYY-MM-DD HH24:MI:SS'), :5, 'MANUAL')`

	// [데이터 1] 급여 시작 (입력값 절대값 그대로 저장)
	_, err = tx.Exec(queryInsert, input.PetID, currentFoodID, initialWeight, feedTime1, 0)
	if err != nil {
		log.Printf("수동 급여 1차 인서트 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "초기 급여 데이터 기록 실패"})
		return
	}

	// [데이터 2] 섭취 완료 (남은 잔량 3g 절대값 그대로 저장)
	_, err = tx.Exec(queryInsert, input.PetID, currentFoodID, remainingWeight, feedTime2, input.Consumption)
	if err != nil {
		log.Printf("수동 급여 2차 인서트 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "섭취 완료 데이터 기록 실패"})
		return
	}

	// 6. 커밋
	if err := tx.Commit(); err != nil {
		log.Printf("트랜잭션 커밋 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 저장 실패"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "수동 급여 데이터가 이전 잔량 고려 없이 정상 반영되었습니다.",
		"details": gin.H{
			"pet_id":          input.PetID,
			"input_fed":       input.FeedAmount,
			"input_consumed":  input.Consumption,
			"saved_weight":    initialWeight,
			"saved_remaining": remainingWeight,
		},
	})
}

// DeleteFeedLogInput 급여 기록 삭제 입력 구조체
type DeleteFeedLogInput struct {
	PetID      int     `json:"pet_id" example:"166"`
	FeedAmount float64 `json:"feed_amount" example:"100.0"`
	FeedTime   string  `json:"feed_time" example:"2026-05-17 14:00:00"` // YYYY-MM-DD HH24:MI:SS
}

// DeleteFeedLogPair
// @Summary 급여 기록 쌍 삭제
// @Description 입력한 급여 로그와 그 바로 다음에 기록된 섭취 완료 로그를 찾아 함께 삭제합니다.
// @Accept   json
// @Produce  json
// @Param    data  body      DeleteFeedLogInput  true  "삭제 요청 데이터"
// @Router   /iot/weight-pair [delete]
func DeleteFeedLogPair(c *gin.Context) {
	var input DeleteFeedLogInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "데이터 형식이 올바르지 않습니다."})
		return
	}

	// 1. 트랜잭션 시작 (두 건의 삭제 작업이 모두 성공해야 하므로)
	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("트랜잭션 시작 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 오류"})
		return
	}
	defer tx.Rollback()

	// 2. 입력 조건과 정확히 일치하는 기준 로그의 LOG_ID와 MEASURED_AT 조회
	var targetLogID int
	var targetMeasuredAt time.Time

	findTargetQuery := `
		SELECT LOG_ID, MEASURED_AT 
		FROM FOOD_WEIGHT_LOGS 
		WHERE PET_ID = :1 
		  AND FEED_WEIGHT = :2 
		  AND MEASURED_AT = TO_TIMESTAMP(:3, 'YYYY-MM-DD HH24:MI:SS')`

	err = tx.QueryRow(findTargetQuery, input.PetID, input.FeedAmount, input.FeedTime).Scan(&targetLogID, &targetMeasuredAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "일치하는 급여 기록을 찾을 수 없습니다."})
		return
	} else if err != nil {
		log.Printf("기준 로그 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 조회 중 오류 발생"})
		return
	}

	// 3. 기준 로그(targetLogID)와 시간상 바로 다음 로그를 서브쿼리로 찾아 동시에 삭제
	// ROWNUM = 1을 통해 바로 다음 1건만 특정하여 삭제 범위를 제한합니다.
	deleteQuery := `
		DELETE FROM FOOD_WEIGHT_LOGS 
		WHERE LOG_ID = :1 
		   OR LOG_ID = (
			   SELECT LOG_ID FROM (
				   SELECT LOG_ID 
				   FROM FOOD_WEIGHT_LOGS 
				   WHERE PET_ID = :2 
					 AND MEASURED_AT > :3 
				   ORDER BY MEASURED_AT ASC
			   ) WHERE ROWNUM = 1
		   )`

	result, err := tx.Exec(deleteQuery, targetLogID, input.PetID, targetMeasuredAt)
	if err != nil {
		log.Printf("로그 쌍 삭제 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "기록 삭제 중 오류 발생"})
		return
	}

	rowsAffected, _ := result.RowsAffected()

	// 4. 트랜잭션 커밋
	if err := tx.Commit(); err != nil {
		log.Printf("트랜잭션 커밋 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터 반영 실패"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":        "success",
		"message":       "급여 기록과 후속 섭취 기록이 성공적으로 삭제되었습니다.",
		"rows_affected": rowsAffected, // 정상적인 경우 2가 반환됨
	})
}

type UpdatePasswordInput struct {
	Email       string `json:"email" binding:"required,email" example:"test@sunmoon.ac.kr"`
	NewPassword string `json:"new_password" binding:"required" example:"newPassword123!"`
}

// UpdatePassword
// @Summary 사용자 비밀번호 수정 (이메일 기준)
// @Description 가입된 이메일을 조회하여 해당 사용자의 비밀번호를 새로운 비밀번호로 최신화합니다.
// @Accept   json
// @Produce  json
// @Param    data  body      UpdatePasswordInput  true  "비밀번호 변경 요청 데이터"
// @Success  200   {object}  map[string]interface{}
// @Router   /users/password [put]
func UpdatePassword(c *gin.Context) {
	var input UpdatePasswordInput

	// 1. JSON 바인딩 및 이메일 형식 유효성 검증
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "이메일 형식 또는 입력 데이터가 올바르지 않습니다."})
		return
	}

	// 2. 비밀번호 암호화 (Bcrypt 해싱)
	// ※ 평문 저장 구조라면 이 단계를 주석 처리하고 query에 input.NewPassword를 직접 바인딩하십시오.
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("❌ 비밀번호 해싱 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "비밀번호 암호화 처리 중 오류가 발생했습니다."})
		return
	}

	// 3. 오라클 UPDATE 쿼리 실행 (EMAIL 조건 기반 변경)
	query := `
		UPDATE USERS 
		SET PASSWORD = :1 
		WHERE EMAIL = :2`

	result, err := database.DB.Exec(query, string(hashedPassword), input.Email)
	if err != nil {
		log.Printf("❌ 비밀번호 수정 DB 에러: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터베이스 수정 실패"})
		return
	}

	// 4. 입력한 이메일이 USERS 테이블에 실제로 존재하는지 레코드 수 체크
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "등록되지 않은 이메일 주소입니다."})
		return
	}

	// 5. 성공 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "비밀번호가 성공적으로 변경되었습니다.",
	})
}

// LoginInput 로그인 요청 구조체
type LoginInput struct {
	Email    string `json:"email" binding:"required,email" example:"test@sunmoon.ac.kr"`
	Password string `json:"password" binding:"required" example:"password123!"`
}

// Login
// @Summary 사용자 로그인
// @Description 이메일과 비밀번호를 검증하여 로그인을 처리하고 고유 USER_ID를 반환합니다.
// @Accept   json
// @Produce  json
// @Param    data  body      LoginInput  true  "로그인 정보"
// @Success  200   {object}  map[string]interface{}
// @Router   /users/login [post]
func Login(c *gin.Context) {
	var input LoginInput

	// 1. 요청 데이터 바인딩
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "이메일 형식 또는 입력 데이터가 올바르지 않습니다."})
		return
	}

	var dbUserID int
	var dbPassword string

	// 2. 이메일 기반 데이터 조회
	query := `SELECT USER_ID, PASSWORD FROM USERS WHERE EMAIL = :1`
	err := database.DB.QueryRow(query, input.Email).Scan(&dbUserID, &dbPassword)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "이메일 또는 비밀번호가 일치하지 않습니다."})
		return
	} else if err != nil {
		log.Printf("❌ 로그인 조회 DB 에러: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "데이터베이스 조회 중 오류가 발생했습니다."})
		return
	}

	// 3. [핵심] 비밀번호 검증 조건 분기
	// DB에 저장된 비밀번호가 Bcrypt 시그니처($2a$)로 시작하는지 검사
	if strings.HasPrefix(dbPassword, "$2a$") {
		// 암호화 데이터 회원 검증 (9번 데이터 케이스)
		err = bcrypt.CompareHashAndPassword([]byte(dbPassword), []byte(input.Password))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "이메일 또는 비밀번호가 일치하지 않습니다."})
			return
		}
	} else {
		// 평문 데이터 회원 검증 (1~8번 데이터 케이스)
		if dbPassword != input.Password {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "이메일 또는 비밀번호가 일치하지 않습니다."})
			return
		}
	}

	// 4. 인증 성공 시 결과 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "로그인에 성공했습니다.",
		"user": gin.H{
			"user_id": dbUserID,
			"email":   input.Email,
		},
	})
}

// ChangeFoodInput 사료 교체 요청 구조체
type ChangeFoodInput struct {
	PetID     int `json:"pet_id" binding:"required" example:"101"`
	NewFoodID int `json:"new_food_id" binding:"required" example:"5"`
}

// ChangePetFood
// @Summary      반려동물 사료 교체
// @Description  반려동물의 현재 사료(CURRENT_FOOD_ID)를 교체합니다. 과거 무게 로그의 사료 히스토리는 유지되며, 이후 적재되는 로그부터 새 사료 ID가 적용됩니다.
// @Tags         Pets
// @Accept       json
// @Produce      json
// @Param        data  body      ChangeFoodInput  true  "사료 교체 정보"
// @Success      200   {object}  map[string]interface{} "{"status":"success","message":"..."}"
// @Failure      400   {object}  map[string]interface{} "{"error":"입력 데이터가 올바르지 않습니다."}"
// @Failure      404   {object}  map[string]interface{} "{"error":"존재하지 않는 반려동물 ID입니다."}"
// @Failure      500   {object}  map[string]interface{} "{"error":"사료 정보 변경 중 오류가 발생했습니다."}"
// @Router       /pets/food [put]
func ChangePetFood(c *gin.Context) {
	var input ChangeFoodInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 데이터가 올바르지 않습니다."})
		return
	}

	// PETS 테이블만 단독 수정
	query := `UPDATE PETS SET CURRENT_FOOD_ID = :1 WHERE PET_ID = :2`
	result, err := database.DB.Exec(query, input.NewFoodID, input.PetID)
	if err != nil {
		log.Printf("❌ 사료 교체 DB 에러: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "사료 정보 변경 중 오류가 발생했습니다."})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "존재하지 않는 반려동물 ID입니다."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "반려동물의 사료가 성공적으로 교체되었습니다. 지금부터 새로운 사료로 로그가 기록됩니다.",
	})
}

// MonthlyConsumptionElement 일별 통계 단위 구조체 (필드 복구 완료)
type MonthlyConsumptionElement struct {
	Date             string  `json:"date"`              // 날짜 (YYYY-MM-DD)
	TotalFed         float64 `json:"total_fed"`         // [복구] 당일 총 급여량 (g)
	TotalConsumption float64 `json:"total_consumption"` // 당일 총 섭취량 (g)
	TotalRemaining   float64 `json:"total_remaining"`   // [복구] 당일 최종 잔량 (g)
	ConsumptionRate  float64 `json:"consumption_rate"`  // 당일 섭취율 (%)
	StatusColor      string  `json:"status_color"`      // 상태 색상 (초록/노랑/빨강)
}

// MonthlyConsumptionResponse 월간 섭취 분석 응답 구조체
type MonthlyConsumptionResponse struct {
	PetID int                         `json:"pet_id"`
	Month string                      `json:"month"` // 조회 월 (YYYY-MM)
	Data  []MonthlyConsumptionElement `json:"data"`
}

// GetMonthlyConsumption
// @Summary      월간 일별 섭취율 및 통계 조회
// @Description  특정 월(YYYY-MM)의 일별 사료 무게 변화를 조회하여 통계 리스트를 반환합니다. 수동 입력 데이터는 잔량 차감 없이 입력값 그대로 반영되며, 잔량은 (총급여-총섭취)로 계산됩니다.
// @Tags         Pets
// @Produce      json
// @Param        id     path      int     true  "Pet ID"
// @Param        month  query     string  true  "조회 월 (YYYY-MM)"
// @Success      200    {object}  MonthlyConsumptionResponse
// @Router       /pets/{id}/monthly-consumption [get]
func GetMonthlyConsumption(c *gin.Context) {
	petID := c.Param("id")
	targetMonth := c.Query("month")

	if targetMonth == "" || len(targetMonth) != 7 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "올바른 월(month) 파라미터가 필요합니다. (YYYY-MM)"})
		return
	}

	petIDInt, _ := strconv.Atoi(petID)

	query := `
		SELECT 
			FEED_WEIGHT, 
			CONSUMPTION,
			TO_CHAR(MEASURED_AT, 'YYYY-MM-DD HH24:MI:SS') AS MEASURED_TIME,
			TO_CHAR(MEASURED_AT, 'YYYY-MM-DD') AS LOG_DATE
		FROM FOOD_WEIGHT_LOGS 
		WHERE PET_ID = :1 
		  AND TO_CHAR(MEASURED_AT, 'YYYY-MM') = :2 
		ORDER BY MEASURED_AT ASC`

	rows, err := database.DB.Query(query, petID, targetMonth)
	if err != nil {
		log.Printf("❌ 월간 소비 데이터 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "월간 데이터 조회 중 오류 발생"})
		return
	}
	defer rows.Close()

	type MonthlyLogElement struct {
		Weight      float64
		Consumption float64
		Time        string
	}

	dailyLogsMap := make(map[string][]MonthlyLogElement)
	var dateOrder []string

	for rows.Next() {
		var r MonthlyLogElement
		var logDate string
		if err := rows.Scan(&r.Weight, &r.Consumption, &r.Time, &logDate); err == nil {
			if _, exists := dailyLogsMap[logDate]; !exists {
				dateOrder = append(dateOrder, logDate)
			}
			dailyLogsMap[logDate] = append(dailyLogsMap[logDate], r)
		}
	}

	var monthlyData []MonthlyConsumptionElement

	for _, date := range dateOrder {
		dayLogs := dailyLogsMap[date]

		var totalFed float64 = 0
		var totalConsumption float64 = 0
		var totalRemaining float64 = 0
		var consumptionRate float64 = 0
		var statusColor string = "빨강"

		if len(dayLogs) > 0 {
			idx := 0
			for idx < len(dayLogs) {
				isManual := false
				if idx+1 < len(dayLogs) {
					curr := dayLogs[idx]
					next := dayLogs[idx+1]

					tCurr, _ := time.Parse("2006-01-02 15:04:05", curr.Time)
					tNext, _ := time.Parse("2006-01-02 15:04:05", next.Time)

					if next.Consumption > 0 && tNext.Sub(tCurr) == 1*time.Second {
						isManual = true
					}
				}

				if isManual {
					// 수동 급여: 입력값 절대값 그대로 누적
					totalFed += dayLogs[idx].Weight
					totalConsumption += dayLogs[idx+1].Consumption
					idx += 2
				} else {
					// 자동 급여: 순수 증감분만 누적
					if idx == 0 {
						totalFed = dayLogs[idx].Weight
					} else {
						prev := dayLogs[idx-1]
						curr := dayLogs[idx]
						if curr.Weight < prev.Weight {
							totalConsumption += (prev.Weight - curr.Weight)
						} else if curr.Weight > prev.Weight {
							totalFed += (curr.Weight - prev.Weight)
						}
					}
					idx++
				}
			}

			// ✅ [수정 완료]: 총 급여 - 총 섭취 공식으로 잔량 확정 (프론트엔드 수치 동기화)
			totalRemaining = totalFed - totalConsumption
			if totalRemaining < 0 {
				totalRemaining = 0
			}

			if totalFed > 0 {
				consumptionRate = (totalConsumption / totalFed) * 100
				consumptionRate = math.Round(consumptionRate*100) / 100

				if consumptionRate >= 90 {
					statusColor = "초록"
				} else if consumptionRate >= 70 {
					statusColor = "노랑"
				} else {
					statusColor = "빨강"
				}
			}
		}

		monthlyData = append(monthlyData, MonthlyConsumptionElement{
			Date:             date,
			TotalFed:         math.Round(totalFed*100) / 100,
			TotalConsumption: math.Round(totalConsumption*100) / 100,
			TotalRemaining:   math.Round(totalRemaining*100) / 100,
			ConsumptionRate:  consumptionRate,
			StatusColor:      statusColor,
		})
	}

	if monthlyData == nil {
		monthlyData = []MonthlyConsumptionElement{}
	}

	c.JSON(http.StatusOK, MonthlyConsumptionResponse{
		PetID: petIDInt,
		Month: targetMonth,
		Data:  monthlyData,
	})
}

// SetActivePetInput 프론트엔드 입력 구조체
type SetActivePetInput struct {
	PetID int `json:"pet_id" binding:"required"`
}

// =======================================================
// [API 1] PUT: 프론트엔드에서 대상 펫 ID를 변경할 때 호출
// =======================================================
// @Summary      급여기 대상 펫 설정 (Active Pet 변경)
// @Description  CURRENT_ACTIVE_PET 테이블의 펫 ID를 업데이트합니다.
// @Tags         Config
// @Accept       json
// @Produce      json
// @Param        data  body      SetActivePetInput  true  "설정할 대상 펫 정보"
// @Success      200   {object}  map[string]interface{}
// @Router       /config/active-pet [put]
func SetActivePetID(c *gin.Context) {
	var input SetActivePetInput

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "올바른 JSON 형식이 아닙니다. pet_id가 필요합니다."})
		return
	}

	// 1. 외래키(FK) 무결성 검증: 존재하는 펫인지 사전에 확인
	var exists int
	err := database.DB.QueryRow(`SELECT 1 FROM PETS WHERE PET_ID = :1`, input.PetID).Scan(&exists)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "PETS 테이블에 존재하지 않는 펫 ID입니다."})
		return
	} else if err != nil {
		log.Printf("❌ PETS 검증 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 검증 오류"})
		return
	}

	// 2. DB 테이블의 펫 ID 수정 (CONFIG_ID = 1 고정행 업데이트)
	updateQuery := `
		UPDATE CURRENT_ACTIVE_PET 
		SET PET_ID = :1, UPDATED_AT = SYSDATE 
		WHERE CONFIG_ID = 1`

	_, err = database.DB.Exec(updateQuery, input.PetID)
	if err != nil {
		log.Printf("❌ 대상 펫 ID DB 업데이트 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "대상 펫 설정 중 오류 발생"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "데이터베이스에 타겟 펫 ID 변경 완료",
		"pet_id":  input.PetID,
	})
}

// =======================================================
// [API 2] GET: IoT 기기가 현재 설정된 타겟 펫을 조회할 때 호출
// =======================================================
// @Summary      현재 설정된 대상 펫 ID 조회
// @Description  CURRENT_ACTIVE_PET 테이블에 저장된 현재 활성 펫 ID를 반환합니다.
// @Tags         Config
// @Produce      json
// @Success      200   {object}  map[string]interface{}
// @Router       /config/active-pet [get]
func GetActivePetID(c *gin.Context) {
	var activePetID int

	// 단일 행 조회
	query := `SELECT PET_ID FROM CURRENT_ACTIVE_PET WHERE CONFIG_ID = 1`
	err := database.DB.QueryRow(query).Scan(&activePetID)
	if err != nil {
		log.Printf("❌ 현재 활성 펫 ID 조회 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "설정 데이터를 불러오지 못했습니다."})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"active_pet_id": activePetID,
	})
}

// DeleteWeightLog
// @Summary      특정 사료 로그 삭제
// @Description  LOG_ID를 기준으로 특정 사료 무게 로그를 삭제합니다.
// @Tags         Logs
// @Produce      json
// @Param        logId  path      int  true  "삭제할 로그의 LOG_ID"
// @Success      200    {object}  map[string]interface{}
// @Router       /logs/{logId} [delete]
func DeleteWeightLog(c *gin.Context) {
	logIDStr := c.Param("logId")

	// 파라미터 숫자 변환 검증
	logID, err := strconv.Atoi(logIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "유효하지 않은 로그 ID 형식입니다."})
		return
	}

	// DELETE 쿼리 실행
	deleteQuery := `DELETE FROM FOOD_WEIGHT_LOGS WHERE LOG_ID = :1`
	result, err := database.DB.Exec(deleteQuery, logID)
	if err != nil {
		log.Printf("❌ 로그 삭제 실패 (LOG_ID: %d): %v", logID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류 (삭제 실패)"})
		return
	}

	// 실제로 삭제된 행의 개수 확인
	rowsAffected, _ := result.RowsAffected()

	// 삭제된 데이터가 0개인 경우 (이미 지워졌거나 없는 ID)
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{
			"error":  "해당 LOG_ID를 찾을 수 없습니다.",
			"log_id": logID,
		})
		return
	}

	// 정상 삭제 완료 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "로그가 성공적으로 삭제되었습니다.",
		"log_id":  logID,
	})
}

// UpdateFoodInput 사료 단독 교체 요청 구조체
type UpdateFoodInput struct {
	FoodID int `json:"food_id" binding:"required" example:"5"`
}

// UpdatePetCurrentFood
// @Summary      반려동물 사료 단독 교체
// @Description  지정된 반려동물의 현재 급여 사료(CURRENT_FOOD_ID)만 단독으로 변경합니다.
// @Tags         Pets
// @Accept       json
// @Produce      json
// @Param        id    path      int              true  "Pet ID"
// @Param        data  body      UpdateFoodInput  true  "새로운 사료 ID"
// @Success      200   {object}  map[string]interface{}
// @Router       /pets/{id}/food [patch]
func UpdatePetCurrentFood(c *gin.Context) {
	petID := c.Param("id")
	var input UpdateFoodInput

	// 1. JSON 바인딩
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "입력 형식이 잘못되었습니다. food_id가 필요합니다."})
		return
	}

	// 2. PETS 테이블의 CURRENT_FOOD_ID 단독 업데이트
	query := `UPDATE PETS SET CURRENT_FOOD_ID = :1 WHERE PET_ID = :2`
	result, err := database.DB.Exec(query, input.FoodID, petID)

	if err != nil {
		log.Printf("❌ 사료 ID 단독 업데이트 실패: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "서버 내부 DB 오류가 발생했습니다."})
		return
	}

	// 3. 존재하지 않는 pet_id 방어 로직
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "해당 반려동물을 찾을 수 없습니다."})
		return
	}

	// 4. 성공 응답
	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "현재 급여 사료가 성공적으로 변경되었습니다.",
		"pet_id":  petID,
		"food_id": input.FoodID,
	})
}
