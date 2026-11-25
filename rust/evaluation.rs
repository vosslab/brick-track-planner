use std::collections::{BTreeMap, HashSet};
use std::fmt;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::coverage::{self, Overhang};
use crate::model::{Catalog, Draft, ItemKind, Layout, Point, Project, Venue};
use crate::niltc::{self, NiltcIssue};
use crate::ports::{self, EvaluatedSeam, WorldPort};
use crate::venue::{self, VenueIssue};

const MAX_PLANAR_STUDS: f64 = 100_000.0;

/// A project, draft, or bundled catalog could not be evaluated.
#[derive(Debug)]
pub enum EvaluationError {
    /// The bundled catalog could not be read.
    Catalog(&'static serde_json::Error),
    /// The project did not match the JSON wire contract.
    Project(serde_json::Error),
    /// The draft did not match the JSON wire contract.
    Draft(serde_json::Error),
    /// Input violates a geometry invariant.
    Validation(String),
    /// The evaluated result could not be serialized.
    Output(serde_json::Error),
}

impl fmt::Display for EvaluationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Catalog(error) => write!(formatter, "Read bundled catalog: {error}"),
            Self::Project(error) => write!(formatter, "Read project: {error}"),
            Self::Draft(error) => write!(formatter, "Read snap draft: {error}"),
            Self::Validation(message) => formatter.write_str(message),
            Self::Output(error) => write!(formatter, "Write evaluation: {error}"),
        }
    }
}

impl std::error::Error for EvaluationError {}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Count<'a> {
    part_id: &'a str,
    brand: &'a str,
    name: &'a str,
    count: usize,
}

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
    seams: Vec<EvaluatedSeam<'a>>,
    overhangs: Vec<Overhang<'a>>,
    no_table: bool,
    counts: Vec<Count<'a>>,
    unresolved: Vec<Unresolved<'a>>,
    venue_issues: Vec<VenueIssue<'a>>,
    niltc_issues: Vec<NiltcIssue<'a>>,
}

fn inventory<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &'a Catalog,
) -> (Vec<Count<'a>>, Vec<Unresolved<'a>>) {
    let mut counts = BTreeMap::new();
    let mut unresolved = Vec::new();
    for item in project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
    {
        match &item.kind {
            ItemKind::Track { part_id, .. } => {
                if let Some(part) = catalog.part(part_id) {
                    counts
                        .entry(&part.id)
                        .or_insert_with(|| Count {
                            part_id: &part.id,
                            brand: &part.brand,
                            name: &part.name,
                            count: 0,
                        })
                        .count += 1;
                }
            }
            ItemKind::Unresolved {
                source_id, name, ..
            } => {
                unresolved.push(Unresolved {
                    id: &item.id,
                    name,
                    source_id,
                });
            }
            ItemKind::Baseplate => {}
        }
    }
    (counts.into_values().collect(), unresolved)
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
    if position.x.abs() <= MAX_PLANAR_STUDS && position.y.abs() <= MAX_PLANAR_STUDS {
        return Ok(());
    }
    Err(EvaluationError::Validation(format!(
        "Position must be between -{MAX_PLANAR_STUDS} and {MAX_PLANAR_STUDS} studs on both axes: {id}"
    )))
}

fn validate_dimensions(width: f64, depth: f64, id: &str) -> Result<(), EvaluationError> {
    if width > 0.0 && width <= MAX_PLANAR_STUDS && depth > 0.0 && depth <= MAX_PLANAR_STUDS {
        return Ok(());
    }
    Err(EvaluationError::Validation(format!(
        "Width and depth must be positive and at most {MAX_PLANAR_STUDS} studs: {id}"
    )))
}

fn validate(
    project: &Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
    draft: Option<&Draft>,
) -> Result<(), EvaluationError> {
    if !matches!(project.version, 1 | 2) {
        return Err(EvaluationError::Validation(format!(
            "Unsupported project version {}",
            project.version
        )));
    }
    validate_ids(
        project.layers.iter().map(|layer| layer.id.as_str()),
        "layer",
    )?;
    validate_ids(
        project
            .tables
            .iter()
            .map(|table| table.id.as_str())
            .chain(project.items.iter().map(|item| item.id.as_str())),
        "table or item",
    )?;
    validate_ids(project.seams.iter().map(|seam| seam.id.as_str()), "seam")?;
    for table in &project.tables {
        if layout.layer_visibility(&table.layer_id).is_none() {
            return Err(EvaluationError::Validation(format!(
                "Invalid table layer: {}",
                table.id
            )));
        }
        validate_position(table.pose.position, &table.id)?;
        validate_dimensions(table.width, table.depth, &table.id)?;
    }
    for item in &project.items {
        if layout.layer_visibility(&item.layer_id).is_none()
            || item
                .table_id
                .as_deref()
                .is_some_and(|table| layout.table(table).is_none())
        {
            return Err(EvaluationError::Validation(format!(
                "Invalid item layer or table: {}",
                item.id
            )));
        }
        validate_position(item.pose.position, &item.id)?;
        match &item.kind {
            ItemKind::Track {
                part_id,
                height_plates,
            } => {
                if catalog.part(part_id).is_none() {
                    return Err(EvaluationError::Validation(format!(
                        "Unknown catalog part: {part_id}"
                    )));
                }
                if height_plates.unsigned_abs() > (1_u64 << 53) - 1 {
                    return Err(EvaluationError::Validation(format!(
                        "Track height must be a safe integer: {}",
                        item.id
                    )));
                }
            }
            ItemKind::Unresolved { width, depth, .. } => {
                validate_dimensions(*width, *depth, &item.id)?;
            }
            ItemKind::Baseplate => {}
        }
    }
    if let Some(draft) = draft {
        if draft.radius < 0.0 {
            return Err(EvaluationError::Validation(
                "Snap radius must be nonnegative".into(),
            ));
        }
        for id in &draft.piece_ids {
            if !project.items.iter().any(|item| &item.id == id) {
                return Err(EvaluationError::Validation(format!(
                    "Unknown item in snap draft: {id}"
                )));
            }
        }
    }
    Ok(())
}

fn project_venue(project: &Project, value: &Value) -> Result<Option<Venue>, EvaluationError> {
    let Some(venue) = value.get("venue").filter(|_| project.version == 2) else {
        return Ok(None);
    };
    let venue = Venue::deserialize(venue).map_err(EvaluationError::Project)?;
    validate_dimensions(venue.width, venue.depth, "venue")?;
    validate_ids(
        venue.keepouts.iter().map(|keepout| keepout.id.as_str()),
        "keepout",
    )?;
    for keepout in &venue.keepouts {
        if keepout.id.trim().is_empty() {
            return Err(EvaluationError::Validation(format!(
                "Invalid keepout ID: {:?}",
                keepout.id
            )));
        }
        if keepout.name.trim().is_empty() {
            return Err(EvaluationError::Validation(format!(
                "Keepout must have a name: {}",
                keepout.id
            )));
        }
        validate_position(keepout.center, &keepout.id)?;
        validate_dimensions(keepout.width, keepout.depth, &keepout.id)?;
    }
    Ok(Some(venue))
}

/// Analyze a project and optionally snap draft items to connectors or a NILTC guide.
///
/// Both arguments borrow JSON strings. An empty or JSON-null draft skips snapping.
/// The result is a JSON string containing the preserved project and its diagnostics.
pub fn evaluate(project_json: &str, draft_json: &str) -> Result<String, EvaluationError> {
    let catalog = Catalog::load().map_err(EvaluationError::Catalog)?;
    let mut project_value: Value =
        serde_json::from_str(project_json).map_err(EvaluationError::Project)?;
    let mut project = Project::deserialize(&project_value).map_err(EvaluationError::Project)?;
    let draft: Option<Draft> = if draft_json.trim().is_empty() {
        None
    } else {
        serde_json::from_str(draft_json).map_err(EvaluationError::Draft)?
    };

    let layout = Layout::new(&project);
    validate(&project, &layout, catalog, draft.as_ref())?;
    let venue = project_venue(&project, &project_value)?;
    if let Some(draft) = &draft {
        let mut snapped = ports::snap(&project, &layout, catalog, draft);
        if snapped.is_empty() {
            snapped.extend(niltc::snap(&project, &layout, catalog, draft));
        }
        for (index, pose) in snapped {
            validate_position(pose.position, &project.items[index].id)?;
            project.items[index].pose = pose;
            project_value["items"][index]["x"] = Value::from(pose.position.x);
            project_value["items"][index]["y"] = Value::from(pose.position.y);
            project_value["items"][index]["angle"] = Value::from(pose.angle);
        }
    }

    let layout = Layout::new(&project);
    let mut ports = ports::world_ports(&project, &layout, catalog);
    ports::recognize_joins(&mut ports, |_| false);
    let seams = ports::diagnose_seams(&project, &layout, &ports);
    let (no_table, overhangs) = coverage::overhangs(&project, &layout, catalog);
    let (counts, unresolved) = inventory(&project, &layout, catalog);
    let venue_issues = venue::diagnose(&project, &layout, catalog, venue.as_ref());
    let niltc_issues = niltc::diagnose(&project, &layout, &ports, venue.is_some());
    let analysis = Evaluation {
        project: &project_value,
        ports,
        seams,
        overhangs,
        no_table,
        counts,
        unresolved,
        venue_issues,
        niltc_issues,
    };
    serde_json::to_string(&analysis).map_err(EvaluationError::Output)
}

#[cfg(test)]
mod tests;
