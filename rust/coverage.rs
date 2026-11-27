use geo::algorithm::buffer::{BufferStyle, LineJoin};
use geo::{Area, BooleanOps, BoundingRect, Buffer, Coord, LineString, Polygon, Validation};
use serde::Serialize;

use crate::model::{
    Catalog, DesignArea, Edge, Item, ItemKind, Layout, Point, Pose, Project, outline_segments,
};

// Match the design-edge tolerance in the arrangement fit check.
const EDGE_TOLERANCE: f64 = 0.05;

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

pub(crate) fn valid_outline(area: &DesignArea) -> bool {
    let Some(outline) = &area.outline else {
        return area.front_lines.is_empty();
    };
    if !(4..=256).contains(&outline.len()) || area.front_lines.len() != area.fronts.len() {
        return false;
    }
    let segments = outline_segments(outline);
    let mut signed_area = 0.0;
    for ((start, end), (_, next)) in segments.clone().zip(segments.clone().cycle().skip(1)) {
        let horizontal = start.y == end.y;
        if horizontal == (start.x == end.x) || horizontal == (end.y == next.y) {
            return false;
        }
        signed_area += (start.x - end.x) * (start.y + end.y);
    }
    let support = polygon(Pose::IDENTITY, outline.iter().copied());
    let Some(bounds) = support.bounding_rect() else {
        return false;
    };
    signed_area > 0.0
        && (bounds.width() - area.width).abs() < 1e-8
        && (bounds.height() - area.depth).abs() < 1e-8
        && support.is_valid()
        && area.front_lines.iter().all(|(&edge, &coordinate)| {
            area.fronts.contains(&edge)
                && outline_segments(outline).any(|(start, end)| {
                    Edge::of_segment(start, end) == edge && edge.coordinate(start) == coordinate
                })
        })
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
    let rectangle = project.area.rectangle();
    let points = project.area.outline.as_deref().unwrap_or(&rectangle);
    let support = polygon(Pose::IDENTITY, points.iter().copied());
    let buffered = project.area.outline.as_ref().map(|_| {
        support.buffer_with_style(BufferStyle::new(EDGE_TOLERANCE).line_join(LineJoin::Miter(1.0)))
    });
    project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
        .filter_map(|item| {
            let footprint = item_polygon(item, catalog)?;
            let bounds = footprint.bounding_rect()?;
            let fits = if let Some(buffered) = &buffered {
                footprint.difference(buffered).unsigned_area() <= 1e-8
            } else {
                bounds.min().x >= -EDGE_TOLERANCE
                    && bounds.min().y >= -EDGE_TOLERANCE
                    && bounds.max().x <= project.area.width + EDGE_TOLERANCE
                    && bounds.max().y <= project.area.depth + EDGE_TOLERANCE
            };
            if fits {
                return None;
            }
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
