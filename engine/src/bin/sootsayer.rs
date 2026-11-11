//! Native CLI for the Sootsayer engine.
//!
//! Reads JSON from `--input FILE` (or stdin) and prints the same JSON envelope
//! the WebAssembly module returns. Exit code 0 on success, 1 when the engine
//! rejects the input, 2 for usage errors.

use std::io::{Read, Write};
use std::process::ExitCode;

use sootsayer_engine::json;

const USAGE: &str = "usage: sootsayer <outlook|clean-air|fire-counts|locate|brief> [--input FILE|-] [--pretty]";

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first() else {
        eprintln!("{USAGE}");
        return ExitCode::from(2);
    };
    if cmd == "-h" || cmd == "--help" {
        println!("{USAGE}");
        return ExitCode::SUCCESS;
    }
    let mut input_path: Option<String> = None;
    let mut pretty = false;
    let mut rest = args.iter().skip(1);
    while let Some(a) = rest.next() {
        match a.as_str() {
            "--input" | "-i" => input_path = rest.next().cloned(),
            "--pretty" => pretty = true,
            other => {
                eprintln!("unknown argument '{other}'\n{USAGE}");
                return ExitCode::from(2);
            }
        }
    }

    let mut buf = Vec::new();
    let read = match input_path.as_deref() {
        Some(p) if p != "-" => std::fs::read(p).map(|b| buf = b),
        _ => std::io::stdin().read_to_end(&mut buf).map(|_| ()),
    };
    if let Err(e) = read {
        eprintln!("cannot read input: {e}");
        return ExitCode::from(2);
    }

    let out = match cmd.as_str() {
        "outlook" => json::outlook(&buf),
        "clean-air" => json::clean_air(&buf),
        "fire-counts" => json::fire_counts(&buf),
        "locate" => json::locate(&buf),
        "brief" => json::brief(&buf),
        other => {
            eprintln!("unknown command '{other}'\n{USAGE}");
            return ExitCode::from(2);
        }
    };

    let ok = out.starts_with(r#"{"ok":true"#);
    let text = if pretty {
        serde_json::from_str::<serde_json::Value>(&out)
            .and_then(|v| serde_json::to_string_pretty(&v))
            .unwrap_or(out)
    } else {
        out
    };
    let mut stdout = std::io::stdout().lock();
    if writeln!(stdout, "{text}").is_err() {
        return ExitCode::from(2);
    }
    if ok {
        ExitCode::SUCCESS
    } else {
        eprintln!("engine rejected the input (see the error field)");
        ExitCode::from(1)
    }
}
