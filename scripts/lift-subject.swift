// lift.swift — isolate the subject of a photograph using Apple's Vision
// foreground-instance mask (the same subject lift Photos uses). On-device, no
// model download, no per-image cost, and it understands a person wearing the
// garment — which a border flood-fill cannot.
//
// Reads "inputPath\toutputPath" lines on stdin, writes one JSON line per image.
// Batched on purpose: the model loads once for the whole run.
import Foundation
import Vision
import CoreImage
import AppKit

let ctx = CIContext(options: [.useSoftwareRenderer: false])

struct Result: Codable {
  var status: String
  var coverage: Double = 0     // fraction of the frame the subject occupies
  var instances: Int = 0
  var width: Int = 0
  var height: Int = 0
  var error: String? = nil
}

func coverageOf(_ mask: CIImage) -> Double {
  // average of the mask = fraction covered
  let extent = mask.extent
  let f = CIFilter(name: "CIAreaAverage", parameters: [
    kCIInputImageKey: mask, kCIInputExtentKey: CIVector(cgRect: extent)])
  guard let avg = f?.outputImage else { return 0 }
  var px = [UInt8](repeating: 0, count: 4)
  ctx.render(avg, toBitmap: &px, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1),
             format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
  return Double(px[0]) / 255.0
}

func process(_ inPath: String, _ outPath: String) -> Result {
  guard let src = CIImage(contentsOf: URL(fileURLWithPath: inPath)) else {
    return Result(status: "decode-failed")
  }
  let w = Int(src.extent.width), h = Int(src.extent.height)
  let handler = VNImageRequestHandler(ciImage: src, options: [:])
  let req = VNGenerateForegroundInstanceMaskRequest()
  do { try handler.perform([req]) } catch {
    return Result(status: "vision-failed", width: w, height: h, error: "\(error)")
  }
  guard let obs = req.results?.first, !obs.allInstances.isEmpty else {
    return Result(status: "no-subject", width: w, height: h)
  }
  do {
    let buf = try obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler)
    var mask = CIImage(cvPixelBuffer: buf)
    // the scaled mask comes back in the source's pixel space; align it
    if mask.extent != src.extent {
      let sx = src.extent.width / mask.extent.width, sy = src.extent.height / mask.extent.height
      mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    }
    let cov = coverageOf(mask)
    let cut = src.applyingFilter("CIBlendWithMask", parameters: [kCIInputMaskImageKey: mask])
    guard let png = ctx.pngRepresentation(of: cut, format: .RGBA8,
                                          colorSpace: CGColorSpaceCreateDeviceRGB()) else {
      return Result(status: "encode-failed", coverage: cov, instances: obs.allInstances.count, width: w, height: h)
    }
    try png.write(to: URL(fileURLWithPath: outPath))
    return Result(status: "ok", coverage: cov, instances: obs.allInstances.count, width: w, height: h)
  } catch {
    return Result(status: "mask-failed", width: w, height: h, error: "\(error)")
  }
}

let enc = JSONEncoder()
while let line = readLine(strippingNewline: true) {
  let parts = line.split(separator: "\t", maxSplits: 1).map(String.init)
  guard parts.count == 2 else { continue }
  let r = process(parts[0], parts[1])
  if let d = try? enc.encode(r), let s = String(data: d, encoding: .utf8) {
    print(s); fflush(stdout)
  }
}
