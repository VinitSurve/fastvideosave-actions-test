
import { chromium } from "playwright";
import { createCipheriv } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";

const API_URL = "https://api.getrequest.dev/allinone";
const SITE_URL = "https://fastvideosave.net/";
const KEY = Buffer.from("qwertyuioplkjhgf", "utf8");
const IV = Buffer.alloc(16, 0);

const OUTPUT_FILE = "downloaded-reel.mp4";
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

function validateInstagramUrl(value) {
  if (!value) throw new Error("Missing INSTAGRAM_URL.");

  const url = new URL(value);

  if (!["instagram.com", "www.instagram.com"].includes(url.hostname)) {
    throw new Error("Only Instagram URLs are accepted.");
  }

  if (!/^\/(p|reel|tv)\/[^/]+\/?$/.test(url.pathname)) {
    throw new Error("Invalid Instagram post or Reel URL.");
  }

  return url.toString();
}

function encryptInstagramUrl(url) {
  const cipher = createCipheriv("aes-128-cbc", KEY, IV);

  return Buffer.concat([
    cipher.update(url, "utf8"),
    cipher.final(),
  ]).toString("hex");
}

async function main() {
  const instagramUrl = validateInstagramUrl(
    process.env.INSTAGRAM_URL
  );

  let browser;

  try {
    console.log("Launching headless Chromium...");

    browser = await chromium.launch({
      headless: true,
    });

    const context = await browser.newContext();

    console.log("Opening FastVideoSave...");

    const page = await context.newPage();

    await page.goto(SITE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    console.log("Website loaded:", await page.title());

    // Encrypt the Instagram URL using the site's observed algorithm.
    const encryptedUrl = encryptInstagramUrl(instagramUrl);

    console.log("Preparing direct HTTP API request...");

    // This is an HTTP request, not browser page.evaluate/fetch.
    // Therefore browser CORS preflight enforcement does not apply.
    const apiResponse = await context.request.get(API_URL, {
      timeout: 60000,
      headers: {
        "accept": "*/*",
        "origin": "https://fastvideosave.net",
        "referer": "https://fastvideosave.net/",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "url": encryptedUrl,
      },
    });

    console.log("API HTTP status:", apiResponse.status());

    if (!apiResponse.ok()) {
      throw new Error(
        `API request rejected with HTTP ${apiResponse.status()}.`
      );
    }

    const data = await apiResponse.json();

    if (
      data.fetch !== true ||
      !Array.isArray(data.video) ||
      data.video.length === 0
    ) {
      throw new Error("No video result returned.");
    }

    const videoUrl = data.video[0]?.video;

    if (typeof videoUrl !== "string") {
      throw new Error("Video URL missing.");
    }

    const mediaUrl = new URL(videoUrl);

    if (
      mediaUrl.protocol !== "https:" ||
      !mediaUrl.hostname.endsWith(".cdninstagram.com")
    ) {
      throw new Error("Unexpected media URL host.");
    }

    console.log("Video result received.");
    console.log("Downloading MP4...");

    const mediaResponse = await context.request.get(videoUrl, {
      timeout: 120000,
    });

    if (!mediaResponse.ok()) {
      throw new Error(
        `Media download failed with HTTP ${mediaResponse.status()}.`
      );
    }

    const contentType =
      mediaResponse.headers()["content-type"] || "";

    if (!contentType.toLowerCase().includes("video/")) {
      throw new Error("Unexpected media content type.");
    }

    const buffer = await mediaResponse.body();

    if (
      buffer.length < 12 ||
      buffer.length > MAX_DOWNLOAD_BYTES
    ) {
      throw new Error("Downloaded file size is outside accepted limits.");
    }

    if (buffer.subarray(4, 8).toString() !== "ftyp") {
      throw new Error("Downloaded file is not a valid MP4.");
    }

    await writeFile(OUTPUT_FILE, buffer, {
      mode: 0o600,
    });

    console.log("MP4 validation passed.");
    console.log("Downloaded bytes:", buffer.length);
    console.log("Content-Type:", contentType);
    console.log("SUCCESS: Download test completed.");

  } finally {
    if (browser) {
      await browser.close();
    }

    try {
      await unlink(OUTPUT_FILE);
      console.log("Temporary MP4 deleted.");
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Warning: temporary file cleanup failed.");
      }
    }
  }
}

main().catch((error) => {
  console.error("DOWNLOAD TEST FAILED:", error.message);
  process.exitCode = 1;
});
