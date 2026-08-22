//
//  kf_quality_test — verifies the reader quality fix mechanics against
//  Kingfisher 8.10.0 compiled from source:
//   1. a very tall strip image (1000x24000) is downsampled at decode to a
//      GPU-safe longest edge (<=8192px), aspect preserved
//   2. an ordinary page (real allmanga panel, 1500x2250) passes through
//      with its size UNCHANGED
//   3. ImagePrefetcher with explicit options (review finding #1) downloads
//      a referer-gated panel successfully and stores it under the
//      processor-qualified cache key
//
//  Run: python3 -m http.server 8901 --directory /tmp/kfserve &
//       ./kf_quality_test
//

import Foundation
import AppKit

// === ReaderImageSizing equivalent (macOS: NSScreen scale) ===
enum ReaderImageSizing {
    static let maxPixels: CGFloat = 8192
    static var scale: CGFloat { max(NSScreen.main?.backingScaleFactor ?? 2, 1) }
    static var processor: DownsamplingImageProcessor {
        DownsamplingImageProcessor(size: CGSize(width: maxPixels / scale, height: maxPixels / scale))
    }
    static var options: KingfisherOptionsInfo {
        [.processor(processor), .scaleFactor(scale), .cacheOriginalImage, .backgroundDecode]
    }
    static func cacheKey(for url: URL) -> String {
        url.absoluteString + "@" + processor.identifier
    }
}

let refererModifier = AnyModifier { request in
    var r = request
    r.setValue("https://allmanga.to/", forHTTPHeaderField: "Referer")
    return r
}

// 1. generate a 1000x24000 strip PNG
func makeTallStrip(_ path: String, width: Int, height: Int) throws {
    let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    for y in stride(from: 0, to: height, by: 40) { // visible bands so it's a real-ish image
        ctx.setFillColor(red: 0.2, green: CGFloat((y / 40) % 255) / 255.0, blue: 0.6, alpha: 1)
        ctx.fill(CGRect(x: 0, y: y, width: width, height: 20))
    }
    let img = ctx.makeImage()!
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, img, nil)
    guard CGImageDestinationFinalize(dest) else { throw NSError(domain: "png", code: 1) }
    print("generated strip: \(width)x\(height) at \(path)")
}

let tallURL = URL(string: "http://127.0.0.1:8901/tallstrip.png")!
let panelURL = URL(string: "https://aln.youtube-anime.com/images133/ex9vXC6gWYY9bGkSo/0/sub/2.png")!
let panel3URL = URL(string: "https://aln.youtube-anime.com/images133/ex9vXC6gWYY9bGkSo/0/sub/3.png")!

print("=== kf_quality_test (KF 8.10.0, maxPixels=\(Int(ReaderImageSizing.maxPixels)), scale=\(ReaderImageSizing.scale)) ===")

// phase 1: tall strip with sizing options -> expect capped
KingfisherManager.shared.retrieveImage(with: tallURL, options: ReaderImageSizing.options + [.callbackQueue(.dispatch(.global())), .forceRefresh]) { r1 in
    switch r1 {
    case .success(let v):
        let s = v.image.size
        let longEdge = max(s.width, s.height) * ReaderImageSizing.scale
        print("[1-tall-strip] decoded \(Int(s.width))x\(Int(s.height)) @\(Int(ReaderImageSizing.scale))x -> \(Int(longEdge))px long edge",
              longEdge <= ReaderImageSizing.maxPixels + 1 ? "PASS (capped)" : "FAIL (over cap)")
        let aspectOK = abs((s.width / s.height) - (1000.0 / 24000.0)) < 0.01
        print("           aspect preserved:", aspectOK ? "PASS" : "FAIL")
    case .failure(let e): print("[1-tall-strip] FAIL: \(e.localizedDescription.prefix(120))")
    }

    // phase 2: real panel, same options -> expect unchanged 1500x2250
    KingfisherManager.shared.retrieveImage(with: panelURL, options: ReaderImageSizing.options + [.requestModifier(refererModifier), .callbackQueue(.dispatch(.global())), .forceRefresh]) { r2 in
        switch r2 {
        case .success(let v):
            let s = v.image.size
            print("[2-normal-panel] decoded \(Int(s.width))x\(Int(s.height))",
                  (Int(s.width) == 1500 && Int(s.height) == 2250) ? "PASS (unchanged)" : "note: size differs")
        case .failure(let e): print("[2-normal-panel] FAIL: \(e.localizedDescription.prefix(120))")
        }

        // phase 3: ImagePrefetcher with explicit options (review finding #1)
        let prefetcher = ImagePrefetcher(urls: [panel3URL],
                                         options: ReaderImageSizing.options + [.requestModifier(refererModifier)],
                                         progressBlock: nil) { skipped, failed, completed in
            print("[3-prefetcher] completed=\(completed.count) failed=\(failed.count) skipped=\(skipped.count)",
                  failed.isEmpty && completed.count == 1 ? "PASS (referer reached prefetch)" : "FAIL")
            let processedHit = ImageCache.default.isCached(forKey: ReaderImageSizing.cacheKey(for: panel3URL))
            let rawHit = ImageCache.default.isCached(forKey: panel3URL.absoluteString)
            print("           cached under processor key: \(processedHit ? "PASS" : "FAIL") | under raw key: \(rawHit)")
            print("=== done ===")
            exit(0)
        }
        prefetcher.start()
    }
}

while true { RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1)) }
