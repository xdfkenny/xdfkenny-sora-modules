//
//  kf_referer_test — proves the Luna patch's Kingfisher mechanics against the
//  REAL referer-gated allmanga CDN, using Kingfisher 8.10.0 (Luna's pin)
//  compiled from source with the CLT toolchain.
//
//  The ModuleImageHeaders enum below is byte-identical to the one in
//  Luna-Kanzen-reader-image-referer.patch (baseUrl passed as String? here to
//  avoid pulling in ModuleData).
//

import Foundation
import AppKit

// === EXACT code from the patch (ModuleData.baseUrl -> String? param) ===
enum ModuleImageHeaders {
    private(set) static var referer: String?
    private static var installed = false

    private static let modifier = AnyModifier { request in
        var request = request
        if let referer = referer, !referer.isEmpty,
           request.value(forHTTPHeaderField: "Referer") == nil {
            request.setValue(referer, forHTTPHeaderField: "Referer")
        }
        return request
    }

    static func activate(for baseUrl: String?) {
        referer = baseUrl
        guard !installed else { return }
        installed = true
        KingfisherManager.shared.defaultOptions += [.requestModifier(modifier)]
    }
}
// =======================================================================

let panel1 = URL(string: "https://aln.youtube-anime.com/images133/ex9vXC6gWYY9bGkSo/0/sub/1.jpg")!
let panel2 = URL(string: "https://aln.youtube-anime.com/images133/ex9vXC6gWYY9bGkSo/0/sub/2.png")!

func phase(_ name: String, url: URL, expectOK: Bool, done: @escaping () -> Void) {
    KingfisherManager.shared.retrieveImage(with: url, options: [.callbackQueue(.dispatch(.global()))]) { result in
        switch result {
        case .success(let value):
            let img = value.image
            print("[\(name)] SUCCESS: \(url.lastPathComponent) -> \(Int(img.size.width))x\(Int(img.size.height)) (source: \(value.source))")
            if !expectOK { print("[\(name)] UNEXPECTED SUCCESS — gate open or headers leaked") }
        case .failure(let error):
            print("[\(name)] FAILURE: \(error.errorCode) \(error.localizedDescription.prefix(160))")
            if expectOK { print("[\(name)] UNEXPECTED FAILURE — patch mechanics broken") }
        }
        done()
    }
}

print("=== kf_referer_test: Kingfisher 8.10.0 + patch modifier vs live allmanga CDN ===")

// Phase 1: modifier NOT installed (patch not activated) -> expect 403
phase("1-no-modifier", url: panel1, expectOK: false) {
    // Phase 2: activate with the module's baseUrl -> expect 200
    ModuleImageHeaders.activate(for: "https://allmanga.to/")
    phase("2-with-referer", url: panel2, expectOK: true) {
        // Phase 3: clear referer (module without baseUrl loaded) -> expect 403 again
        ModuleImageHeaders.activate(for: nil)
        phase("3-cleared", url: panel1, expectOK: false) {
            print("=== done ===")
            exit(0)
        }
    }
}

while true { RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1)) }
