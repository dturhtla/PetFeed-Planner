#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "HX711.h"

// --- WiFi Configuration ---
const char* ssid = "Khant iPhone";         
const char* password = "Khantkoko18$"; 
const char* serverUrl = "https://preirrigational-concha-prealphabetically.ngrok-free.dev/api/v1/iot/weight"; 

// --- Pin Configuration ---
const int LOADCELL_DOUT_PIN = 18; 
const int LOADCELL_SCK_PIN = 19;  
const int TARE_BUTTON_PIN = 4; 

HX711 scale;
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// --- Pet Configuration ---
const int MY_PET_ID = 119;

// --- Timer Variables ---
unsigned long lastUploadTime = 0;
const unsigned long uploadInterval = 3600000; // 1 နာရီ (Milliseconds)

// --- Function to Send Data ---
void sendDataToServer(float weight) {
  if (WiFi.status() == WL_CONNECTED) {
    // အကယ်၍ အလေးချိန်က 0 အောက်ရောက်နေရင် Server error မတက်အောင် 0.0 သို့ ညှိပေးခြင်း
    float weightToSend = (weight < 0) ? 0.0 : weight;
    
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "true");

    String jsonData = "{\"feed_weight\":" + String(weightToSend, 1) + ",\"pet_id\":" + String(MY_PET_ID) + "}";
    
    Serial.println("\n--- Sending Data to Server ---");
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
  
  lcd.begin();
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