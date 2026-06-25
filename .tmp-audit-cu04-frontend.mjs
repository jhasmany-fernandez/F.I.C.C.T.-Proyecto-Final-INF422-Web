import fs from "fs/promises";
import path from "path";
import playwright from "/tmp/codex-playwright/node_modules/playwright/index.js";

const { chromium } = playwright;

const OUT_DIR = "/tmp/cu04-audit";
await fs.mkdir(OUT_DIR, { recursive: true });

const baseApi = "http://34.69.89.232:8787/api";
const baseWeb = "http://34.69.89.232:5656";

const loginResponse = await fetch(`${baseApi}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@colegio.com", password: "12345678" }),
});
const loginData = await loginResponse.json();
const token = loginData.token.access;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.addInitScript((login) => {
  localStorage.setItem("authToken", login.token.access);
  localStorage.setItem("refreshToken", login.token.refresh);
  localStorage.setItem("authUser", JSON.stringify(login.user));
}, loginData);

const screenshots = {};

async function shot(name) {
  const target = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: target, fullPage: true });
  screenshots[name] = target;
}

await page.goto(`${baseWeb}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Gestión de Niños Monitoreados");
await page.waitForSelector("text=Total Niños");
await shot("01-ninos-main");

await page.fill('input[placeholder="Buscar por nombre, apellido o código"]', "María");
await page.click("text=Buscar");
await page.waitForLoadState("networkidle");
await shot("02-ninos-filter");

await page.click("button:has(svg)");
await page.waitForTimeout(1200);
await page.waitForSelector("text=Detalle del Niño");
await shot("03-ninos-detail");

await page.click("text=Nuevo Niño");
await page.waitForSelector("text=Registrar Nuevo Niño");
await shot("04-ninos-new-form");

await page.click("text=Cancelar");
await page.waitForTimeout(500);

const editButtons = page.locator('button[title="Editar"], button').filter({ has: page.locator("svg") });
await page.locator("button").filter({ has: page.locator("svg") }).nth(1).click().catch(() => {});
await page.waitForTimeout(1200);
if (await page.locator("text=Editar Niño").count()) {
  await shot("05-ninos-edit-form");
}

await page.goto(`${baseWeb}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Gestión de Niños Monitoreados");
await page.locator("button").filter({ has: page.locator("svg") }).nth(2).click().catch(() => {});
await page.waitForTimeout(1200);
if (await page.locator("text=Desactivar Niño").count()) {
  await shot("06-ninos-status-modal");
}

const summary = await page.locator("article.rounded-\\[1\\.75rem\\] p.text-sm.text-slate-500").allTextContents().catch(() => []);
const pageText = await page.textContent("body");

const report = {
  login_user: loginData.user,
  screenshots,
  ui_checks: {
    has_title: pageText.includes("Gestión de Niños Monitoreados"),
    has_summary_cards: ["Total Niños", "Activos", "Inactivos", "Con GPS Asignado", "Sin GPS Asignado"].every((item) => pageText.includes(item)),
    has_table_headers: ["Nombre del Niño", "Centro Educativo", "Dispositivo GPS", "Acciones"].every((item) => pageText.includes(item)),
    has_filters: ["Buscar por nombre, apellido o código", "Centro educativo", "Curso", "Estado", "GPS", "Buscar", "Limpiar"].every((item) => pageText.includes(item)),
    has_detail_panel: pageText.includes("Detalle del Niño"),
    has_new_form: pageText.includes("Registrar Nuevo Niño"),
    has_edit_form: pageText.includes("Editar Niño"),
    has_status_modal: pageText.includes("Desactivar Niño") || pageText.includes("Activar Niño"),
  },
  visible_excerpt: pageText.slice(0, 2500),
  summary_labels: summary,
};

await fs.writeFile(path.join(OUT_DIR, "frontend-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
