# FastVideoSave Actions Test

An isolated experiment to test whether FastVideoSave can be used from a GitHub-hosted Ubuntu runner with headless Playwright.

## Run locally

```bash
npm install
npx playwright install chromium
INSTAGRAM_URL="https://www.instagram.com/p/POST_ID/" npm run test:download
```

## Run on GitHub Actions

1. Open **Actions**.
2. Select **Test FastVideoSave downloader**.
3. Select **Run workflow**.
4. Enter a public Instagram Reel/post URL.
5. Start the run and inspect the job logs.

The workflow is manually triggered; it does not run on every push.

## Safety

- The workflow uses a public URL input and does not require Instagram credentials.
- Signed media URLs are never printed.
- Downloaded MP4 files are deleted after validation and are not uploaded as artifacts.
- Local download files, dependency folders, and API Anything capture data are ignored by Git.

## Limitations

This is an experiment, not a production downloader. FastVideoSave and Cloudflare can change behavior, rate-limit requests, or block hosted runners. A successful test on one URL does not guarantee support for every public Instagram post.
