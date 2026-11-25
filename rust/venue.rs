use geo::{Area, BooleanOps, BoundingRect, Polygon};
use serde::Serialize;

use crate::coverage;
use crate::model::{Catalog, Layout, Pose, Project, Venue};

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum VenueIssue<'a> {
    TableOverlap {
        entity_id: &'a str,
        other_id: &'a str,
    },
    OutsideVenue {
        entity_id: &'a str,
    },
    Keepout {
        entity_id: &'a str,
        other_id: &'a str,
    },
}

fn outside(polygon: &Polygon<f64>, venue: &Venue) -> bool {
    // Allow floating-point error in the transformed corners of a flush table.
    let margin = 8.0 * f64::EPSILON * venue.width.max(venue.depth);
    polygon.exterior().coords().any(|coord| {
        coord.x < -margin
            || coord.y < -margin
            || coord.x > venue.width + margin
            || coord.y > venue.depth + margin
    })
}

fn positive_overlap(a: &Polygon<f64>, b: &Polygon<f64>) -> bool {
    let (Some(ar), Some(br)) = (a.bounding_rect(), b.bounding_rect()) else {
        return false;
    };
    ar.min().x < br.max().x
        && br.min().x < ar.max().x
        && ar.min().y < br.max().y
        && br.min().y < ar.max().y
        && a.intersection(b).unsigned_area() > 0.0
}

pub(crate) fn diagnose<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
    venue: Option<&'a Venue>,
) -> Vec<VenueIssue<'a>> {
    if project.version == 1 {
        return Vec::new();
    }
    let tables: Vec<_> = project
        .tables
        .iter()
        .filter(|table| layout.visible(&table.layer_id))
        .map(|table| (table.id.as_str(), coverage::table_polygon(table)))
        .collect();
    let mut issues = Vec::new();
    for (i, (entity_id, polygon)) in tables.iter().enumerate() {
        for (other_id, other) in &tables[i + 1..] {
            if positive_overlap(polygon, other) {
                issues.push(VenueIssue::TableOverlap {
                    entity_id,
                    other_id,
                });
            }
        }
    }
    let Some(venue) = venue else {
        return issues;
    };
    for (entity_id, polygon) in &tables {
        if outside(polygon, venue) {
            issues.push(VenueIssue::OutsideVenue { entity_id });
        }
    }
    if venue.keepouts.is_empty() {
        return issues;
    }
    let keepouts: Vec<_> = venue
        .keepouts
        .iter()
        .map(|keepout| {
            let pose = Pose {
                position: keepout.center,
                ..Pose::IDENTITY
            };
            (
                keepout.id.as_str(),
                coverage::centered_rect(pose, keepout.width, keepout.depth),
            )
        })
        .collect();
    let items = project.items.iter().filter_map(|item| {
        if !layout.visible(&item.layer_id) {
            return None;
        }
        let polygon = coverage::item_polygon(item, layout, catalog)?;
        Some((item.id.as_str(), polygon))
    });
    for (entity_id, polygon) in tables.into_iter().chain(items) {
        for (other_id, keepout) in &keepouts {
            if positive_overlap(&polygon, keepout) {
                issues.push(VenueIssue::Keepout {
                    entity_id,
                    other_id,
                });
            }
        }
    }
    issues
}
