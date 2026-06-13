import fs from "fs/promises";
import playwright from "/tmp/codex-playwright/node_modules/playwright/index.js";

const { chromium } = playwright;
const baseApi = "http://34.69.89.232:8787/api";
const baseWeb = "http://34.69.89.232:5656";
const OUT_DIR = "/tmp/cu04-audit";

const loginResponse = await fetch(`${baseApi}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@colegio.com", password: "12345678" }),
});
const loginData = await loginResponse.json();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.addInitScript((login) => {
  localStorage.setItem("authToken", login.token.access);
  localStorage.setItem("refreshToken", login.token.refresh);
  localStorage.setItem("authUser", JSON.stringify(login.user));
}, loginData);

await page.goto(`${baseWeb}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.waitForSelector("text=Gestión de Niños Monitoreados");
await page.waitForSelector("tbody tr");

const firstRow = page.locator("tbody tr").first();
const buttons = firstRow.locator("button");

await buttons.nth(1).click();
await page.waitForSelector("text=Editar Niño");
await page.screenshot({ path: `${OUT_DIR}/05-ninos-edit-form.png`, fullPage: true });

await page.goto(`${baseWeb}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.waitForSelector("tbody tr");
await page.locator("tbody tr").first().locator("button").nth(2).click();
await page.waitForSelector("text=Desactivar Niño");
await page.screenshot({ path: `${OUT_DIR}/06-ninos-status-modal.png`, fullPage: true });

const report = {
  screenshots: {
    edit_form: `${OUT_DIR}/05-ninos-edit-form.png`,
    status_modal: `${OUT_DIR}/06-ninos-status-modal.png`,
  },
  edit_present: await page.locator("text=Desactivar Niño").count(),
};

await fs.writeFile(`${OUT_DIR}/frontend-extra-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
