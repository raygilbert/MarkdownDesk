import AppKit
import Foundation

// The 512-point drawing is the single source for every macOS icon size.
let destination = URL(fileURLWithPath: CommandLine.arguments[1])

func color(_ hex: UInt32) -> NSColor {
    NSColor(calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: 1)
}

func drawIcon() {
    let ink = color(0x282c29)
    let paper = color(0xfffefa)
    let vermilion = color(0xbc593d)

    color(0xf0eee5).setFill()
    NSBezierPath(roundedRect: NSRect(x: 20, y: 20, width: 472, height: 472),
                 xRadius: 102, yRadius: 102).fill()

    let page = NSBezierPath(roundedRect: NSRect(x: 104, y: 89, width: 304, height: 334),
                            xRadius: 18, yRadius: 18)
    paper.setFill()
    page.fill()
    ink.setStroke()
    page.lineWidth = 11
    page.stroke()

    vermilion.setFill()
    NSBezierPath(ovalIn: NSRect(x: 151, y: 284, width: 108, height: 108)).fill()

    let rule = NSBezierPath()
    rule.lineWidth = 13
    rule.lineCapStyle = .round
    rule.move(to: NSPoint(x: 243, y: 190))
    rule.line(to: NSPoint(x: 355, y: 190))
    rule.move(to: NSPoint(x: 243, y: 149))
    rule.line(to: NSPoint(x: 326, y: 149))
    ink.setStroke()
    rule.stroke()
}

let sizes: [(Int, String)] = [
    (16, "icp4"), (32, "icp5"), (64, "icp6"), (128, "ic07"),
    (256, "ic08"), (512, "ic09"), (1024, "ic10")
]

func bigEndian(_ value: Int) -> Data {
    var number = UInt32(value).bigEndian
    return withUnsafeBytes(of: &number) { Data($0) }
}

var chunks = Data()
for (size, type) in sizes {
    guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size,
                                        pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                                        hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                                        bytesPerRow: 0, bitsPerPixel: 0),
          let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Could not create \(size)-pixel icon")
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    NSAffineTransform(transform: AffineTransform(scaleByX: CGFloat(size) / 512,
                                                  byY: CGFloat(size) / 512)).concat()
    drawIcon()
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode \(size)-pixel icon")
    }
    chunks.append(contentsOf: type.utf8)
    chunks.append(bigEndian(data.count + 8))
    chunks.append(data)
}

var icon = Data("icns".utf8)
icon.append(bigEndian(chunks.count + 8))
icon.append(chunks)
try icon.write(to: destination)
