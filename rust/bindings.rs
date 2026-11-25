use image_webp::{ColorType, WebPEncoder};
use wasm_bindgen::prelude::*;

use crate::evaluation::evaluate;
use crate::model::CATALOG_JSON;

/// Return the bundled catalog in its original JSON form.
#[wasm_bindgen]
pub fn catalog_json() -> String {
    CATALOG_JSON.into()
}

/// Evaluate a project and optionally snap a draft, returning JSON or a browser error.
#[wasm_bindgen]
pub fn evaluate_json(project_json: &str, draft_json: &str) -> Result<String, JsValue> {
    evaluate(project_json, draft_json).map_err(|error| JsValue::from_str(&error.to_string()))
}

/// Encode row-major 8-bit RGBA pixels as lossless WebP.
#[wasm_bindgen]
pub fn encode_webp(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsValue> {
    webp(rgba, width, height).map_err(|message| JsValue::from_str(&message))
}

fn webp(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    const MAX_DIMENSION: u32 = 16_384; // VP8L stores each dimension minus one in 14 bits.
    if !(1..=MAX_DIMENSION).contains(&width) || !(1..=MAX_DIMENSION).contains(&height) {
        return Err(format!(
            "WebP dimensions must be between 1 and {MAX_DIMENSION} pixels"
        ));
    }
    let expected = u64::from(width) * u64::from(height) * 4;
    if rgba.len() as u64 != expected {
        return Err(format!(
            "Expected {expected} RGBA bytes for a {width} × {height} image"
        ));
    }
    let mut bytes = Vec::new();
    WebPEncoder::new(&mut bytes)
        .encode(rgba, width, height, ColorType::Rgba8)
        .map_err(|error| format!("Encode WebP: {error}"))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use image_webp::WebPDecoder;

    use super::webp;

    #[test]
    fn webp_round_trip_and_invalid_input() {
        let rgba = [10, 20, 30, 255, 40, 50, 60, 127];
        let encoded = webp(&rgba, 2, 1).unwrap();
        let mut decoded = WebPDecoder::new(Cursor::new(encoded)).unwrap();
        let mut pixels = [0; 8];
        assert_eq!(decoded.dimensions(), (2, 1));
        decoded.read_image(&mut pixels).unwrap();
        assert_eq!(pixels, rgba);
        assert!(webp(&rgba, 1, 1).is_err());
        assert!(webp(&[], 0, 1).is_err());
    }
}
