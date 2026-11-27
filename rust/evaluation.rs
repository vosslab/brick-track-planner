use std::collections::HashSet;
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::coverage::{self, Overhang};
use crate::model::{Catalog, Edge, ItemKind, Layout, Point, Project};
use crate::ports::{self, WorldPort};
use crate::routes::{self, RoutePath};

/// Mirrors the file contract and keeps pairwise geometry work bounded.
const MAX_PLANAR_STUDS: f64 = 100_000.0;
const MAX_DESIGN_AREA_STUDS: f64 = 4_096.0;
const MAX_LAYERS: usize = 1_000;
const MAX_ITEMS: usize = 10_000;

#[derive(Debug)]
pub enum EvaluationError {
    Catalog(&'static serde_json::Error),
    Project(serde_json::Error),
    Validation(String),
    Output(serde_json::Error),
}
impl fmt::Display for EvaluationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Catalog(e) => write!(f, "Read bundled catalog: {e}"),
            Self::Project(e) => write!(f, "Read project: {e}"),
            Self::Validation(e) => f.write_str(e),
            Self::Output(e) => write!(f, "Write evaluation: {e}"),
        }
    }
}
impl std::error::Error for EvaluationError {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Unresolved<'a> {
    id: &'a str,
    name: &'a str,
    source_id: &'a str,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Evaluation<'a> {
    project: &'a Value,
    ports: Vec<WorldPort<'a>>,
    routes: Vec<RoutePath<'a>>,
    overhangs: Vec<Overhang<'a>>,
    unresolved: Vec<Unresolved<'a>>,
}

fn unresolved<'a>(project: &'a Project, layout: &Layout<'_>) -> Vec<Unresolved<'a>> {
    let mut unresolved = Vec::new();
    for item in project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
    {
        match &item.kind {
            ItemKind::Track { .. } => {}
            ItemKind::Unresolved {
                source_id, name, ..
            } => unresolved.push(Unresolved {
                id: &item.id,
                name,
                source_id,
            }),
        }
    }
    unresolved
}

fn validate_ids<'a>(ids: impl Iterator<Item = &'a str>, kind: &str) -> Result<(), EvaluationError> {
    let mut seen = HashSet::new();
    for id in ids {
        if id.is_empty() || !seen.insert(id) {
            return Err(EvaluationError::Validation(format!(
                "Invalid or duplicate {kind} ID: {id:?}"
            )));
        }
    }
    Ok(())
}
fn validate_position(position: Point, id: &str) -> Result<(), EvaluationError> {
    (position.x.abs() <= MAX_PLANAR_STUDS && position.y.abs() <= MAX_PLANAR_STUDS)
        .then_some(())
        .ok_or_else(|| {
            EvaluationError::Validation(format!(
                "Position must be within {MAX_PLANAR_STUDS} studs: {id}"
            ))
        })
}
fn validate_dimensions(
    width: f64,
    depth: f64,
    maximum: f64,
    id: &str,
) -> Result<(), EvaluationError> {
    (width > 0.0 && width <= maximum && depth > 0.0 && depth <= maximum)
        .then_some(())
        .ok_or_else(|| {
            EvaluationError::Validation(format!(
                "Width and depth must be positive and within {maximum} studs: {id}"
            ))
        })
}
fn perpendicular(first: Edge, second: Edge) -> bool {
    matches!(
        (first, second),
        (Edge::North | Edge::South, Edge::East | Edge::West)
            | (Edge::East | Edge::West, Edge::North | Edge::South)
    )
}
fn validate_area(project: &Project) -> Result<(), EvaluationError> {
    let area = &project.area;
    validate_dimensions(area.width, area.depth, MAX_DESIGN_AREA_STUDS, "design area")?;
    if let Some(outline) = &area.outline {
        for &point in outline {
            validate_position(point, "design area outline")?;
        }
    }
    if !coverage::valid_outline(area) {
        return Err(EvaluationError::Validation(
            "Use one clockwise right-angle table outline with matching dimensions and public edges"
                .into(),
        ));
    }
    for (index, front) in area.fronts.iter().enumerate() {
        if area.fronts[..index].contains(front) {
            return Err(EvaluationError::Validation(
                "A public edge may be declared only once".into(),
            ));
        }
    }
    if let Some(kind) = area.niltc {
        let expected_fronts = match kind {
            crate::model::NiltcKind::Straight => 1,
            crate::model::NiltcKind::Corner => 2,
        };
        if area.fronts.len() != expected_fronts
            || (expected_fronts == 2 && !perpendicular(area.fronts[0], area.fronts[1]))
        {
            return Err(EvaluationError::Validation(format!(
                "A NILTC {kind:?} area needs {expected_fronts} public edge{}",
                if expected_fronts == 1 { "" } else { "s" }
            )));
        }
    }
    Ok(())
}
fn validate(
    project: &Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
) -> Result<(), EvaluationError> {
    if project.layers.len() > MAX_LAYERS || project.items.len() > MAX_ITEMS {
        return Err(EvaluationError::Validation(format!(
            "Projects may contain at most {MAX_LAYERS} layers and {MAX_ITEMS} items"
        )));
    }
    validate_ids(
        project.layers.iter().map(|layer| layer.id.as_str()),
        "layer",
    )?;
    validate_ids(project.items.iter().map(|item| item.id.as_str()), "item")?;
    validate_area(project)?;
    for item in &project.items {
        if layout.layer_visibility(&item.layer_id).is_none() {
            return Err(EvaluationError::Validation(format!(
                "Invalid item layer: {}",
                item.id
            )));
        }
        validate_position(item.pose.position, &item.id)?;
        match &item.kind {
            ItemKind::Track { part_id, .. } => {
                if catalog.part(part_id).is_none() {
                    return Err(EvaluationError::Validation(format!(
                        "Unknown catalog part: {part_id}"
                    )));
                }
            }
            ItemKind::Unresolved { width, depth, .. } => {
                validate_dimensions(*width, *depth, MAX_PLANAR_STUDS, &item.id)?
            }
        }
    }
    Ok(())
}

pub fn evaluate(project_json: &str) -> Result<String, EvaluationError> {
    let catalog = Catalog::load().map_err(EvaluationError::Catalog)?;
    let project_value: Value =
        serde_json::from_str(project_json).map_err(EvaluationError::Project)?;
    let project = Project::deserialize(&project_value).map_err(EvaluationError::Project)?;
    let layout = Layout::new(&project);
    validate(&project, &layout, catalog)?;
    let mut ports = ports::world_ports(&project, &layout, catalog);
    ports::recognize_joins(&mut ports);
    let routes = routes::trace(&project, &layout, catalog, &ports);
    let unresolved = unresolved(&project, &layout);
    let analysis = Evaluation {
        project: &project_value,
        overhangs: coverage::overhangs(&project, &layout, catalog),
        unresolved,
        routes,
        ports,
    };
    serde_json::to_string(&analysis).map_err(EvaluationError::Output)
}
