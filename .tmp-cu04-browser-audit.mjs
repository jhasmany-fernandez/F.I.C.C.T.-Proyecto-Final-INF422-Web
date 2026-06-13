import fs from "fs/promises";
import playwright from "/tmp/codex-playwright/node_modules/playwright/index.js";

const { chromium } = playwright;
const OUT_DIR = "/tmp/cu04-browser-audit";
await fs.mkdir(OUT_DIR, { recursive: true });

const BASE_API = "http://34.69.89.232:8787/api";
const BASE_WEB = "http://34.69.89.232:5656";

function fieldByLabel(page, text, tag = "input") {
  return page.locator(`label:has-text("${text}")`).locator(`xpath=following-sibling::${tag}`);
}

const loginResponse = await fetch(`${BASE_API}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@colegio.com", password: "12345678" }),
});
const loginData = await loginResponse.json();

const network = [];
const consoleMessages = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

page.on("console", (msg) => {
  consoleMessages.push({ type: msg.type(), text: msg.text() });
});

page.on("response", async (response) => {
  const url = response.url();
  if (!url.includes("/api/")) {
    return;
  }
  const request = response.request();
  let responseBody = null;
  try {
    responseBody = await response.json();
  } catch {
    try {
      responseBody = await response.text();
    } catch {
      responseBody = null;
    }
  }
  network.push({
    url,
    method: request.method(),
    status: response.status(),
    headers: {
      authorization: request.headers()["authorization"] ? "Bearer <token>" : undefined,
      contentType: request.headers()["content-type"],
    },
    requestPayload: request.postData() ? (() => {
      try {
        return JSON.parse(request.postData());
      } catch {
        return request.postData();
      }
    })() : null,
    response: responseBody,
  });
});

await page.addInitScript((login) => {
  localStorage.setItem("authToken", login.token.access);
  localStorage.setItem("refreshToken", login.token.refresh);
  localStorage.setItem("authUser", JSON.stringify(login.user));
}, loginData);

const screenshots = {};
async function shot(name) {
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  screenshots[name] = path;
}

const centersResponse = await fetch(`${BASE_API}/educational-centers/`, {
  headers: { Authorization: `Bearer ${loginData.token.access}` },
});
const centers = await centersResponse.json();

const devicesResponse = await fetch(`${BASE_API}/gps-devices/`, {
  headers: { Authorization: `Bearer ${loginData.token.access}` },
});
const devices = await devicesResponse.json();
const availableDevice = devices.find((device) => device.assignment_status === "disponible");

await page.goto(`${BASE_WEB}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Gestión de Niños Monitoreados");
await shot("01-main");

await page.locator('input[placeholder="Buscar por nombre, apellido o código"]').fill("María");
await page.locator("select").nth(1).selectOption("activo");
await page.click("text=Buscar");
await page.waitForLoadState("networkidle");
await shot("02-filters");

const filteredRow = page.locator("tbody tr").first();
await filteredRow.locator("button").nth(0).click();
await page.waitForSelector("text=Detalle del Niño");
await shot("03-detail");

await page.click("text=Nuevo Niño");
await page.waitForSelector("text=Registrar Nuevo Niño");
await shot("04-create-form");

await fieldByLabel(page, "Nombres *").fill("Frontend");
await fieldByLabel(page, "Apellidos *").fill("Auditoria CU04");
await fieldByLabel(page, "Fecha de nacimiento *").fill("2016-06-12");
await fieldByLabel(page, "Curso *").fill("5to Primaria");
await page.locator('label:has-text("Centro educativo *")').locator("xpath=following-sibling::select").selectOption(String(centers[0].id));
if (availableDevice) {
  await page.locator('label:has-text("Dispositivo GPS")').locator("xpath=following-sibling::select").selectOption(String(availableDevice.id));
}
await page.locator('label:has-text("Estado *")').locator("xpath=following-sibling::select").selectOption("activo");
await page.click("text=Guardar Niño");
await page.waitForLoadState("networkidle");

await page.locator('input[placeholder="Buscar por nombre, apellido o código"]').fill("Frontend");
await page.locator("select").nth(1).selectOption("");
await page.click("text=Buscar");
await page.waitForLoadState("networkidle");

const createdRow = page.locator("tbody tr").first();
await createdRow.locator("button").nth(1).click();
await page.waitForSelector("text=Editar Niño");
await shot("05-edit-form");

await fieldByLabel(page, "Curso *").fill("6to Primaria");
await page.locator('label:has-text("Centro educativo *")').locator("xpath=following-sibling::select").selectOption(String(centers[1].id));
await page.locator('label:has-text("Dispositivo GPS")').locator("xpath=following-sibling::select").selectOption("");
await page.click("text=Actualizar Niño");
await page.waitForLoadState("networkidle");

await page.locator('input[placeholder="Buscar por nombre, apellido o código"]').fill("Frontend");
await page.click("text=Buscar");
await page.waitForLoadState("networkidle");

const editedRow = page.locator("tbody tr").first();
await editedRow.locator("button").nth(2).click();
await page.waitForSelector("text=Desactivar Niño");
await page.locator("textarea").fill("Prueba de auditoría CU04");
await shot("06-deactivate-modal");
await page.click("text=Desactivar");
await page.waitForLoadState("networkidle");

await editedRow.locator("button").nth(0).click().catch(() => {});
await page.waitForTimeout(1200);
await shot("07-after-deactivate");

const report = {
  opened_url: `${BASE_WEB}/ninos-monitoreados`,
  screenshots,
  network: network.filter((entry) =>
    entry.url.includes("/children/stats/") ||
    entry.url.includes("/children/?") ||
    /\/children\/\d+\/$/.test(entry.url) ||
    entry.url.includes("/children/") && ["POST", "PUT"].includes(entry.method) ||
    entry.url.includes("/children/") && entry.url.includes("/status/")
  ),
  centers_devices_requests: network.filter((entry) =>
    entry.url.includes("/educational-centers/") || entry.url.includes("/gps-devices/")
  ),
  console: consoleMessages,
};

await fs.writeFile(`${OUT_DIR}/browser-audit-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
