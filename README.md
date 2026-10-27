# 🥐 BAKERY-PASS IoT

> **Sistema Inteligente de Control de Aforo y Telemetría Industrial en Tiempo Real**  
> Diseñado para áreas de trabajo restringidas, cuadras de producción y salones comerciales de panaderías y obradores artesanales.

## 📌 Descripción del Proyecto

**BAKERY-PASS IoT** es una solución integral de hardware embebido, telemetría en la nube y visualización web diseñada para resolver el control de capacidad y la seguridad operativa en entornos alimentarios y comerciales.

El sistema implementa una arquitectura basada en el microcontrolador **NodeMCU (ESP8266)** conectada a un esquema de **fusión sensorial (Sensor Infrarrojo de Obstáculos + PIR)** para lograr un conteo bidireccional preciso de ingresos y egresos. Ante situaciones de sobrecupo, dispara de forma autónoma alertas físicas locales (indicadores LED de estado y señal acústica por buzzer piezoeléctrico), sincronizando simultáneamente cada evento con la plataforma de analítica en la nube **ThingSpeak** y con el panel operativo web local.

---

## 🎯 Casos de Uso y Beneficios Operativos

Más allá de prevenir el sobrecupo en el área comercial, **BAKERY-PASS IoT** aporta valor estratégico directo al negocio y la fábrica:

1. 🦺 **Seguridad e Higiene Industrial**:
   - Garantiza el estricto cumplimiento de normativas de capacidad y distanciamiento en zonas críticas de manufactura como la **cuadra de amasado**, zonas de **cámaras de fermentación** y el **área de hornos**.
   - Evita la aglomeración de personal en áreas con alto riesgo térmico o maquinaria pesada en movimiento.

2. 📈 **Análisis de Flujo y Horarios Pico**:
   - Registra patrones continuos de circulación vehicular y peatonal a lo largo de los turnos de trabajo.
   - Brinda información clave para planificar los cronogramas de horneado, turnos del equipo de ventas y reposición oportuna de mercadería en mostrador.

3. 🔍 **Auditoría y Estadísticas Remotas**:
   - Permite a encargados, supervisores y bromatología inspeccionar de forma remota y en cualquier momento el historial de aforo.
   - Facilita la auditoría forense ante excesos de capacidad o incidentes, correlacionando horas exactas con timestamps seguros.

---

## 🏗️ Arquitectura del Sistema

```
 ┌────────────────────────────────────────────────────────┐
 │                   ZONA DE ENTRADA / PASILLO            │
 │                                                        │
 │   [ Sensor IR Obstáculos ]  +  [ Sensor PIR Presencia ]│
 └─────────────────────────┬──────────────────────────────┘
                           │ Señales GPIO (Fusión Sensorial)
                           ▼
 ┌────────────────────────────────────────────────────────┐
 │                 CONTROLADOR LOCAL (ESP8266)            │
 │                                                        │
 │   • Algoritmo Antirrebote (millis() debounce)          │
 │   • Control Lógico de Aforo (Current vs Max PAX)       │
 │   • Conexión Wi-Fi 802.11 b/g/n (Modo Estación)        │
 └─────────────┬───────────────────────────┬──────────────┘
               │                           │
  [Salidas Locales]                        │ [Telemetría Wi-Fi]
  ┌────────────┴─────────────┐             ├──────────────────────────┐
  │                          │             │                          │
  ▼                          ▼             ▼                          ▼
[LED Indicador]        [Buzzer Activo] [ThingSpeak Cloud]     [Web Dashboard]
(Verde: Acceso libre   (Alarma sonora  (Almacenamiento serie   (Panel SPA local:
 Rojo: Bloqueo/Aforo)   al superar max) temporal + análisis)    Tailwind + JS)
```

---

## 🔌 Conexiones de Hardware (Pinout ESP8266)

| Dispositivo / Sensor           | Pin NodeMCU    | Función Hardware                     | Modo Operativo       |
| :----------------------------- | :------------- | :----------------------------------- | :------------------- |
| **Sensor IR Obstáculos**       | `D6` (GPIO 12) | Detección de corte de haz óptico     | Salida Digital       |
| **Sensor PIR**                 | `D7` (GPIO 13) | Validación direccional de movimiento | Entrada Digital      |
| **LED Indicador (Verde/Rojo)** | `D2` (GPIO 4)  | Notificación visual de aforo         | Indicador Digital    |
| **Buzzer Piezoeléctrico**      | `D5` (GPIO 14) | Alarma sonora por sobrecupo          | Salida PWM / Digital |

## 📂 Estructura del Repositorio

```text
BAKERY-PASS-IoT/
├── README.md                 # Documentación técnica principal del proyecto
├── firmware/
│   └── bakery_pass.ino       # Código fuente C++ para NodeMCU ESP8266
├── web-app/
│   ├── index.html            # Dashboard SPA operativo con Tailwind CSS
│   ├── app.js                # Lógica de simulación, conexión y gráficas en vivo
│   └── assets/               # Recursos visuales y esquemáticos
└── analytics/
    └── notebooks/
        └── analisis_aforo.ipynb  # Notebook Colab para ciencia de datos y patrones
``

## 👥 Equipo de Desarrollo

* **Desarrollador / Integrador IoT**: [Tu Nombre / Usuario de GitHub]
* **Institución / Asignatura**: Proyecto Integrador de IoT y Sistemas Embebidos

---

## 📄 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE). Siéntete libre de utilizarlo, modificarlo y adaptarlo a tus necesidades industriales o académicas.
```
