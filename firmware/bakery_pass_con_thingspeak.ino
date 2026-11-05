// Bakery Pass - VERSIÓN CON THINGSPEAK (misma lógica de la versión de prueba)

#include <ESP8266WiFi.h>
#include <ThingSpeak.h>

// --- Configuración de Red y ThingSpeak ---
const char *ssid = "Biblio_Sanjo";
const char *password = "SanJosei27";

unsigned long numeroCanal = 3535830;
const char *WriteAPIKey = "JAR1A6PNFTSASQBZ";

WiFiClient clienteWiFi;

// --- Parámetros ajustables ---
const int AFORO_MAXIMO = 5;
const unsigned long PIR_CALENTAMIENTO = 30000; // para la versión final conviene 60000
const unsigned long PIR_LIBRE_MIN = 5000;      // el PIR debe estar en LOW 5 s antes de aceptar otra entrada
const unsigned long INFORME_CADA = 5000;       // línea de estado cada 5 s
const unsigned long ENVIO_MINIMO = 16000;      // ThingSpeak gratis: mínimo 15 s entre envíos
const unsigned long ENVIO_LATIDO = 60000;      // si no hay cambios, igual envía cada 60 s

// --- Pines ---
const int trigPin = D2;
const int echoPin = D1;
const int pirPin = D7;
const int ledPin = D5;
const int buzzerPin = D8;

// --- Variables del sistema de aforo ---
int personasDentro = 0;
int totalEntradas = 0;
int totalSalidas = 0;
int estadoAlarma = 0;
int estadoMovimiento = 0;
int totalAlarmas = 0;     // <<< NUEVO: veces que se activó la alarma
int totalMovimientos = 0; // <<< NUEVO: veces que el PIR detectó movimiento

// --- Auxiliares PIR (entrada) ---
int ultimoEstadoPIR = LOW;
unsigned long pirBajoDesde = 0;

// --- Auxiliares ultrasónico (salida) ---
bool objetoSalida = false;
int confirmacionesSalida = 0;
float ultimaDistancia = 0;

// --- Auxiliares alarma (sin delay) ---
bool alarmaDisparada = false;
bool alarmaEncendida = false;
int contadorAvisos = 0;
unsigned long ultimoCambioAlarma = 0;

unsigned long ultimoInforme = 0;

// --- Auxiliares envío a ThingSpeak ---
unsigned long ultimoTiempoEnvio = 0;
int enviadoEntradas = -1;
int enviadoSalidas = -1;
int enviadoAlarmas = -1;
int enviadoMovimientos = -1;

void setup()
{
  Serial.begin(115200);
  delay(10);

  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(pirPin, INPUT);
  pinMode(ledPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  digitalWrite(ledPin, LOW);
  digitalWrite(buzzerPin, LOW);

  conectarWiFi();
  ThingSpeak.begin(clienteWiFi);

  Serial.println();
  Serial.println("=== Bakery Pass: CON THINGSPEAK ===");
  Serial.println("PIR = Entrada | Ultrasonico = Salida | 'r' = reiniciar contadores");
  Serial.print("Calentando PIR (");
  Serial.print(PIR_CALENTAMIENTO / 1000);
  Serial.println(" s): las entradas se ignoran hasta entonces...");
}

void loop()
{
  unsigned long ahora = millis();

  // --- Comando por Serie: "r" reinicia contadores ---
  if (Serial.available())
  {
    char c = Serial.read();
    if (c == 'r' || c == 'R')
    {
      personasDentro = 0;
      totalEntradas = 0;
      totalSalidas = 0;
      totalMovimientos = 0; // <<< NUEVO
      totalAlarmas = 0;     // <<< NUEVO
      Serial.println("[RESET] Contadores en cero.");
    }
  }

  // --- 1. ENTRADA (PIR) ---
  int pir = digitalRead(pirPin);
  estadoMovimiento = pir;

  if (pir == LOW && ultimoEstadoPIR == HIGH)
  {
    pirBajoDesde = ahora;
    Serial.println("[PIR] bajo (sin movimiento)");
  }

  if (pir == HIGH && ultimoEstadoPIR == LOW)
  {
    if (ahora >= PIR_CALENTAMIENTO)
    {                                               // <<< NUEVO (4 líneas)
      totalMovimientos++;                           // <<< NUEVO
      Serial.print("[PIR] movimiento detectado #"); // <<< NUEVO
      Serial.println(totalMovimientos);             // <<< NUEVO
    } // <<< NUEVO
    if (ahora < PIR_CALENTAMIENTO)
    {
      Serial.println("[PIR] subida IGNORADA: calentamiento");
    }
    else if ((ahora - pirBajoDesde) < PIR_LIBRE_MIN)
    {
      Serial.print("[PIR] subida IGNORADA: solo estuvo libre ");
      Serial.print(ahora - pirBajoDesde);
      Serial.println(" ms");
    }
    else
    {
      totalEntradas++;
      personasDentro++;
      Serial.print("[FLUJO] ENTRADA (PIR) | Personas dentro: ");
      Serial.println(personasDentro);
    }
  }
  ultimoEstadoPIR = pir;

  // --- 2. SALIDA (Ultrasónico) ---
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);

  long duration = pulseIn(echoPin, HIGH, 30000);
  float distance = duration * 0.034 / 2;
  ultimaDistancia = (duration > 0) ? distance : -1;
  bool hayObjeto = (duration > 0 && distance > 2 && distance < 30);

  if (hayObjeto)
  {
    if (confirmacionesSalida < 2)
      confirmacionesSalida++;
    if (confirmacionesSalida >= 2 && !objetoSalida)
    {
      objetoSalida = true;
      if (personasDentro > 0)
      {
        totalSalidas++;
        personasDentro--;
        Serial.print("[FLUJO] SALIDA (Ultrasonico) | Personas dentro: ");
        Serial.println(personasDentro);
      }
      else
      {
        Serial.println("[ULTRA] objeto detectado, pero no hay nadie dentro (no resta)");
      }
    }
  }
  else
  {
    confirmacionesSalida = 0;
    objetoSalida = false;
  }

  // --- 3. ALARMA (LED + buzzer, 6 avisos, sin bloquear el loop) ---
  if (personasDentro >= AFORO_MAXIMO)
  {
    if (estadoAlarma == 0)
    {                                          // <<< NUEVO (5 líneas)
      totalAlarmas++;                          // nueva activación                 // <<< NUEVO
      Serial.print("[ALERTA] Alarma numero "); // <<< NUEVO
      Serial.println(totalAlarmas);            // <<< NUEVO
    } // <<< NUEVO
    estadoAlarma = 1;

    if (!alarmaDisparada)
    {
      unsigned long duracion = alarmaEncendida ? 300 : 200;
      if (ahora - ultimoCambioAlarma >= duracion)
      {
        ultimoCambioAlarma = ahora;
        if (alarmaEncendida)
        {
          digitalWrite(ledPin, LOW);
          digitalWrite(buzzerPin, LOW);
          alarmaEncendida = false;
          contadorAvisos++;
          if (contadorAvisos >= 6)
            alarmaDisparada = true;
        }
        else
        {
          digitalWrite(ledPin, HIGH);
          digitalWrite(buzzerPin, HIGH);
          alarmaEncendida = true;
          Serial.println("[ALERTA] Limite de personas superado. Alarma activada.");
        }
      }
    }
  }
  else
  {
    estadoAlarma = 0;
    digitalWrite(ledPin, LOW);
    digitalWrite(buzzerPin, LOW);
    alarmaEncendida = false;
    alarmaDisparada = false;
    contadorAvisos = 0;
  }

  // --- 4. INFORME DE ESTADO por Monitor Serie ---
  if (ahora - ultimoInforme >= INFORME_CADA)
  {
    ultimoInforme = ahora;
    Serial.print("[ESTADO] dentro=");
    Serial.print(personasDentro);
    Serial.print(" | entradas=");
    Serial.print(totalEntradas);
    Serial.print(" | salidas=");
    Serial.print(totalSalidas);
    Serial.print(" | alarma=");
    Serial.print(estadoAlarma);
    Serial.print(" | totalAlarmas="); // <<< NUEVO
    Serial.print(totalAlarmas);       // <<< NUEVO
    Serial.print(" | pir=");
    Serial.print(estadoMovimiento);
    Serial.print(" | totalPIR=");   // <<< NUEVO
    Serial.print(totalMovimientos); // <<< NUEVO
    Serial.print(" | dist=");
    if (ultimaDistancia < 0)
      Serial.println("sin eco");
    else
    {
      Serial.print(ultimaDistancia);
      Serial.println(" cm");
    }
  }

  // --- 5. ENVÍO A THINGSPEAK ---
  // Envía cuando hay cambios (máximo 1 cada 16 s) o como latido cada 60 s.
  bool cambio = (totalEntradas != enviadoEntradas) ||
                (totalSalidas != enviadoSalidas) ||
                (totalAlarmas != enviadoAlarmas) ||
                (totalMovimientos != enviadoMovimientos);
  unsigned long desdeUltimoEnvio = ahora - ultimoTiempoEnvio;

  if (WiFi.status() == WL_CONNECTED &&
      desdeUltimoEnvio >= ENVIO_MINIMO &&
      (cambio || desdeUltimoEnvio >= ENVIO_LATIDO))
  {

    ultimoTiempoEnvio = millis();

    ThingSpeak.setField(1, personasDentro);
    ThingSpeak.setField(2, totalEntradas);
    ThingSpeak.setField(3, totalSalidas);
    ThingSpeak.setField(4, estadoAlarma);
    ThingSpeak.setField(5, estadoMovimiento);
    ThingSpeak.setField(6, totalAlarmas);
    ThingSpeak.setField(7, totalMovimientos);

    Serial.println("Enviando datos a ThingSpeak...");
    int codigoRespuesta = ThingSpeak.writeFields(numeroCanal, WriteAPIKey);

    if (codigoRespuesta == 200)
    {
      enviadoEntradas = totalEntradas;
      enviadoSalidas = totalSalidas;
      enviadoAlarmas = totalAlarmas;
      enviadoMovimientos = totalMovimientos;
      Serial.println("Canal actualizado (HTTP 200)");
    }
    else
    {
      Serial.print("Error al actualizar canal. Codigo HTTP: ");
      Serial.println(codigoRespuesta);
    }
    Serial.println("----------------------------------------");
  }

  delay(60); // el HC-SR04 recomienda al menos 60 ms entre mediciones
}

// --- Conexión WiFi ---
void conectarWiFi()
{
  Serial.println();
  Serial.print("Conectando a la red de 2.4GHz: ");
  Serial.println(ssid);

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
    intentos++;
    if (intentos > 30)
    {
      Serial.println("\nReintentando conexion WiFi...");
      WiFi.begin(ssid, password);
      intentos = 0;
    }
  }

  Serial.println("\nWiFi conectado con exito!");
  Serial.print("Direccion IP asignada: ");
  Serial.println(WiFi.localIP());
}
