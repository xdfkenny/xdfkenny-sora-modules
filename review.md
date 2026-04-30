# QA Code Review: `henaojara.js` (Sora Source Module)

**Review Date:** 2026-04-30  
**Reviewer:** QA Engineer  
**Scope:** Full module (`searchResults`, `extractDetails`, `extractEpisodes`, `extractStreamUrl`, helpers)  
**Platform:** Sora Stream / AnimeJara Scraper  
**Status:** 🔴 **BLOCKED** — Critical issues must be resolved before release.

---

## 1. Executive Summary

This module provides search, metadata, episode listing, and stream extraction for AnimeJara. While the fallback logic is robust, there are **critical API contract violations**, **fragile HTML/JSON parsing**, and **security concerns** that make the current build unsuitable for production. The most severe issue is `extractStreamUrl` returning inconsistent payload types (JSON vs. raw URL vs. `null`), which will crash downstream consumers.

---

## 2. Test Environment & Methodology

- **Static Analysis:** Regex complexity, type consistency, dead-code detection, hardcoded secret/domain audit.
- **Logic Flow Analysis:** Async waterfall, error boundary coverage, fallback chain validation.
- **Edge-Case Simulation:** Malformed HTML, missing DOM nodes, empty API responses, reversed query parameters.

---

## 3. Issue Register

### 🔴 Critical (P0) — Release Blockers

#### QA-001 | Inconsistent Return Type in `extractStreamUrl`
| Field | Detail |
|---|---|
| **Component** | `extractStreamUrl` |
| **Category** | Reliability / API Contract |
| **Description** | The function returns three different types: a **JSON string** (`{streams, subtitles...}`), a **plain URL string**, or **`null`**. Downstream parsers expect uniform JSON. |
| **Evidence** | `return JSON.stringify(payload)` (streams resolved) vs. `return embedUrls[0]` (fallback) vs. `return iframeUrl` (iframe path) vs. `return null` (total failure). |
| **Impact** | **Crash/Exception** in Sora player when attempting `JSON.parse()` on a raw URL. |
| **Fix** | Normalize **all** successful paths to the JSON envelope. Raw URLs should be wrapped: <br>`return JSON.stringify({ streams: [{ title: 'Direct', url: m3u8, streamUrl: m3u8 }], subtitles: null });` |
| **Status** | Open |

#### QA-002 | `TEMPORADAS_DATA` Extracted via Unbalanced Regex
| Field | Detail |
|---|---|
| **Component** | `extractEpisodes` |
| **Category** | Data Integrity |
| **Description** | JSON is extracted with `/TEMPORADAS_DATA\s*=\s*(\[[\s\S]*?\]).../`. This breaks if the array contains nested objects/arrays with `]` inside strings, or if the assignment ends with `,` instead of `;` or `</script>`. |
| **Evidence** | If the site minifies to `TEMPORADAS_DATA = [...], NEXT_VAR = ...`, the regex fails and episodes array returns empty. |
| **Impact** | Silent failure — user sees "0 episodes" despite content existing. |
| **Fix** | Use a **balanced bracket parser** or execute the script block in a sandboxed context. Minimum mitigation: validate the match with `try/catch` JSON.parse and add a secondary greedy fallback. |
| **Status** | Open |

#### QA-003 | Incomplete HTML Entity Decoder Breaks URLs
| Field | Detail |
|---|---|
| **Component** | `decodeHtml` (global helper) |
| **Category** | Data Corruption |
| **Description** | Only handles 5 named entities (`&amp;`, `&quot;`, etc.). Numeric entities (`&#39;`, `&#x27;`) are left encoded, corrupting stream URLs and image paths. |
| **Evidence** | `decodeHtml("https://example.com/&#x27;video.m3u8")` returns the same string. |
| **Impact** | 404s on streams/images that use numeric encoding. |
| **Fix** | Add numeric entity support: <br>`.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(code))`<br>`.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))` |
| **Status** | Open |

---

### 🟠 High (P1)

#### QA-004 | Domain Spoofing in Header Logic
| Field | Detail |
|---|---|
| **Component** | `mergeHeaders` |
| **Category** | Security |
| **Description** | `String(url).indexOf('animejara.com') === -1` matches `evil-animejara.com` or `animejara.com.attacker.net`. Forged AnimeJara headers are then sent to arbitrary third-party servers. |
| **Evidence** | `url = "https://notanimejara.com"` → returns base headers safely, but `url = "https://evil-animejara.com"` → injects forged Referer/Origin. |
| **Impact** | Header spoofing, potential CORS bypass signatures, referrer leakage. |
| **Fix** | Parse hostname strictly: <br>`new URL(url).hostname === 'animejara.com'` |
| **Status** | Open |

#### QA-005 | Sequential Network Waterfall Causes Timeouts
| Field | Detail |
|---|---|
| **Component** | `extractStreamUrl` |
| **Category** | Performance |
| **Description** | Embed URLs are resolved in a `for` loop with `await`. Each embed may spawn 3+ server requests. 5 languages × 3 servers = ~15 sequential HTTP round-trips. |
| **Evidence** | `for (let i = 0; i < embedUrls.length; i++) { ... await extractDirectServerFromEmbed ... await resolveServerToDirectUrl ... }` |
| **Impact** | Request timeouts on slow connections; poor UX. |
| **Fix** | Use `Promise.all` or `Promise.allSettled` over embeds, or implement a concurrency limiter (e.g., max 3 parallel). |
| **Status** | Open |

#### QA-006 | Rigid Query-String Parsing in Download Extractor
| Field | Detail |
|---|---|
| **Component** | `extractRealDownloadUrl` |
| **Category** | Reliability |
| **Description** | `downloadPageUrl.match(/idanime=(\d+)&idcapitulo=(\d+)/i)` assumes parameter order. Fails if `idcapitulo` appears first or if additional params are inserted between them. |
| **Evidence** | `?idcapitulo=5&idanime=123` → `idMatch` is `null`. |
| **Impact** | Download links silently omitted. |
| **Fix** | Use `URLSearchParams`: <br>`const params = new URL(downloadPageUrl).searchParams;`<br>`const idAnime = params.get('idanime');` |
| **Status** | Open |

#### QA-007 | Unpacker Relies on Fragile Hoisting
| Field | Detail |
|---|---|
| **Component** | `unpack` (P.A.C.K.E.R. module) |
| **Category** | Maintainability / Runtime Risk |
| **Description** | `_filterargs` and `_replacestrings` are declared *after* the `return` statement. While JS hoists function declarations, bundlers/minifiers (e.g., esbuild, terser) may rewrite this incorrectly. |
| **Evidence** | ```js<br>return _replacestrings(source);<br>function _filterargs(source) { ... }<br>``` |
| **Impact** | Runtime `TypeError` if the module is ever minified or transpiled. |
| **Fix** | Move helper declarations to the top of `unpack` or to module scope. |
| **Status** | Open |

---

### 🟡 Medium (P2)

#### QA-008 | Unbounded Parallel Server Resolution
| Field | Detail |
|---|---|
| **Component** | `resolveServerToDirectUrl` → `Promise.all` |
| **Category** | Performance / Stability |
| **Description** | `Promise.all(serverPromises)` fires all server resolutions simultaneously. If an episode lists 8+ servers, this creates a burst of outbound connections. |
| **Impact** | Risk of IP-based rate limiting or memory pressure. |
| **Fix** | Batch requests (e.g., `async function batchPromiseAll(tasks, limit) {...}`). |
| **Status** | Open |

#### QA-009 | `ajustarEnlace` is Unmaintainable
| Field | Detail |
|---|---|
| **Component** | `ajustarEnlace` |
| **Category** | Maintainability |
| **Description** | 50+ chained `.replace()` calls for domain remapping. Adding a new server requires editing a 100-line function and risks typos. |
| **Impact** | High regression risk; slow onboarding for new devs. |
| **Fix** | Refactor to a declarative map:<br>```js<br>const URL_MAP = [<br>  { from: /^https:\/\/streamtape\.com\/e\//, to: 'https://streamtape.com/v/' },<br>  // ...<br>];<br>URL_MAP.forEach(({from, to}) => link = link.replace(from, to));<br>``` |
| **Status** | Open |

#### QA-010 | Dead Code: `pickPreferredServer`
| Field | Detail |
|---|---|
| **Component** | `pickPreferredServer` |
| **Category** | Maintainability |
| **Description** | Function is defined but never invoked anywhere in the module. |
| **Impact** | Confuses maintainers; bloats bundle slightly. |
| **Fix** | Remove or wire into `extractStreamUrl` as a fallback selector. |
| **Status** | Open |

#### QA-011 | `extractAliases` Fragile Split Logic
| Field | Detail |
|---|---|
| **Component** | `extractDetails` → `extractAliases` |
| **Category** | Data Integrity |
| **Description** | Splits description on literal `<br>` only. Misses `<br/>`, `<br />`, or `<br class="...">`. |
| **Evidence** | HTML with `<br/>` results in a single line; alias extraction falls back to H1 title. |
| **Impact** | Incorrect or missing alternative titles. |
| **Fix** | Use regex split: `.split(/<br\s*\/?>/i)` |
| **Status** | Open |

#### QA-012 | No HTTP Status Validation
| Field | Detail |
|---|---|
| **Component** | `soraFetch` consumers |
| **Category** | Reliability |
| **Description** | Most consumers call `await response.text()` without checking `response.ok`. A 500-error HTML page is then fed into regex extractors, producing garbage data. |
| **Evidence** | `const html = await response.text();` immediately after `soraFetch`. |
| **Impact** | Phantom data extracted from error pages; hard to debug. |
| **Fix** | Add guard: `if (!response.ok) throw new Error('HTTP ' + response.status);` |
| **Status** | Open |

---

### 🟢 Low (P3)

#### QA-013 | No Request Timeout
| Field | Detail |
|---|---|
| **Component** | `soraFetch` |
| **Category** | Performance |
| **Description** | Native `fetch` has no timeout. A hanging TCP connection blocks the entire extraction chain indefinitely. |
| **Fix** | Wrap with `AbortController`: <br>`const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 15000);` |
| **Status** | Open |

#### QA-014 | Hardcoded Domains Scattered Throughout
| Field | Detail |
|---|---|
| **Component** | Global |
| **Category** | Maintainability |
| **Description** | Domains (`animejara.com`, `descargas.henaojara.com`, `nyuu.henaojara.com`, etc.) appear in dozens of regexes and strings. A single domain migration requires 20+ edits. |
| **Fix** | Centralize in a `CONFIG` object. |
| **Status** | Open |

#### QA-015 | `_replacestrings` is a No-Op
| Field | Detail |
|---|---|
| **Component** | `unpack` |
| **Category** | Functional Completeness |
| **Description** | `_replacestrings` returns input unchanged. In the original library, this restores split string literals. If the packed script relies on string reconstruction, unpacking produces broken JS. |
| **Impact** | Potential failure to extract m3u8 from packed players that use string arrays. |
| **Fix** | Port the full `_replacestrings` implementation from the reference library or verify against target site packed scripts. |
| **Status** | Open |

#### QA-016 | Console Error Noise in Production
| Field | Detail |
|---|---|
| **Component** | All catch blocks |
| **Category** | Observability |
| **Description** | `console.error` is used liberally. In production Sora modules, this pollutes the device log and offers no telemetry context. |
| **Fix** | Replace with a no-op or a debug flag: `if (DEBUG) console.error(...)`. |
| **Status** | Open |

---

## 4. Positive Findings ✅

1. **Resilient Fallback Chain:** `searchResults` gracefully degrades from Catalog → AJAX → WordPress search.
2. **Duplicate Prevention:** `parseAnimeCardsFromHtml` uses a `seen` Set to avoid duplicate hrefs.
3. **Protocol-relative URL Handling:** `normalizeExternalUrl` correctly upgrades `//` to `https://`.
4. **P.A.C.K.E.R. Support:** Including a JS unpacker increases compatibility with obfuscated video hosts.

---

## 5. Recommendations & Next Steps

| Priority | Action | Owner |
|---|---|---|
| **P0** | Normalize `extractStreamUrl` return type to JSON-only | Dev |
| **P0** | Replace `TEMPORADAS_DATA` regex with a balanced JSON extractor | Dev |
| **P1** | Harden `mergeHeaders` with strict hostname checks | Security |
| **P1** | Parallelize embed resolution with concurrency limits | Dev |
| **P2** | Refactor `ajustarEnlace` to declarative mapping | Tech-Debt |
| **P2** | Add `response.ok` guards before `.text()` parsing | QA |
| **P3** | Centralize domains & add JSDoc types | Tech-Debt |

---

## 6. Sign-Off

**QA Verdict:** 🔴 **Do Not Merge / Do Not Release**  
**Conditions for Pass:** All P0 issues resolved. At least 80% of P1 issues resolved with risk acceptance on remainder.
