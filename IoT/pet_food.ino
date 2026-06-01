#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// --- WiFi Configuration ---
const char* ssid = "U+Net34F1";
const char* password = "1C12029744";
const char* weightUrl = "https://preirrigational-concha-prealphabetically.ngrok-free.dev/api/v1/iot/weight";
const char* activePetUrl = "https://preirrigational-concha-prealphabetically.ngrok-free.dev/api/v1/config/active-pet";

// --- Pin Configuration ---
const int LOADCELL_DOUT_PIN = 18; 
const int LOADCELL_SCK_PIN = 19;  
const int TARE_BUTTON_PIN = 4; 

HX711 scale;
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// --- Pet Configuration ---
int currentPetId = -1;

// --- Timer Variables ---
unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 60000;

int getActivePetId() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi Disconnected. Cannot get active pet_id.");
    return -1;
  }

  HTTPClient http;
  http.begin(activePetUrl);
  http.addHeader("ngrok-skip-browser-warning", "true");

  int httpResponseCode = http.GET();

  if (httpResponseCode > 0) {
    Serial.print("Active Pet GET Response Code: ");
    Serial.println(httpResponseCode);

    String payload = http.getString();
    Serial.print("Active Pet Payload: ");
    Serial.println(payload);

    if (httpResponseCode >= 200 && httpResponseCode < 300) {
      int index = payload.indexOf("pet_id");

      if (index >= 0) {
        int colonIndex = payload.indexOf(":", index);
        int commaIndex = payload.indexOf(",", colonIndex);

        if (commaIndex < 0) {
          commaIndex = payload.indexOf("}", colonIndex);
        }

        String petIdText = payload.substring(colonIndex + 1, commaIndex);
        petIdText.trim();

        http.end();
        return petIdText.toInt();
      }
    }
  } else {
    Serial.print("Active Pet GET Error: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }

  http.end();
  return -1;
}

// --- Function to Send Data ---
void sendDataToServer(float weight) {
  if (WiFi.status() == WL_CONNECTED) {
    // 음수 방지 + 소수점 제거
    int weightToSend = (weight < 0) ? 0 : (int)weight;

    //시리얼 모니터에 무게 표시
    Serial.println("\n --- Sending Data to server ---");
    Serial.print("Weight: ");
    Serial.print(weightToSend);
    Serial.println(" g");
      
    currentPetId = getActivePetId();

if (currentPetId <= 0) {
  Serial.println("No active pet_id. Data not sent.");
  return;
}

HTTPClient http;
http.begin(weightUrl);
http.addHeader("Content-Type", "application/json");
http.addHeader("ngrok-skip-browser-warning", "true");

String jsonData = "{\"feed_weight\":" + String(weightToSend) + ",\"pet_id\":" + String(currentPetId) + "}";
    
    Serial.print("Payload: ");
    Serial.println(jsonData);

    int httpResponseCode = http.POST(jsonData);

    if (httpResponseCode > 0) {
      Serial.print("HTTP Response Code: ");
      Serial.println(httpResponseCode);
      if (httpResponseCode >= 200 && httpResponseCode < 300) {
        Serial.println("Result: Success!");
      }
    } else {
      Serial.print("Error: ");
      Serial.println(http.errorToString(httpResponseCode).c_str());
    }
    http.end();
    Serial.println("------------------------------");
  } else {
    Serial.println("WiFi Disconnected. Cannot send data.");
  }
}

void setup() {
  Serial.begin(115200);
  
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("PetFeed Planner");
  lcd.setCursor(0, 1);
  lcd.print("Booting...");

  pinMode(TARE_BUTTON_PIN, INPUT_PULLUP);

  // WiFi ချိတ်ဆက်ခြင်း
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  // Scale ချိတ်ဆက်ခြင်း
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(344.4); 
  delay(1500); 
  scale.tare(); 
  
  lcd.clear();
  lcd.print("WiFi Connected!");
  delay(1000);
  lcd.clear();

  // --- အရေးကြီးသောအချက်: ပါဝါဖွင့်ပြီးချင်း ပထမဆုံးအကြိမ် Data ပို့ခြင်း ---
  if (scale.is_ready()) {
    float initial_weight = scale.get_units(5);
    sendDataToServer(initial_weight);
    lastUploadTime = millis(); // ပို့ပြီးမှ အချိန်ကို စတင်မှတ်သားပါမည်
  }
}

void loop() {
  // --- Zero Tare Button Logic ---
  if (digitalRead(TARE_BUTTON_PIN) == LOW) {
    Serial.println("\n[Manual Reset] Zeroing Scale...");
    lcd.setCursor(0, 1);
    lcd.print("Resetting Zero..");
    scale.tare(); 
    delay(500); 
    lcd.setCursor(0, 1);
    lcd.print("                ");
  }

  if (scale.is_ready()) {
    float current_weight = scale.get_units(5); 
    
    // Dead-zone filter (ငြိမ်နေအောင်)
    if (current_weight > -2.0 && current_weight < 2.0) {
      current_weight = 0.0;
    }

    int displayWeight = (int)current_weight;

    // --- LCD Display: အလေးချိန်တစ်ခုတည်းကိုပဲ ပြသခြင်း ---
    lcd.setCursor(0, 0);
    lcd.print("Pet Food Weight");
    
    lcd.setCursor(0, 1);
    lcd.print("Current: ");
    if (displayWeight < 100) lcd.print(" "); 
    if (displayWeight < 10)  lcd.print(" "); 
    lcd.print(displayWeight);
    lcd.print(" g      ");

    // --- ၁ နာရီပြည့်တိုင်း ပုံမှန် Data ပို့ခြင်း ---
    if (millis() - lastUploadTime >= uploadInterval) {
      sendDataToServer(current_weight);
      lastUploadTime = millis();
    }
  }
}