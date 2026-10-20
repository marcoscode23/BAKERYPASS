/* 
  Bakery Pass IoT Web
  - Lee datos desde ThingSpeak (GET)
  - Controla actuador mediante endpoint propio (POST)
  
  ✅ Ajustá las constantes al final según tu caso real.
*/

const API_CONFIG = {
    // --- ThingSpeak READ ---
    // Recomendado: usar la lectura sin API key si tus reglas lo permiten.
    // Si querés usar READ_API_KEY, activamos el header/query según soporte.
    thingSpeak: {
        channelId: 3488112,           // TODO: poné tu CHANNEL_ID
        readApiKey: "5N8CMR7E1LYXC68B",         // TODO: si tu canal requiere key para leer
        // max 1 request por X segundos para no saturar
        updatesEveryMs: 5000,
        // Qué campos usa tu firmware en ThingSpeak:
        // Ajustar a tus Field1..Field8 reales
        fields: {
            in: "field1",
            out: "field2",
            current: "field3",
            limit: "field4",
            alarm: "field5",
            // Opcional: timestamp ya viene como "created_at"
        }
    },

    // --- Control Actuador / Webhook ---
    // Este endpoint debe existir en tu backend o ser un proxy que llame a NodeMCU.
    // Ejemplo típico:
    // POST http://TU_SERVER/control
    // body: { alarmOn: true }
    control: {
        // TODO: Reemplazá por tu endpoint real:
        endpointUrl: "http://127.0.0.1:5500/web-app/",
        // Si tu backend requiere token, ponelo aquí:
        // authToken: "..."
    },

    export: {
        recentLimit: 30
    }
};

// Estado en vivo
let liveEnabled = false;
let pollTimer = null;
let recentData = []; // Array de objetos {created_at, in, out, current, limit, alarm}

// Helpers
const $ = (id) => document.getElementById(id);

function setLiveUI(enabled) {
    const pill = $("liveStatus");
    if (enabled) {
        pill.textContent = "● LIVE ON";
        pill.style.color = "var(--good)";
    } else {
        pill.textContent = "● LIVE OFF";
        pill.style.color = "var(--muted)";
    }
}

function formatValue(v) {
    if (v === null || v === undefined || v === "") return "—";
    const n = Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toString();
}

function safeParseThingSpeakEntry(entry) {
    // ThingSpeak feed JSON suele traer:
    // entry.field1, entry.field2...
    // y entry.created_at
    const createdAt = entry?.created_at ? String(entry.created_at) : "—";

    return {
        created_at: createdAt,
        in: entry?.[API_CONFIG.thingSpeak.fields.in] ?? entry?.field1 ?? null,
        out: entry?.[API_CONFIG.thingSpeak.fields.out] ?? entry?.field2 ?? null,
        current: entry?.[API_CONFIG.thingSpeak.fields.current] ?? entry?.field3 ?? null,
        limit: entry?.[API_CONFIG.thingSpeak.fields.limit] ?? entry?.field4 ?? null,
        alarm: entry?.[API_CONFIG.thingSpeak.fields.alarm] ?? entry?.field5 ?? null,
    };
}

function updateMetrics(latest) {
    $("metricIn").textContent = formatValue(latest?.in);
    $("metricOut").textContent = formatValue(latest?.out);
    $("metricCurrent").textContent = formatValue(latest?.current);
    $("metricLimit").textContent = formatValue(latest?.limit);
}

function renderRecentTable() {
    const tbody = $("recentRows");
    tbody.innerHTML = "";

    const rows = [...recentData].slice(0, API_CONFIG.export.recentLimit);
    rows.forEach((r) => {
        const tr = document.createElement("tr");

        const alarmBool = String(r.alarm);
        const alarmOn = alarmBool === "1" || alarmBool.toLowerCase?.() === "true";

        tr.innerHTML = `
      <td>${r.created_at ?? "—"}</td>
      <td>${formatValue(r.in)}</td>
      <td>${formatValue(r.out)}</td>
      <td>${formatValue(r.current)}</td>
      <td>${alarmOn ? "✅ ON" : "⛔ OFF"}</td>
    `;
        tbody.appendChild(tr);
    });
}

function buildThingSpeakUrl() {
    // Feed JSON muestra últimas entradas con feed/last.json (1 item)
    // Usamos GET /feeds/last.json para “casi tiempo real”.
    const { channelId, readApiKey } = API_CONFIG.thingSpeak;
    if (!channelId || channelId === 0) {
        // Si no seteaste channelId, devolvemos vacío.
        return "";
    }

    let url = `https://api.thingspeak.com/channels/${channelId}/feeds/last.json?`;
    // ThingSpeak cuando se usa last.json:
    // Si requiere key: incluye &api_key=READ_KEY
    if (readApiKey && readApiKey.trim().length > 0) {
        url += `api_key=${encodeURIComponent(readApiKey)}`;
    } else {
        url = url.replace("?&", "?"); // simple
        // Si no key, se deja sin api_key
        url = `https://api.thingspeak.com/channels/${channelId}/feeds/last.json`;
    }
    return url;
}

async function fetchLatest() {
    const url = buildThingSpeakUrl();
    if (!url) return null;

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`ThingSpeak HTTP ${res.status}`);
    const json = await res.json();
    // json es una entrada (no array)
    const parsed = safeParseThingSpeakEntry(json);
    return parsed;
}

async function pollLoopTick() {
    if (!liveEnabled) return;

    try {
        const latest = await fetchLatest();
        if (!latest) return;

        // Insertamos al inicio para tabla ordenada por más reciente
        recentData.unshift(latest);
        // Limitar memoria
        recentData = recentData.slice(0, 200);

        updateMetrics(latest);
        renderRecentTable();

        $("lastUpdate").textContent = `Última actualización: ${new Date().toLocaleString()}`;
    } catch (err) {
        console.error(err);
        $("lastUpdate").textContent = `Error al actualizar: ${err.message}`;
    }
}

function startLive() {
    if (liveEnabled) return;
    liveEnabled = true;
    setLiveUI(true);

    // arranca inmediato
    pollLoopTick();
    pollTimer = setInterval(pollLoopTick, API_CONFIG.thingSpeak.updatesEveryMs);
}

function stopLive() {
    liveEnabled = false;
    setLiveUI(false);
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
}

async function controlActuator(alarmOn) {
    const resultEl = $("actResult");
    resultEl.textContent = "Enviando comando...";

    // Si NO tenés backend todavía: te va a fallar. Pero la UI ya está lista.
    // En ese caso, ajustá endpointUrl o lo conectamos con vuestro server/proxy.
    const payload = { alarmOn: !!alarmOn };

    const res = await fetch(API_CONFIG.control.endpointUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
            // "Authorization": `Bearer ${API_CONFIG.control.authToken}`
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Control HTTP ${res.status} ${txt}`);
    }
    return res.json().catch(() => ({ ok: true }));
}

function jsonToCsv(rows) {
    // rows: {created_at, in, out, current, limit, alarm}
    const header = ["created_at", "in", "out", "current", "limit", "alarm"];
    const lines = [header.join(",")];

    rows.forEach((r) => {
        const values = [
            r.created_at ?? "",
            r.in ?? "",
            r.out ?? "",
            r.current ?? "",
            r.limit ?? "",
            r.alarm ?? ""
        ].map(v => {
            const s = String(v);
            // escape CSV
            return `"${s.replace(/"/g, '""')}"`;
        });

        lines.push(values.join(","));
    });

    return lines.join("\n");
}

function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function exportToColabHelp() {
    // No podemos “subir” automático a tu Google Drive/Colab sin autenticación.
    // Pero te lo dejamos listo:
    // 1) Descarga CSV
    // 2) Pegá en Colab importándolo con pandas
    alert(
        `✅ Export a Colab (manual)
1) Tocá "Descargar CSV"
2) En Colab usá algo como:

import pandas as pd
df = pd.read_csv("tu_archivo.csv")
df.head()

Si querés, te preparo el notebook con lectura automática.`
    );
}

// Eventos UI
$("btnStartLive").addEventListener("click", () => startLive());
$("btnStopLive").addEventListener("click", () => stopLive());

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

$("btnDownloadCsv").addEventListener("click", () => {
    const rows = [...recentData].slice(0, API_CONFIG.export.recentLimit);
    const csv = jsonToCsv(rows);
    const filename = `bakery-pass-readings-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`;
    downloadTextFile(filename, csv);
});

$("btnExportToColab").addEventListener("click", () => {
    exportToColabHelp();
});

// Inicial
setLiveUI(false);
stopLive();