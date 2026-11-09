fn main() {
    // Embed a newly built frontend even when a prior Cargo build started while
    // Vite was still writing assets. Desktop binaries must match out/index.html.
    println!("cargo:rerun-if-changed=../out");
    // Artwork lives outside src-tauri. Re-run the native resource compiler when
    // it changes; rebuilding the embedded frontend alone leaves a stale EXE icon.
    for icon in [
        "../assets/brand/wuffi.ico",
        "../assets/brand/wuffi.png",
        "../assets/brand/wuffi.icns",
    ] {
        println!("cargo:rerun-if-changed={icon}");
    }
    tauri_build::build()
}
