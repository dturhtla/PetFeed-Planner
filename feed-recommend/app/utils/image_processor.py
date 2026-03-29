import cv2
import numpy as np
import base64


def preprocess_food_image(image_bytes: bytes) -> str:
    """
    사료 포장지 인식 최적화 전처리
    1. 리사이즈 (1024px 이하)
    2. 샤프닝 (텍스트 선명하게)
    3. 대비 향상 (어두운 환경 대비)
    """

    # bytes → numpy 배열 → OpenCV 이미지
    img_array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("이미지를 읽을 수 없습니다. 올바른 이미지 파일인지 확인해주세요.")

    # 1. 리사이즈
    h, w = img.shape[:2]
    if max(h, w) > 1024:
        scale = 1024 / max(h, w)
        img = cv2.resize(img, (int(w * scale), int(h * scale)))

    # 2. 샤프닝 (포장지 텍스트 선명하게)
    kernel = np.array([[0, -1, 0],
                       [-1,  5, -1],
                       [0, -1, 0]])
    img = cv2.filter2D(img, -1, kernel)

    # 3. 대비 향상 (어두운 환경에서 찍어도 잘 인식되게)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

    # OpenCV 이미지 → base64 문자열로 변환 (Claude API 전송용)
    _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    image_b64 = base64.b64encode(buffer).decode('utf-8')

    return image_b64