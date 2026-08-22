//
//  kanzen_sim — faithful macOS re-creation of Kanzen/Luna's module runtime.
//
//  Replicates, line for line where possible:
//   - Kanzen/KanzenEngine/Utils/Extensions/JavaScriptCore.swift  (fetch/console/setTimeout/bundle shims)
//   - Kanzen/KanzenEngine/Model/KanzenModuleRunner.swift         (guard + call + promise glue, exceptionHandler)
//
//  Usage: kanzen_sim <module.js> <bundle.js> <new|old> [keyword]
//
//  new = current Luna (searchResults/extractDetails/extractChapters/extractImages)
//  old = pre-rename Luna (searchContent/getContentData/getChapters/getChapterImages)
//

import Foundation
import JavaScriptCore

// MARK: - Logger stand-in (Kanzen/Utils Logger.shared.log)
func log(_ message: String, type: String = "Debug") {
    print("[Logger][\(type)] \(message)")
}

// MARK: - Kanzen JS environment (port of JavaScriptCore.swift)

var gBundlePath = ""

extension JSContext {
    func sim_setupTimeOut() {
        let setTimeout: @convention(block) (JSValue, Double) -> Void = { callback, delay in
            let delayTime = DispatchTime.now() + delay / 1000.0
            DispatchQueue.main.asyncAfter(deadline: delayTime) {
                callback.call(withArguments: [])
            }
        }
        self.setObject(setTimeout, forKeyedSubscript: "setTimeout" as (NSCopying & NSObjectProtocol))
    }

    func sim_setupBundle() {
        do {
            let jsCode = try String(contentsOfFile: gBundlePath, encoding: .utf8)
            self.evaluateScript(jsCode)
            log("bundle loaded successfully")
        } catch {
            log("Error loading bundle.js: \(error)", type: "Error")
        }
    }

    func sim_setUpConsole() {
        let consoleObject = JSValue(newObjectIn: self)
        let consoleLogFunction: @convention(block) (String) -> Void = { message in
            log(message, type: "Debug")
        }
        let consolePrintFunction: @convention(block) (JSValue) -> Void = { message in
            print(message)
        }
        consoleObject?.setObject(consoleLogFunction, forKeyedSubscript: "log" as NSString)
        consoleObject?.setObject(consolePrintFunction, forKeyedSubscript: "print" as NSString)
        self.setObject(consoleObject, forKeyedSubscript: "console" as NSString)
    }

    func sim_setUpFetch() {
        // Promise helper — semantically identical to JSValue(newPromiseIn:fromExecutor:)
        self.evaluateScript("function __makePromise(executor) { return new Promise(function(resolve, reject) { executor(resolve, reject); }); }")
        let makePromise = self.objectForKeyedSubscript("__makePromise")!

        let fetch: @convention(block) (JSValue, JSValue) -> JSValue = { jsUrl, jsOptions in
            guard let urlStr = jsUrl.toString(), let url = URL(string: urlStr) else {
                return JSValue(newErrorFromMessage: "Invalid URL", in: self)
            }

            let executor: @convention(block) (JSValue, JSValue) -> Void = { resolve, reject in
                var request = URLRequest(url: url)
                request.httpMethod = "GET"
                if let options = jsOptions.toDictionary() as? [String: Any] {
                    if let method = options["method"] as? String {
                        request.httpMethod = method.uppercased()
                    }
                    if let headers = options["headers"] as? [String: String] {
                        for (key, value) in headers {
                            request.addValue(value, forHTTPHeaderField: key)
                        }
                    }
                    if let body = options["body"] as? String {
                        request.httpBody = body.data(using: .utf8)
                    }
                }

                let task = URLSession.shared.dataTask(with: request) { data, response, error in
                    if let error = error {
                        reject.call(withArguments: [JSValue(newErrorFromMessage: error.localizedDescription, in: self) as Any])
                        return
                    }
                    guard let httpResponse = response as? HTTPURLResponse else {
                        reject.call(withArguments: [JSValue(newErrorFromMessage: "No Response", in: self) as Any])
                        return
                    }
                    let textFunc: @convention(block) () -> String = {
                        if let data = data {
                            return String(data: data, encoding: .utf8) ?? ""
                        }
                        return ""
                    }
                    let jsonFunc: @convention(block) () -> JSValue = {
                        if let data = data {
                            do {
                                let json = try JSONSerialization.jsonObject(with: data, options: [])
                                return JSValue(object: json, in: self)
                            } catch {
                                log("JSON serialization failed", type: "Error")
                            }
                        }
                        return JSValue(newErrorFromMessage: "No Data", in: self)
                    }
                    guard let textJs = JSValue(object: textFunc, in: self),
                          let jsonJs = JSValue(object: jsonFunc, in: self) else {
                        reject.call(withArguments: [JSValue(newErrorFromMessage: "Failed to create JSValue", in: self) as Any])
                        return
                    }
                    let responseObject: [String: Any] = [
                        "status": httpResponse.statusCode,
                        "headers": httpResponse.allHeaderFields,
                        "text": textJs,
                        "json": jsonJs,
                        "data": data?.base64EncodedString() ?? ""
                    ]
                    resolve.call(withArguments: [JSValue(object: responseObject, in: self) as Any])
                }
                task.resume()
            }

            let promise = makePromise.call(withArguments: [executor])
            return promise ?? JSValue(newErrorFromMessage: "Promise not supported", in: self)
        }

        self.setObject(fetch, forKeyedSubscript: "fetch" as NSString)
    }

    func sim_setUpJSEnvironment() {
        sim_setUpFetch()
        sim_setUpConsole()
        sim_setupBundle()
        sim_setupTimeOut()
    }
}

// MARK: - KanzenModuleRunner port

class SimRunner {
    var jsContext: JSContext?
    var lastJSException: String?

    func setUpEnvironment() {
        jsContext = JSContext()
        jsContext?.exceptionHandler = { _, exception in
            let msg = "JS Error: \(exception?.toString() ?? "unknown error")"
            print(msg)
            log(msg, type: "Error")
            self.lastJSException = msg
        }
        jsContext?.sim_setUpJSEnvironment()
    }

    func loadScript(_ script: String) -> Bool {
        lastJSException = nil
        setUpEnvironment()
        jsContext?.evaluateScript(script)
        if let exception = lastJSException {
            print("LOAD FAILED (ScriptExecutionError.scriptLoadError): \(exception)")
            return false
        }
        return true
    }

    /// Exact port of the runner's guard chain + promise glue.
    /// NOTE: objectForKeyedSubscript on a missing global returns a JSValue wrapping
    /// `undefined`, NOT nil — so the app's `guard let` always succeeds and the
    /// exception surfaces via exceptionHandler ("JS Error: ...").
    func callModule(function fnName: String, arguments args: [Any], completion: @escaping (JSValue?, String?) -> Void) {
        guard let context = jsContext else {
            completion(nil, "JS function not found (no context)")
            return
        }
        guard let funcValue = context.objectForKeyedSubscript(fnName) else {
            completion(nil, "JS function not found (nil subscript)")
            return
        }
        print("[runner] \(fnName): typeof = \(funcValue.isUndefined ? "undefined" : (funcValue.isObject ? "object/function" : "other"))")
        guard let promise = funcValue.call(withArguments: args) else {
            completion(nil, "Failed to call JS async function (call returned nil)")
            return
        }
        print("[runner] \(fnName) call -> \(promise.isUndefined ? "undefined" : (promise.isObject ? "object" : "value"))")

        let resolveBlock: @convention(block) (JSValue) -> Void = { result in
            completion(result, nil)
        }
        let rejectBlock: @convention(block) (JSValue) -> Void = { error in
            completion(nil, error.toString() ?? "-")
        }
        let resolveCallback = JSValue(object: resolveBlock, in: context)!
        let rejectCallback = JSValue(object: rejectBlock, in: context)!

        promise.invokeMethod("then", withArguments: [resolveCallback])
        promise.invokeMethod("catch", withArguments: [rejectCallback])
    }
}

// MARK: - JSON dumping of JSValue results

func jsToPlist(_ v: JSValue) -> Any {
    guard let obj = v.toObject() else { return "<undefined>" }
    return deepSanitize(obj)
}

func deepSanitize(_ any: Any) -> Any {
    switch any {
    case let d as [String: Any]:
        return d.mapValues { deepSanitize($0) }
    case let a as [Any]:
        return a.map { deepSanitize($0) }
    case let jv as JSValue:
        return jsToPlist(jv)
    case is NSNull, is NSNumber, is String:
        return any
    default:
        return String(describing: any)
    }
}

func jsonString(_ any: Any) -> String {
    if JSONSerialization.isValidJSONObject(any),
       let d = try? JSONSerialization.data(withJSONObject: any, options: [.prettyPrinted, .sortedKeys]),
       let s = String(data: d, encoding: .utf8) {
        return s
    }
    return String(describing: any)
}

// MARK: - main

let args = CommandLine.arguments
guard args.count >= 4 else {
    print("usage: kanzen_sim <module.js> <bundle.js> <new|old> [keyword]")
    exit(64)
}
let modulePath = args[1]
gBundlePath = args[2]
let convention = args[3]
let keyword = args.count > 4 ? args[4] : "one piece"

let names: (search: String, details: String, chapters: String, images: String)
if convention == "old" {
    names = ("searchContent", "getContentData", "getChapters", "getChapterImages")
} else {
    names = ("searchResults", "extractDetails", "extractChapters", "extractImages")
}

guard let moduleSrc = try? String(contentsOfFile: modulePath, encoding: .utf8) else {
    print("cannot read module at \(modulePath)")
    exit(66)
}

let runner = SimRunner()
print("=== kanzen_sim: \(modulePath) | convention=\(convention) | keyword=\"\(keyword)\" ===")
guard runner.loadScript(moduleSrc) else { exit(1) }
print("=== module script loaded (no load-time exception) ===")

// Probe which entry points exist
for n in ["searchResults", "extractDetails", "extractChapters", "extractImages",
          "searchContent", "getContentData", "getChapters", "getChapterImages"] {
    let v = runner.jsContext!.evaluateScript("typeof \(n)")
    print("[probe] typeof \(n) = \(v?.toString() ?? "?")")
}

var finished = false

func finish(_ code: Int32) -> Never {
    finished = true
    fflush(stdout)
    exit(code)
}

// Watchdog
DispatchQueue.global().asyncAfter(deadline: .now() + 180) {
    print("=== TIMEOUT after 180s ===")
    finish(2)
}

print("=== step 1: \(names.search)(\"\(keyword)\", 0) ===")
runner.callModule(function: names.search, arguments: [keyword, 0]) { searchRes, err in
    guard let searchRes = searchRes, err == nil else {
        print("SEARCH FAILED: \(err ?? "nil result")")
        finish(1)
    }
    let results = jsToPlist(searchRes)
    guard let arr = results as? [Any], !arr.isEmpty else {
        print("SEARCH OK but 0 results")
        finish(0)
    }
    print("search -> \(arr.count) results; first 3:")
    for item in arr.prefix(3) { print("  " + jsonString(item)) }
    guard let first = arr[0] as? [String: Any], let mangaId = first["id"] else {
        print("cannot read first result id")
        finish(1)
    }
    print("=== step 2: \(names.details)(id) ===")
    runner.callModule(function: names.details, arguments: [mangaId]) { detRes, err in
        guard let detRes = detRes, err == nil else {
            print("DETAILS FAILED: \(err ?? "nil result")")
            finish(1)
        }
        let det = jsToPlist(detRes)
        if let d = det as? [String: Any] {
            print("details keys: \(d.keys.sorted().joined(separator: ", "))")
            if let desc = d["description"] as? String { print("description: \(desc.prefix(120))...") }
            if let tags = d["tags"] as? [Any] { print("tags: \(tags.count)") }
        } else { print("details -> " + jsonString(det).prefix(400)) }

        print("=== step 3: \(names.chapters)(id) ===")
        runner.callModule(function: names.chapters, arguments: [mangaId]) { chRes, err in
            guard let chRes = chRes, err == nil else {
                print("CHAPTERS FAILED: \(err ?? "nil result")")
                finish(1)
            }
            // Extract first chapter's params exactly like the app:
            // ChapterData(dict:) -> params = dict["id"]
            let ctx = runner.jsContext!
            ctx.setObject(chRes, forKeyedSubscript: "__chapters" as NSString)
            let firstId = ctx.evaluateScript("""
                (function() {
                    var ch = __chapters;
                    for (var lang in ch) {
                        var arr = ch[lang];
                        if (arr && arr.length) {
                            var entry = arr[0];
                            var list = entry[1];
                            if (list && list.length && list[0].id !== undefined) return list[0].id;
                        }
                    }
                    return null;
                })()
            """)
            let langs = ctx.evaluateScript("(function(){ var ks=[]; for (var k in __chapters) { ks.push(k + ':' + (__chapters[k] ? __chapters[k].length : 0)); } return ks.join(', '); })()")
            print("chapters languages -> \(langs?.toString() ?? "?")")
            guard let params = firstId, !params.isUndefined, !params.isNull else {
                print("no chapter id extractable")
                finish(1)
            }
            print("=== step 4: \(names.images)(params) ===")
            runner.callModule(function: names.images, arguments: [params]) { imgRes, err in
                guard let imgRes = imgRes, err == nil else {
                    print("IMAGES FAILED: \(err ?? "nil result")")
                    finish(1)
                }
                let imgs = jsToPlist(imgRes)
                if let urls = imgs as? [Any] {
                    print("images -> \(urls.count) page URLs; first 3:")
                    for u in urls.prefix(3) { print("  \(u)") }
                } else {
                    print("images -> " + jsonString(imgs).prefix(400))
                }
                print("=== FULL CHAIN OK ===")
                finish(0)
            }
        }
    }
}

// Keep main runloop alive so DispatchQueue.main (setTimeout shim) works.
while !finished {
    RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.1))
}
