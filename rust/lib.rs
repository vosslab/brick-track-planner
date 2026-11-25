//! Portable track geometry and its browser bindings.

mod bindings;
mod coverage;
mod evaluation;
mod model;
mod ports;

pub use bindings::{catalog_json, encode_webp, evaluate_json};
pub use evaluation::{EvaluationError, evaluate};
