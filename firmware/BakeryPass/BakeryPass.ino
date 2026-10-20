#include <Arduino.h>
// --- 3. Definición de Pines y Hardware ---
const int trigPin = D2;   // Pin Trigger del sensor ultrasónico (GPIO 5)
const int echoPin = D1;   // Pin Echo del sensor ultrasónico (GPIO 4)
const int pirPin = D7;    // Pin del sensor de movimiento PIR (GPIO 13)
const int ledPin = D5;    // Pin del LED (GPIO 14)
const int buzzerPin = D8; // Pin del Buzzer (GPIO 15)

// --- Variables del Sistema de Aforo ---
int personasDentro = 0;
int totalEntradas = 0;
int totalSalidas = 0;
int estadoAlarma = 0;
int estadoMovimiento = 0;

// Variables auxiliares para control de flancos y rebotes
bool objetoDetectadoSalidaUltrasonico = false; // Control para el ultrasónico
int ultimoEstadoPIR = LOW;                     // Variable para detectar el cambio exacto del PIR
unsigned long ultimoTiempoEntradaPIR = 0;      // Control de tiempo para evitar rebotes del PIR
bool alarmaDisparada = false;
int contadorMensajesAlarma = 0;

void setup()
{
  Serial.begin(115200);
  delay(10);

  // Configuración de pines
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(pirPin, INPUT);
  pinMode(ledPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  // Asegurar que inician apagados
  digitalWrite(ledPin, LOW);
  digitalWrite(buzzerPin, LOW);

  Serial.println("Sistema Bakery Pass (PIR = Entrada, Ultrasónico = Salida) iniciado correctamente.");
}

void loop()
{
  // --- 1. LECTURA DE ENTRADA (Sensor de Movimiento PIR con detección de flanco) ---
  int movimientoPIR = digitalRead(pirPin);

  if (movimientoPIR == HIGH)
  {
    estadoMovimiento = 1;
  }
  else
  {
    estadoMovimiento = 0;
  }

  // Detectar el flanco de subida: SOLO cuando el PIR pasa de LOW a HIGH (nueva detección de entrada)
  if (movimientoPIR == HIGH && ultimoEstadoPIR == LOW)
  {
    // Control de tiempo (3 segundos) para evitar que sume múltiples entradas por una misma pasada
    if (millis() - ultimoTiempoEntradaPIR > 3000)
    {
      totalEntradas++;
      personasDentro++;
      ultimoTiempoEntradaPIR = millis();
      Serial.print("[FLUJO] ¡Persona detectada ENTRANDO (PIR)! | Personas dentro: ");
      Serial.println(personasDentro);
    }
  }
  ultimoEstadoPIR = movimientoPIR; // Guardamos el estado actual para la siguiente vuelta

  // --- 2. LECTURA DE SALIDA (Sensor Ultrasónico) ---
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH);
  float distance = duration * 0.034 / 2;

  // Si alguien pasa cerca del ultrasónico (entre 2cm y 15cm), cuenta como SALIDA (restando aforo)
  if (distance > 2 && distance < 30)
  {
    if (!objetoDetectadoSalidaUltrasonico && personasDentro > 0)
    {
      totalSalidas++;
      personasDentro--;
      objetoDetectadoSalidaUltrasonico = true;
      Serial.print("[FLUJO] ¡Persona detectada SALIENDO (Ultrasónico)! | Personas dentro: ");
      Serial.println(personasDentro);
    }
  }
  else
  {
    objetoDetectadoSalidaUltrasonico = false;
  }

  // --- 3. LÓGICA DE ALARMA, LED Y BUZZER SINCRONIZADOS (6 AVISOS) ---
  if (personasDentro >= 5)
  {
    estadoAlarma = 1;

    if (!alarmaDisparada)
    {
      if (contadorMensajesAlarma < 6)
      {
        // LED y Buzzer encienden y parpadean juntos exactamente
        digitalWrite(ledPin, HIGH);
        digitalWrite(buzzerPin, HIGH);
        Serial.println("[ALERTA] ¡Límite de 15 personas superado! Alarma activada.");
        contadorMensajesAlarma++;
        delay(300);

        digitalWrite(ledPin, LOW);
        digitalWrite(buzzerPin, LOW);
        delay(200);
      }
      else
      {
        // Ya dio los 6 avisos: se apagan por completo, bloqueando hasta que baje el aforo
        digitalWrite(ledPin, LOW);
        digitalWrite(buzzerPin, LOW);
        alarmaDisparada = true;
      }
    }
    else
    {
      digitalWrite(ledPin, LOW);
      digitalWrite(buzzerPin, LOW);
    }
  }
  else
  {
    // Si el aforo baja de 15 (gracias a las salidas por el ultrasónico), se resetea la alarma
    estadoAlarma = 0;
    digitalWrite(ledPin, LOW);
    digitalWrite(buzzerPin, LOW);
    alarmaDisparada = false;
    contadorMensajesAlarma = 0;
  }

  delay(150);
}