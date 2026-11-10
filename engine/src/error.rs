use std::fmt;

/// A clear, human-readable reason why the engine refused an input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EngineError(String);

impl EngineError {
    pub fn new(msg: impl Into<String>) -> Self {
        EngineError(msg.into())
    }
}

impl fmt::Display for EngineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for EngineError {}
