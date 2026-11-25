//! Native counterpart of the browser's evaluation function for template checks.

use std::{
    env, fs,
    io::{self, Read},
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = env::args().skip(1);
    let path = args.next();
    if args.next().is_some() {
        return Err("Usage: cargo run --example oracle [PROJECT]".into());
    }
    let project = match path {
        Some(path) => fs::read_to_string(path)?,
        None => {
            let mut project = String::new();
            io::stdin().read_to_string(&mut project)?;
            project
        }
    };
    println!("{}", track_geometry::evaluate(&project)?);
    Ok(())
}
