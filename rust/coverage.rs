use geo::{Area, BooleanOps, Coord, LineString, MultiPolygon, Polygon};
use serde::Serialize;

use crate::model::{Catalog, Item, ItemKind, Layout, Point, Pose, Project, Table};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Overhang<'a> {
    pub piece_id: &'a str,
    pub rings: Vec<Vec<Point>>,
}

fn polygon(pose: Pose, contour: impl IntoIterator<Item = Point>) -> Polygon<f64> {
    let ring: LineString<f64> = contour
        .into_iter()
        .map(|point| {
            let world = pose.transform(point);
            Coord {
                x: world.x,
                y: world.y,
            }
        })
        .collect();
    Polygon::new(ring, vec![])
}

fn rect(left: f64, top: f64, width: f64, depth: f64) -> [Point; 4] {
    [
        Point { x: left, y: top },
        Point {
            x: left + width,
            y: top,
        },
        Point {
            x: left + width,
            y: top + depth,
        },
        Point {
            x: left,
            y: top + depth,
        },
    ]
}

pub(crate) fn table_polygon(table: &Table) -> Polygon<f64> {
    polygon(table.pose, rect(0.0, 0.0, table.width, table.depth))
}

pub(crate) fn centered_rect(pose: Pose, width: f64, depth: f64) -> Polygon<f64> {
    polygon(pose, rect(-width / 2.0, -depth / 2.0, width, depth))
}

pub(crate) fn item_polygon(
    item: &Item,
    layout: &Layout<'_>,
    catalog: &Catalog,
) -> Option<Polygon<f64>> {
    let world = layout.parent_pose(item).to_world(item.pose);
    Some(match &item.kind {
        ItemKind::Track { part_id, .. } => {
            polygon(world, catalog.part(part_id)?.footprint.iter().copied())
        }
        ItemKind::Baseplate => centered_rect(world, 32.0, 32.0),
        ItemKind::Unresolved { width, depth, .. } => centered_rect(world, *width, *depth),
    })
}

pub(crate) fn overhangs<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
) -> (bool, Vec<Overhang<'a>>) {
    let mut visible_tables = project
        .tables
        .iter()
        .filter(|table| layout.visible(&table.layer_id));
    let Some(first) = visible_tables.next() else {
        return (true, Vec::new());
    };
    let support = visible_tables.fold(
        MultiPolygon(vec![table_polygon(first)]),
        |current, table| current.union(&table_polygon(table)),
    );
    let unsupported = project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
        .filter_map(|item| {
            let footprint = item_polygon(item, layout, catalog)?;
            let rings: Vec<_> = footprint
                .difference(&support)
                .0
                .iter()
                .filter(|polygon| polygon.unsigned_area() > 1e-8)
                .flat_map(|polygon| polygon.rings())
                .map(|ring| {
                    ring.coords()
                        .map(|coord| Point {
                            x: coord.x,
                            y: coord.y,
                        })
                        .collect()
                })
                .collect();
            (!rings.is_empty()).then_some(Overhang {
                piece_id: &item.id,
                rings,
            })
        })
        .collect();
    (false, unsupported)
}
