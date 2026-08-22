# Sora Modules Developer Specification & Prompt Reference
> [!IMPORTANT]
> This document serves as the system-prompt context and specification reference for generating Sora Modules (Anime, Manga, Light Novels). 
> It defines the constraints, APIs, schemas, and parser expectations required by compatible host applications (Sora, Luna, Dartotsu, Anymex, Tsumi, Hiyoku, Mojuru, etc.).

---

## 1. System Constraints & Runtime Environment
When generating module code, adhere strictly to the following execution constraints:

| Constraint | Description / Rule |
| :--- | :--- |
| **JS Engine** | Runs in isolated, bare JavaScriptCore or QuickJS engines (Android/iOS). |
| **No DOM/Window** | Absolutely no `document`, `window`, `DOMParser`, `XMLHttpRequest`, `LocalStorage`, or `location`. |
| **No Module Imports** | No `require()`, `import`, or external script loading. All code, including external dependencies (e.g., decryption libraries), must be self-contained within a single Javascript file. |
| **CORS Mitigation** | Browser `fetch` will fail. You **MUST** use the native host bridge function `fetchv2`. |
| **Scope & Scoping** | All module methods must be declared as `async function` in the global scope. Do NOT wrap code in an IIFE. |
| **Error Handling** | Never throw uncaught exceptions. Wrap all functions in `try/catch` and return fallback responses. |

---

## 2. Manifest Schema (`[module].json`)
Each module requires a manifest file matching the schema below.

```json
{
  "sourceName": "Example Module",
  "iconUrl": "https://url.to/icon.png",
  "author": {
    "name": "Developer Name",
    "icon": "https://url.to/author-icon.png"
  },
  "version": "1.0.0",
  "language": "English",
  "baseUrl": "https://example.com",
  "searchBaseUrl": "https://example.com/search?q=",
  "scriptUrl": "https://raw.githubusercontent.com/.../module.js",
  "type": "anime",            // Options: "anime" | "mangas" | "novels"
  "streamType": "HLS",        // Options: "HLS" | "mangas" | "novels"
  "asyncJS": true,            // Always true
  "quality": "1080p",         // Optional metadata
  "downloadSupport": true,    // Boolean toggle
  "softsub": true,            // Optional (Anime specific, always true for now)
  "novel": true,              // Optional (Novel specific)
  "supportsSora": true,       // Compatibility flags
  "supportsLuna": true,
  "supportsDartotsu": true,
  "supportsAnymex": true,
  "supportsTsumi": true,
  "supportsHiyoku": true,
  "supportsShirox": true,
  "supportsMojuru": true
}
```

---

## 3. Network API: `fetchv2`
The host application injects a native bridge function named `fetchv2` for making HTTP requests.

### Signature
```typescript
function fetchv2(
  url: string,
  headers: Record<string, string>,
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  body: string | null
): Promise<FetchV2Response>;

interface FetchV2Response {
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  headers: Record<string, string>;
}
```

### Standard Fetch Boilerplate
AI assistants should include this wrapper at the top of all generated script files to normalize requests and handle environment fallback:

```javascript
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    const headers = options.headers || {};
    if (!headers["User-Agent"]) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    }
    try {
        return await fetchv2(url, headers, options.method || 'GET', options.body || null);
    } catch (e) {
        try { 
            return await fetch(url, options); 
        } catch (error) { 
            return null; 
        }
    }
}
```

---

## 4. Module Specifications & Types
AI must implement one of the three module interfaces based on the `"type"` defined in the manifest.

### A. Video Modules (`type: "anime"`)
All outputs from these functions must be **JSON-stringified** before returning.

```typescript
/** Search anime titles by keyword */
async function searchResults(keyword: string): Promise<string>;
// Output Schema:
interface AnimeSearchResult {
  title: string;
  image: string; // URL
  href: string;  // Absolute watch/detail URL
}[]

/** Extract metadata details of a given anime */
async function extractDetails(url: string): Promise<string>;
// Output Schema (Array containing exactly one object):
[
  {
    description: string;
    aliases: string; // Comma-separated alternative titles
    airdate: string;
  }
]

/** Extract episodes for a given anime */
async function extractEpisodes(url: string): Promise<string>;
// Output Schema:
interface AnimeEpisode {
  href: string; // Episode URL to extract stream from
  number: number;
}[]

/** Extract streaming options and subtitles */
async function extractStreamUrl(url: string): Promise<string>;
// Output Schema:
interface AnimeStreamDetails {
  streams: {
    title: string; // e.g. "1080p • Dub"
    streamUrl: string; // HLS (.m3u8) or direct video URL
    headers?: Record<string, string>; // Headers needed to bypass hotlinking protection
  }[];
  subtitles?: string; // Optional subtitles URL (VTT/SRT)
}
```

---

### B. Manga Modules (`type: "mangas"`)
Unlike video and novel modules, manga modules return **raw JS objects/arrays** (not JSON-stringified).

```typescript
/** Search manga by keyword */
async function searchResults(keyword: string, page?: number): Promise<MangaSearchResult[]>;
interface MangaSearchResult {
  id: string;
  title: string;
  imageURL: string;
}

/** Extract metadata details */
async function extractDetails(id: string): Promise<MangaDetails>;
interface MangaDetails {
  description: string;
  tags: string[];
}

/** Extract chapters grouped by language code */
async function extractChapters(urlOrId: string): Promise<Record<string, LanguageChapterData[]>>;
type LanguageChapterData = [
  string, // Chapter number as string (e.g. "1.0")
  {
    id: string;
    title: string;
    chapter: number;
    scanlation_group?: string;
  }[]
];

/** Extract page image URLs for a chapter */
async function extractImages(chapterId: string): Promise<string[]>;
```

---

### C. Light Novel Modules (`type: "novels"`)
All outputs must be **JSON-stringified** except for `extractText` which returns a raw HTML string.

```typescript
/** Search light novels by keyword */
async function searchResults(keyword: string): Promise<string>;
// Output Schema:
interface NovelSearchResult {
  title: string;
  image: string; // URL
  href: string;  // Detail URL
}[]

/** Extract metadata details */
async function extractDetails(url: string): Promise<string>;
// Output Schema (Array containing exactly one object):
[
  {
    description: string;
    aliases: string; // Comma-separated alternatives
    airdate: string;
  }
]

/** Extract chapters list */
async function extractChapters(url: string): Promise<string>;
// Output Schema:
interface NovelChapter {
  title: string;
  href: string; // Chapter content URL
  number: number;
}[]

/** Extract chapter content */
async function extractText(url: string): Promise<string>;
// Output: Raw sanitized HTML string (e.g. "<p>Text...</p>")
```

---

## 5. Implementation Techniques & Patterns

### Custom HTML Parsing (Non-DOM)
Since `DOMParser` is unavailable, use string searching (`indexOf`, `substring`, `split`) or Regular Expressions for parsing.
```javascript
const htmlText = await response.text();

// Pattern A: Section Extraction
const startIdx = htmlText.indexOf('id="chapterText"');
const chunk = htmlText.substring(startIdx, htmlText.indexOf('</div>', startIdx));

// Pattern B: Global Regex Search Loop
const regex = /<a href="([^"]+)".*?>\s*(.*?)\s*<\/a>/gi;
let match;
while ((match = regex.exec(htmlText)) !== null) {
    results.push({ href: match[1], title: match[2] });
}
```

### Decryption & Deobfuscation (e.g. p.a.c.k.e.r / Eval)
* Hosts often secure stream URLs with Packer or Dean Edwards obfuscation (`eval(function(p,a,c,k,e,d)...)`).
* Do not rely on external `eval` execution if sandboxing limits exist.
* Include inline base62 decoding or custom unpacker algorithms (like the standard `Unpacker` / `Unbaser` patterns) directly in your file when scraping protected sources.

---

## 6. AI Output Validation Checklist
Before outputting code, verify against the following checklist:

- [ ] **Method Scope**: All entry points are declared globally as `async function <Name>`.
- [ ] **No DOM Access**: Avoid any `document` or `window` references.
- [ ] **Network Protocol**: All requests use the `fetchv2` abstraction/wrapper.
- [ ] **Serialization Check**: 
  - `anime` and `novels` return **stringified** objects/arrays (using `JSON.stringify()`).
  - `mangas` returns **raw** arrays/objects (except `extractText` in novels which returns raw HTML).
- [ ] **Contract Compliance**:
  - `searchResults` (Anime/Novels) returns `{ title, image, href }`.
  - `searchResults` (Manga) returns `{ id, title, imageURL }`.
- [ ] **Error Safety**: All endpoints are wrapped in `try/catch` with fallback returns matching the expected type structure instead of throwing.

