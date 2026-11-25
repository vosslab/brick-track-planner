//! Native counterpart of the browser's evaluation function for fixture comparison.

use std::{env, fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let path = args
        .next()
        .ok_or("Usage: cargo run --example oracle -- PROJECT [DRAFT_JSON]")?;
    let project = fs::read_to_string(path)?;
    let draft = args.next().unwrap_or_default();
    println!("{}", track_geometry::evaluate(&project, &draft)?);
    Ok(())
}
