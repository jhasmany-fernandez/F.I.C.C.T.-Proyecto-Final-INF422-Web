import fs from "fs/promises";
import playwright from "/tmp/codex-playwright/node_modules/playwright/index.js";

const { chromium } = playwright;
const OUT_DIR = "/tmp/cu04-browser-audit";
const BASE_API = "http://34.69.89.232:8787/api";
const BASE_WEB = "http://34.69.89.232:5656";

const loginResponse = await fetch(`${BASE_API}/auth/login/`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@colegio.com", password: "12345678" }),
});
const loginData = await loginResponse.json();

const captures = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
page.on("response", async (response) => {
  if (!response.url().includes("/status/")) {
    return;
  }
  const request = response.request();
  let body = null;
  try {
    body = await response.json();
  } catch {}
  captures.push({
    url: response.url(),
    method: request.method(),
    status: response.status(),
    headers: {
      authorization: request.headers()["authorization"] ? "Bearer <token>" : undefined,
      contentType: request.headers()["content-type"],
    },
    requestPayload: request.postData() ? JSON.parse(request.postData()) : null,
    response: body,
  });
});

await page.addInitScript((login) => {
  localStorage.setItem("authToken", login.token.access);
  localStorage.setItem("refreshToken", login.token.refresh);
  localStorage.setItem("authUser", JSON.stringify(login.user));
}, loginData);

await page.goto(`${BASE_WEB}/ninos-monitoreados`, { waitUntil: "networkidle" });
await page.locator('input[placeholder="Buscar por nombre, apellido o código"]').fill("Frontend");
await page.click("text=Buscar");
await page.waitForLoadState("networkidle");
await page.locator("tbody tr").first().locator("button").nth(2).click();
await page.waitForSelector("text=Desactivar Niño");
await page.locator("textarea").fill("Prueba de auditoría CU04");
await page.screenshot({ path: `${OUT_DIR}/06b-deactivate-filled.png`, fullPage: true });
await page.getByRole("button", { name: "Desactivar" }).last().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT_DIR}/07b-after-patch.png`, fullPage: true });

await fs.writeFile(`${OUT_DIR}/patch-report.json`, JSON.stringify(captures, null, 2));
console.log(JSON.stringify(captures, null, 2));
await browser.close();
