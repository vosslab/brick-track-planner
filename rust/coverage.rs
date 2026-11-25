use geo::{Area, BooleanOps, Coord, LineString, MultiPolygon, Polygon};
use serde::Serialize;

use crate::model::{Catalog, Item, ItemKind, Layout, Point, Pose, Project};

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
            let point = pose.transform(point);
            Coord {
                x: point.x,
                y: point.y,
            }
        })
        .collect();
    Polygon::new(ring, vec![])
}

fn area_polygon(project: &Project) -> Polygon<f64> {
    polygon(
        Pose::IDENTITY,
        [
            Point { x: 0.0, y: 0.0 },
            Point {
                x: project.area.width,
                y: 0.0,
            },
            Point {
                x: project.area.width,
                y: project.area.depth,
            },
            Point {
                x: 0.0,
                y: project.area.depth,
            },
        ],
    )
}

fn item_polygon(item: &Item, catalog: &Catalog) -> Option<Polygon<f64>> {
    Some(match &item.kind {
        ItemKind::Track { part_id, .. } => {
            polygon(item.pose, catalog.part(part_id)?.footprint.iter().copied())
        }
        ItemKind::Unresolved { width, depth, .. } => polygon(
            Pose {
                angle: 0.0,
                ..item.pose
            },
            [
                Point {
                    x: -width / 2.0,
                    y: -depth / 2.0,
                },
                Point {
                    x: width / 2.0,
                    y: -depth / 2.0,
                },
                Point {
                    x: width / 2.0,
                    y: depth / 2.0,
                },
                Point {
                    x: -width / 2.0,
                    y: depth / 2.0,
                },
            ],
        ),
    })
}

pub(crate) fn overhangs<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
) -> Vec<Overhang<'a>> {
    let support = MultiPolygon(vec![area_polygon(project)]);
    project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
        .filter_map(|item| {
            let footprint = item_polygon(item, catalog)?;
            let rings: Vec<Vec<Point>> = footprint
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
        .collect()
}
