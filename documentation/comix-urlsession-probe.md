# comix × kanzen: URLSession probe (run on the Mac that builds Luna)

## Why

comix.to sits behind a Cloudflare managed challenge. Today (2026-08-23) every
non-browser client from our network gets 403 "Just a moment..." — Node undici,
system curl, .NET HttpClient, public proxies. Only a real Chromium engine
passes. The one stack we cannot test from Windows is Apple's URLSession /
CFNetwork — which is EXACTLY what kanzen's JS `fetch` uses
(URLSession.shared.dataTask, see KanzenEngine JavaScriptCore.swift). This
60-second test answers definitively whether kanzen can ever reach comix
directly.

## Run it

```bash
cd /tmp
cat > probe.swift << 'SWIFT'
import Foundation

func probe(_ label: String, _ url: String, headers: [String: String]) {
    var req = URLRequest(url: URL(string: url)!)
    req.httpMethod = "GET"
    req.timeoutInterval = 20
    for (k, v) in headers { req.addValue(v, forHTTPHeaderField: k) }
    let sem = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: req) { data, resp, err in
        if let err = err { print("[\(label)] ERROR: \(err.localizedDescription)"); sem.signal(); return }
        let status = (resp as! HTTPURLResponse).statusCode
        let head = String(data: data?.prefix(120) ?? Data(), encoding: .utf8) ?? ""
        let verdict = head.contains("Just a moment") ? "CF CHALLENGE"
            : head.contains("{\"status\":\"ok\"") ? "JSON OK"
            : "other"
        print("[\(label)] HTTP \(status) -> \(verdict)")
        print("    body: \(head.replacingOccurrences(of: "\n", with: " "))")
        sem.signal()
    }.resume()
    sem.wait()
}

let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
probe("api-default-UA", "https://comix.to/api/v1/manga?limit=5&page=1",
      headers: ["Accept": "application/json"])
probe("api-safari-UA", "https://comix.to/api/v1/manga?limit=5&page=1",
      headers: ["Accept": "application/json", "User-Agent": ua,
                "Referer": "https://comix.to/"])
probe("image-static", "https://static.comix.to/e052/i/1/e0/6998641675253@280.jpg",
      headers: ["User-Agent": ua, "Referer": "https://comix.to/"])
SWIFT
swift probe.swift
```

## Bring back

The three `[label] HTTP ...` lines. Decision tree:

- **HTTP 200 / JSON OK** → kanzen CAN reach comix today; the Aug-16 "blocked"
  conclusion was stale (or caused by the Aug-22 origin outage). Action:
  delete + re-add the comix module in kanzen and just use it.
- **403 CF CHALLENGE** → URLSession is fingerprint-flagged like every other
  non-browser stack. Since static.comix.to (images) is equally gated, comix in
  kanzen cannot work without an app-level change: a Luna PR adding a real
  WebKit-backed fetch (WKWebView solves managed challenges natively) plus
  shared cookies + Safari UA for the image CDN. That is a substantial PR;
  decide whether comix is worth it versus adding a MangaDex module (which
  works headerless end-to-end).
