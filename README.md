# onevio.in

The marketing site for OneVio CRM. Hand-written static HTML and CSS with no framework. GitHub Pages
serves the committed files as they are, so there is no build on the server.

## Editing pages

- Page sources live in `pages/`. Each starts with a `<!-- @meta {...} -->` block (title, description,
  path, optional `ogImage`, `jsonld` and `noindex`).
- The shared header, footer, `<head>` and Book-a-demo block live in `partials/` and are pulled in
  with `<!-- @include name -->`.
- After any change to `pages/` or `partials/`, run:

  ```
  npm run assemble
  ```

  This writes `index.html`, `404.html`, `<name>/index.html` and `sitemap.xml`. Commit the output:
  it is what Pages serves. A test fails if the output is stale.
- Don't edit the generated `*/index.html` files by hand.
- Styles are in `site.css`; the demo form script is `demo-form.js`; the calculator is `nrr-calculator.js`.

## Images

Screenshots are captured from the CRM with fictional demo data into `assets/shots-src/`. To rebuild
the WebP/PNG sizes and the OG images:

```
npm run images
```

## Tests

```
npm ci
npx playwright install chromium
npm test            # everything (Node test runner + Playwright)
npm run test:unit   # pure logic only, no browser
```

Set `CRM_TEST_CHANNEL=msedge` to use an installed browser instead of Playwright's chromium. To browse
locally, run `node tests/serve.mjs 8080` and open http://localhost:8080/.

The tests check assembled output freshness, links and image files, SEO tags, the sitemap, layout at
360px, the mobile menu, dark mode, the demo form and the calculator.

## Turnstile site key

The Cloudflare Turnstile site key appears in one place: `partials/demo.html`
(`data-sitekey="__TURNSTILE_SITE_KEY__"`). Replace the placeholder with the real site key, run
`npm run assemble`, and commit.

## Deploy

GitHub Pages, deploying from the `main` branch, root folder. The `CNAME` file sets `onevio.in`.
Pushing to `main` publishes. GitHub Actions (`.github/workflows/test.yml`) runs the tests on every
push and pull request.
