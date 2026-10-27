/*
  Bakery Pass IoT Web
  - Lee datos desde ThingSpeak (GET) cada 15 s (límite del plan gratuito)
  - Muestra métricas + tabla de últimas lecturas
  - Exporta CSV y genera el código para abrirlo en Google Colab
  - (Opcional) Envía comando al actuador escribiendo un field en ThingSpeak
*/

const CONFIG = {
    channelId: 3535830,
    readApiKey: "JAR1A6PNFTSASQBZ",   // dejalo "" si el canal es público
    writeApiKey: "ZC1CJRUUY9RZGQ0C",                  // solo si querés controlar el actuador desde la web
    controlField: "field6",           // field que lee tu ESP8266 para prender/apagar la alarma

    updatesEveryMs: 15000,            // ThingSpeak gratis actualiza como mucho cada 15 s
    tableRows: 30,                    // filas en la tabla
    colabRows: 8000,                  // máximo de filas que ThingSpeak entrega por pedido

    // Orden de fields tal cual los envía el Arduino (ThingSpeak.setField 1..5)
    fields: {
        personasDentro: "field1",
        totalEntradas: "field2",
        totalSalidas: "field3",
        estadoAlarma: "field4",
        estadoMovimiento: "field5",
    },
    aforoMaximo: 15, // mismo límite que el Arduino
};

let liveEnabled = false;
let pollTimer = null;
let busy = false;
let recentData = []; // más reciente primero

const $ = (id) => document.getElementById(id);

/* ---------- Utilidades ---------- */

function setLiveUI(enabled) {
    const pill = $("liveStatus");
    pill.textContent = enabled ? "● LIVE ON" : "● LIVE OFF";
    pill.style.color = enabled ? "var(--good)" : "var(--muted)";
}

function formatValue(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    return Number.isNaN(n) ? String(v) : n.toString();
}

const pad = (n) => String(n).padStart(2, "0");

// ThingSpeak entrega created_at en UTC ("2026-10-27T14:03:12Z"); lo pasamos a hora local
function splitDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { fechaHora: "—", fecha: "—", horario: "—" };
    const fecha = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const h = d.getHours();
    const franja = h < 12 ? "Mañana" : h < 20 ? "Tarde" : "Noche";
    return {
        fechaHora: `${fecha} ${hora}`,
        fecha,
        horario: `${franja} (${pad(h)}:${pad(d.getMinutes())})`,
    };
}

function isAlarmOn(v) {
    const s = String(v).toLowerCase();
    return s === "1" || s === "true";
}

/* ---------- ThingSpeak ---------- */

function tsUrl(path, params = {}) {
    const q = new URLSearchParams(params);
    if (CONFIG.readApiKey && CONFIG.readApiKey.trim()) q.set("api_key", CONFIG.readApiKey.trim());
    return `https://api.thingspeak.com/channels/${CONFIG.channelId}/${path}?${q.toString()}`;
}

function parseEntry(entry) {
    const f = CONFIG.fields;
    const dt = splitDate(entry.created_at);
    return {
        entry_id: entry.entry_id,
        created_at: dt.fechaHora,
        fecha: dt.fecha,
        horario: dt.horario,
        personasDentro: entry[f.personasDentro] ?? null,
        totalEntradas: entry[f.totalEntradas] ?? null,
        totalSalidas: entry[f.totalSalidas] ?? null,
        estadoAlarma: entry[f.estadoAlarma] ?? null,
        estadoMovimiento: entry[f.estadoMovimiento] ?? null,
    };
}

async function fetchFeeds(n) {
    const res = await fetch(tsUrl("feeds.json", { results: n }));
    if (!res.ok) throw new Error(`ThingSpeak HTTP ${res.status}`);
    const json = await res.json();
    // ThingSpeak los devuelve del más viejo al más nuevo → invertimos
    return (json.feeds || []).map(parseEntry).reverse();
}

/* ---------- Render ---------- */

function updateMetrics(latest) {
    $("metricIn").textContent = formatValue(latest?.totalEntradas);
    $("metricOut").textContent = formatValue(latest?.totalSalidas);
    $("metricCurrent").textContent = formatValue(latest?.personasDentro);
    $("metricLimit").textContent = String(CONFIG.aforoMaximo);
    // Personas dentro en rojo cuando la alarma está activa
    $("metricCurrent").style.color = isAlarmOn(latest?.estadoAlarma) ? "#e5484d" : "";
}

function renderRecentTable() {
    const tbody = $("recentRows");
    tbody.innerHTML = "";

    recentData.slice(0, CONFIG.tableRows).forEach((r) => {
        const tr = document.createElement("tr");
        const cells = [
            r.created_at,
            formatValue(r.totalEntradas),
            formatValue(r.totalSalidas),
            formatValue(r.personasDentro),
            isAlarmOn(r.estadoAlarma) ? "🚨 ON" : "✅ OFF",
        ];
        cells.forEach((text) => {
            const td = document.createElement("td");
            td.textContent = text;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

/* ---------- Polling ---------- */

async function pollLoopTick() {
    if (!liveEnabled || busy) return;
    busy = true;
    try {
        // Pedimos las últimas N lecturas completas: sin duplicados y la tabla se llena al instante
        recentData = await fetchFeeds(CONFIG.tableRows);
        updateMetrics(recentData[0]);
        renderRecentTable();
        $("lastUpdate").textContent = `Última actualización: ${new Date().toLocaleString()}`;
    } catch (err) {
        console.error(err);
        $("lastUpdate").textContent = `Error al actualizar: ${err.message}`;
    } finally {
        busy = false;
    }
}

function startLive() {
    if (liveEnabled) return;
    liveEnabled = true;
    setLiveUI(true);
    pollLoopTick();
    pollTimer = setInterval(pollLoopTick, CONFIG.updatesEveryMs);
}

function stopLive() {
    liveEnabled = false;
    setLiveUI(false);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

/* ---------- Actuador (vía ThingSpeak) ---------- */
// El navegador escribe en un field de ThingSpeak y el ESP8266 lo lee en su loop().
async function controlActuator(alarmOn) {
    if (!CONFIG.writeApiKey) {
        throw new Error("Falta CONFIG.writeApiKey (y que el ESP lea " + CONFIG.controlField + ")");
    }
    $("actResult").textContent = "Enviando comando...";
    const q = new URLSearchParams({
        api_key: CONFIG.writeApiKey,
        [CONFIG.controlField]: alarmOn ? "1" : "0",
    });
    const res = await fetch(`https://api.thingspeak.com/update?${q.toString()}`);
    const entryId = await res.text(); // devuelve "0" si falló (por ejemplo, <15 s desde el último update)
    if (!res.ok || entryId === "0") {
        throw new Error("ThingSpeak rechazó el update (esperá 15 s entre envíos)");
    }
    return { ok: true, entryId };
}

/* ---------- Exportación ---------- */

function csvEscape(v) {
    return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

// Mismo formato que tu PDF: Fecha_Hora, Fecha, Horario + variables
function jsonToCsv(rows) {
    const header = ["Fecha_Hora", "Fecha", "Horario", "personasDentro", "totalEntradas", "totalSalidas", "estadoAlarma", "estadoMovimiento"];
    const lines = [header.join(",")];
    rows.forEach((r) => {
        lines.push(
            [r.created_at, r.fecha, r.horario, r.personasDentro, r.totalEntradas, r.totalSalidas, r.estadoAlarma, r.estadoMovimiento]
                .map(csvEscape)
                .join(",")
        );
    });
    return lines.join("\n");
}

function downloadTextFile(filename, text) {
    // \ufeff = BOM, para que Excel/Colab respeten tildes (Mañana)
    const blob = new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

async function exportToColabHelp() {
    // ThingSpeak ya ofrece CSV directo: Colab puede leerlo sin subir ningún archivo
    const csvUrl = tsUrl("feeds.csv", { results: CONFIG.colabRows });
    const code =
`import pandas as pd

url = "${csvUrl}"
df = pd.read_csv(url).iloc[:, :7]
df.columns = ["created_at", "entry_id", "personasDentro", "totalEntradas", "totalSalidas", "estadoAlarma", "estadoMovimiento"]
df["created_at"] = pd.to_datetime(df["created_at"]).dt.tz_convert("America/Argentina/Buenos_Aires")

# Entradas y salidas por intervalo (los totales se reinician si el ESP se reinicia)
df["entradas_intervalo"] = df["totalEntradas"].diff().clip(lower=0)
df["salidas_intervalo"] = df["totalSalidas"].diff().clip(lower=0)
df.head()`;

    try { await navigator.clipboard.writeText(code); } catch (_) { /* sin portapapeles */ }

    alert(
`✅ Export a Google Colab

Opción A (automática): copié este código al portapapeles. Pegalo en una celda de Colab y ejecutalo:

${code}

Opción B (manual): tocá "Descargar CSV", subí el archivo a Colab y usá pd.read_csv("archivo.csv").`
    );
}

/* ---------- Eventos UI ---------- */

$("btnStartLive").addEventListener("click", startLive);
$("btnStopLive").addEventListener("click", stopLive);

$("btnActOn").addEventListener("click", async () => {
    try {
        await controlActuator(true);
        $("actResult").textContent = "Estado del actuador: ✅ ON (comando enviado)";
    } catch (e) {
        console.error(e);
        $("actResult").textContent = `Error control: ${e.message}`;
    }
});

$("btnActOff").addEventListener("click", async () => {
    try {
        await controlActuator(false);
        $("actResult").textContent = "Estado del actuador: ⛔ OFF (comando enviado)";
    } catch (e) {
        console.error(e);
        $("actResult").textContent = `Error control: ${e.message}`;
    }
});

$("btnDownloadCsv").addEventListener("click", async () => {
    try {
        // Histórico completo (hasta 8000 lecturas), de la más vieja a la más nueva
        const all = (await fetchFeeds(CONFIG.colabRows)).reverse();
        const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
        downloadTextFile(`bakery-pass-readings-${stamp}.csv`, jsonToCsv(all));
    } catch (e) {
        console.error(e);
        alert(`No se pudo descargar: ${e.message}`);
    }
});

$("btnExportToColab").addEventListener("click", exportToColabHelp);

/* ---------- Inicio ---------- */
setLiveUI(false);
startLive(); // arranca solo; el botón STOP lo pausa