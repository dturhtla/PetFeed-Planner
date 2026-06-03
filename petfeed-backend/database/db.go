package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/godror/godror" // Oracle 드라이버 임포트
)

var DB *sql.DB

// InitDB: 데이터베이스 연결 초기화
func InitDB() error {
	// 연결 정보 (아이디/패스워드@호스트:포트/서비스이름)
	// 본인의 Oracle 환경에 맞춰 수정하세요.
	connStr := "root/1234@localhost:1521/xe"

	var err error
	DB, err = sql.Open("godror", connStr)
	if err != nil {
		return fmt.Errorf("DB 연결 실패: %v", err)
	}

	// 24GB RAM을 고려한 커넥션 풀 설정
	// 가용 자원이 넉넉하므로 동시 접속 처리 능력을 높입니다.
	DB.SetMaxOpenConns(50)                 // 동시에 열 수 있는 최대 연결 수
	DB.SetMaxIdleConns(25)                 // 대기 중인 연결 수 유지
	DB.SetConnMaxLifetime(5 * time.Minute) // 연결 유지 시간

	// 실제 연결 확인 (Ping)
	if err = DB.Ping(); err != nil {
		return fmt.Errorf("DB 응답 없음: %v", err)
	}

	fmt.Println("Oracle DB 연결 성공!")
	return nil
}
