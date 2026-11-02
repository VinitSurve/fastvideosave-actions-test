
import { chromium } from "playwright";

const instagramUrl = process.env.INSTAGRAM_URL;

async function main() {
  if (!instagramUrl) throw new Error("Missing INSTAGRAM_URL");

  const target = new URL(instagramUrl);

  if (
    !["instagram.com", "www.instagram.com"].includes(target.hostname) ||
    !/^\/(p|reel|tv)\/[^/]+\/?$/.test(target.pathname)
  ) {
    throw new Error("Invalid Instagram post URL");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

    page.on("requestfailed", (request) => {
      const host = new URL(request.url()).hostname;
      if (
        host === "fastvideosave.net" ||
        host === "api.getrequest.dev"
      ) {
        console.log(
          "REQUEST FAILED:",
          host,
          request.failure()?.errorText
        );
      }
    });

    page.on("response", (response) => {
      const host = new URL(response.url()).hostname;

      if (
        host === "fastvideosave.net" ||
        host === "api.getrequest.dev"
      ) {
        console.log("HTTP:", host, response.status());
      }
    });

    page.on("pageerror", (error) => {
  console.log("PAGE ERROR:", error.message);
});

page.on("console", (message) => {
  if (message.type() === "error") {
    console.log("BROWSER CONSOLE ERROR:", message.text());
  }
});

page.on("requestfailed", (request) => {
  if (request.url().includes("api.getrequest.dev")) {
    console.log("API REQUEST URL:", request.url());
    console.log("API FAILURE:", request.failure()?.errorText);
  }
});

    console.log("Opening FastVideoSave...");

    await page.goto("https://fastvideosave.net/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Page title:", await page.title());

    const bodyText = await page.locator("body").innerText()
      .catch(() => "");

    console.log(
      "Page content preview:",
      bodyText.slice(0, 700).replace(/\s+/g, " ")
    );

    const input = page.locator('#form input[name="url"]');

    console.log("Input count:", await input.count());

    if (await input.count() !== 1) {
      throw new Error("Downloader input not found.");
    }

    const apiPromise = page.waitForResponse(
      (response) =>
        response.url() === "https://api.getrequest.dev/allinone",
      { timeout: 45000 }
    );

    console.log("Submitting Instagram URL...");

    await input.fill(instagramUrl);
    await input.press("Enter");

    const response = await apiPromise;

    console.log("API HTTP status:", response.status());

    if (!response.ok()) {
      throw new Error("Downloader API returned an unsuccessful status.");
    }

    const data = await response.json();

    console.log("Fetch:", data.fetch);
    console.log("Video results:", data.video?.length ?? 0);

    if (!data.fetch || !data.video?.length) {
      throw new Error("No video returned.");
    }

    console.log("SUCCESS: GitHub Actions reached the downloader API.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("TEST FAILED:", error.message);
  process.exitCode = 1;
});
