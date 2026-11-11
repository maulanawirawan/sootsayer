//! Sootsayer engine: turns daily smoke (PM10) and fire data into a
//! respiratory-visit outlook per puskesmas, plus a clean-air room plan.
//!
//! The same code runs natively (CLI, used by the MCP server and the pipeline)
//! and in the browser (WebAssembly). Both call [`json`], so identical input
//! gives byte-identical output.

pub mod brief;
pub mod dates;
pub mod error;
pub mod geo;
pub mod method;
pub mod model;
pub mod outlook;
pub mod plan;

#[cfg(target_arch = "wasm32")]
mod wasm;

/// JSON in, JSON out. Every function returns an envelope:
/// `{"ok":true,"result":{...}}` or `{"ok":false,"error":"..."}`.
pub mod json {
    use serde::Serialize;
    use serde::de::DeserializeOwned;

    use crate::error::EngineError;

    #[derive(Serialize)]
    struct Success<'a, T: Serialize> {
        ok: bool,
        result: &'a T,
    }

    #[derive(Serialize)]
    struct Failure<'a> {
        ok: bool,
        error: &'a str,
    }

    fn failure(msg: &str) -> String {
        serde_json::to_string(&Failure { ok: false, error: msg })
            .unwrap_or_else(|_| String::from(r#"{"ok":false,"error":"internal error"}"#))
    }

    fn run<I, O>(bytes: &[u8], f: impl Fn(&I) -> Result<O, EngineError>) -> String
    where
        I: DeserializeOwned,
        O: Serialize,
    {
        let input: I = match serde_json::from_slice(bytes) {
            Ok(v) => v,
            Err(e) => return failure(&format!("invalid JSON input: {e}")),
        };
        match f(&input) {
            Ok(out) => serde_json::to_string(&Success { ok: true, result: &out })
                .unwrap_or_else(|e| failure(&format!("could not encode result: {e}"))),
            Err(e) => failure(&e.to_string()),
        }
    }

    pub fn outlook(bytes: &[u8]) -> String {
        run(bytes, crate::outlook::outlook)
    }

    pub fn clean_air(bytes: &[u8]) -> String {
        run(bytes, crate::plan::clean_air)
    }

    pub fn fire_counts(bytes: &[u8]) -> String {
        run(bytes, crate::geo::fire_counts)
    }

    pub fn locate(bytes: &[u8]) -> String {
        run(bytes, crate::geo::locate)
    }

    pub fn brief(bytes: &[u8]) -> String {
        run(bytes, crate::brief::brief)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn envelope_reports_errors_plainly() {
        let out = super::json::outlook(b"{not json");
        assert!(out.starts_with(r#"{"ok":false,"error":"invalid JSON input"#), "{out}");
        let out = super::json::clean_air(br#"{"floor_area_m2":0,"ceiling_height_m":3,"unit_cadr_m3h":300}"#);
        assert!(out.contains("floor_area_m2 must be"), "{out}");
    }

    #[test]
    fn envelope_wraps_results() {
        let out = super::json::clean_air(br#"{"floor_area_m2":48,"ceiling_height_m":3,"unit_cadr_m3h":300}"#);
        assert!(out.starts_with(r#"{"ok":true,"result":{"volume_m3":144.0"#), "{out}");
    }
}
