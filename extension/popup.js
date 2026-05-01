const statusEl = document.getElementById("status");
const endpointUrlEl = document.getElementById("endpointUrl");
const endpointTokenEl = document.getElementById("endpointToken");
const autoSendEl = document.getElementById("autoSend");
const snapshotOutputEl = document.getElementById("snapshotOutput");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b00020" : "#222";
}

function sendMessage(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

async function refreshStatus() {
  const result = await sendMessage({ type: "GET_STATUS" });
  if (!result?.ok) {
    setStatus(`Erro: ${result?.error || "falha ao obter status"}`, true);
    return;
  }
  endpointUrlEl.value = result.settings.endpointUrl || "";
  endpointTokenEl.value = result.settings.endpointToken || "";
  autoSendEl.checked = !!result.settings.autoSend;
  setStatus(`Aba ${result.tabId || "-"} | Eventos capturados: ${result.eventCount}`);
}

async function saveSettings() {
  const payload = {
    endpointUrl: endpointUrlEl.value.trim(),
    endpointToken: endpointTokenEl.value.trim(),
    autoSend: autoSendEl.checked
  };
  const result = await sendMessage({ type: "SAVE_SETTINGS", payload });
  if (!result?.ok) {
    setStatus(`Erro ao salvar: ${result?.error || "desconhecido"}`, true);
    return;
  }
  setStatus("Configuração salva");
}

function renderSnapshot(snapshot) {
  snapshotOutputEl.value = JSON.stringify(snapshot, null, 2);
}

async function createSnapshotNow() {
  const result = await sendMessage({ type: "CREATE_SNAPSHOT_FOR_ACTIVE_TAB" });
  if (!result?.ok) {
    setStatus(`Erro ao criar snapshot: ${result?.error || "desconhecido"}`, true);
    return;
  }
  renderSnapshot(result.snapshot);
  setStatus(`Snapshot criado: ${result.snapshot.id}`);
  await refreshStatus();
}

async function sendLastSnapshot() {
  const result = await sendMessage({ type: "SEND_LAST_SNAPSHOT_FOR_ACTIVE_TAB" });
  if (!result?.ok) {
    setStatus(`Erro ao enviar: ${result?.error || "desconhecido"}`, true);
    return;
  }
  const sent = result.delivery?.sent;
  if (sent) {
    setStatus(`Snapshot enviado: ${result.snapshotId}`);
  } else {
    setStatus(`Falha ao enviar: ${result.delivery?.reason || result.delivery?.status || "erro"}`, true);
  }
}

document.getElementById("saveSettings").addEventListener("click", saveSettings);
document.getElementById("createSnapshot").addEventListener("click", createSnapshotNow);
document.getElementById("sendLast").addEventListener("click", sendLastSnapshot);

refreshStatus();
