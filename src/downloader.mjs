import { chromium } from "playwright";
import { writeFile, unlink } from "node:fs/promises";

const instagramUrl = process.env.INSTAGRAM_URL;
const outputPath = "downloaded-reel.mp4";
const maxDownloadBytes = 100 * 1024 * 1024;

function validateInstagramUrl(value) {
  if (!value) throw new Error("Missing INSTAGRAM_URL input.");

  const url = new URL(value);
  if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) {
    throw new Error("Only instagram.com URLs are allowed.");
  }
  if (!/^\/(p|reel|tv)\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error("URL must point to an Instagram post, Reel, or IGTV item.");
  }
  return url.toString();
}

async function main() {
  const targetUrl = validateInstagramUrl(instagramUrl);
  let browser;

  try {
    console.log("Launching headless Chromium...");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: false });
    const page = await context.newPage();

    console.log("Opening FastVideoSave...");
    await page.goto("https://fastvideosave.net/", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    const apiResponsePromise = page.waitForResponse(
      (response) => response.url() === "https://api.getrequest.dev/allinone",
      { timeout: 60000 }
    );

    await page.locator('#form input[name="url"]').fill(targetUrl);
    await page.locator('#form input[name="url"]').press("Enter");

    const apiResponse = await apiResponsePromise;
    console.log("Downloader API HTTP status:", apiResponse.status());
    if (!apiResponse.ok()) {
      throw new Error(`Downloader API returned HTTP ${apiResponse.status()}.`);
    }

    const data = await apiResponse.json();
    if (data.fetch !== true || !Array.isArray(data.video) || data.video.length === 0) {
      throw new Error("The service did not return a video result.");
    }

    const videoUrl = data.video[0]?.video;
    if (typeof videoUrl !== "string") throw new Error("Video URL is missing from the response.");

    const media = new URL(videoUrl);
    if (media.protocol !== "https:" || !media.hostname.endsWith(".cdninstagram.com")) {
      throw new Error("The returned media URL has an unexpected host.");
    }

    console.log("Video result received; signed URL is intentionally not logged.");
    console.log("Downloading media through the browser context...");

    const mediaResponse = await context.request.get(videoUrl, { timeout: 120000 });
    if (!mediaResponse.ok()) {
      throw new Error(`Media server returned HTTP ${mediaResponse.status()}.`);
    }

    const contentType = mediaResponse.headers()["content-type"] ?? "";
    if (!contentType.toLowerCase().includes("video/")) {
      throw new Error(`Unexpected media Content-Type: ${contentType}`);
    }

    const body = await mediaResponse.body();
    if (body.length < 12 || body.length > maxDownloadBytes) {
      throw new Error(`Media size is outside accepted bounds: ${body.length} bytes.`);
    }
    if (body.subarray(4, 8).toString() !== "ftyp") {
      throw new Error("Downloaded media does not have an MP4/ISO-BMFF signature.");
    }

    await writeFile(outputPath, body, { mode: 0o600 });
    console.log("MP4 validation passed.");
    console.log("Downloaded bytes:", body.length);
    console.log("Content-Type:", contentType);
    console.log("Download test passed.");
  } finally {
    if (browser) await browser.close();
    try {
      await unlink(outputPath);
      console.log("Temporary MP4 deleted.");
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Warning: could not delete temporary MP4.");
    }
  }
}

main().catch((error) => {
  console.error("Download test failed:", error.message);
  process.exitCode = 1;
});
