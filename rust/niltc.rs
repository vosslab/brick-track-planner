use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::model::{
    Catalog, Draft, Edge, ItemKind, Layout, NiltcKind, Part, Point, Pose, Project, Table,
};
use crate::ports::WorldPort;

const GRID: f64 = 32.0;
const QUARTER_TURN: f64 = 90.0;
const TRACK_HEIGHT: i64 = 2;
const POSITION_TOLERANCE: f64 = 0.05;
const ANGLE_TOLERANCE: f64 = 0.25;
const GRID_TOLERANCE: f64 = 1e-6;
const MAX_SNAP: f64 = 3.0;
const S8_LENGTH: f64 = 8.0;

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Lane {
    Outer,
    Inner,
}

impl Lane {
    const ALL: [Self; 2] = [Self::Outer, Self::Inner];

    fn inset(self) -> f64 {
        match self {
            Self::Outer => 8.0,
            Self::Inner => 24.0,
        }
    }
}

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum NiltcIssue<'a> {
    TableGrid {
        table_id: &'a str,
    },
    BaseplateGrid {
        table_id: &'a str,
        item_id: &'a str,
    },
    MissingMainline {
        table_id: &'a str,
        lane: Lane,
    },
    MainlineHeight {
        table_id: &'a str,
        item_id: &'a str,
        lane: Lane,
    },
    ExitOffStandard {
        table_id: &'a str,
        exit_id: &'a str,
        lane: Lane,
    },
}

impl Edge {
    const ALL: [Self; 4] = [Self::North, Self::East, Self::South, Self::West];

    fn outward(self) -> f64 {
        match self {
            Self::North => 270.0,
            Self::East => 0.0,
            Self::South => 90.0,
            Self::West => 180.0,
        }
    }

    fn run(self, table: &Table) -> f64 {
        match self {
            Self::North | Self::South => table.width,
            Self::East | Self::West => table.depth,
        }
    }

    fn perpendicular_to(self, other: Self) -> bool {
        turn_between(self.outward(), other.outward(), 360.0).abs() == QUARTER_TURN
    }

    fn coordinates(self, table: &Table, point: Point) -> (f64, f64) {
        match self {
            Self::North => (point.x, point.y),
            Self::East => (point.y, table.width - point.x),
            Self::South => (point.x, table.depth - point.y),
            Self::West => (point.y, point.x),
        }
    }

    fn point(self, table: &Table, along: f64, inset: f64) -> Point {
        match self {
            Self::North => Point { x: along, y: inset },
            Self::East => Point {
                x: table.width - inset,
                y: along,
            },
            Self::South => Point {
                x: along,
                y: table.depth - inset,
            },
            Self::West => Point { x: inset, y: along },
        }
    }
}

fn turn_between(from: f64, to: f64, period: f64) -> f64 {
    (to - from + period / 2.0).rem_euclid(period) - period / 2.0
}

fn fronts(table: &Table) -> &[Edge] {
    match (table.niltc, table.fronts.as_slice()) {
        (Some(NiltcKind::Straight), [_]) => &table.fronts,
        (Some(NiltcKind::Corner), [a, b]) if a.perpendicular_to(*b) => &table.fronts,
        _ => &[],
    }
}

fn exit_front(table: &Table, exit: Edge) -> Option<Edge> {
    let fronts = fronts(table);
    if fronts.contains(&exit) {
        return None;
    }
    fronts
        .iter()
        .copied()
        .find(|front| exit.perpendicular_to(*front))
}

fn straight_route(part: &Part) -> Option<Pose> {
    part.ports.iter().enumerate().find_map(|(index, a)| {
        part.ports[index + 1..].iter().find_map(|b| {
            if a.connector_type != b.connector_type {
                return None;
            }
            let b_at_a = a.pose.to_local(b.pose);
            if (b_at_a.angle - 180.0).abs() > ANGLE_TOLERANCE
                || b_at_a.position.y.abs() > POSITION_TOLERANCE
                || b_at_a.position.x >= 0.0
            {
                return None;
            }
            Some(Pose {
                position: Point {
                    x: (a.pose.position.x + b.pose.position.x) / 2.0,
                    y: (a.pose.position.y + b.pose.position.y) / 2.0,
                },
                angle: a.pose.angle,
            })
        })
    })
}

pub(crate) fn snap(
    project: &Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
    draft: &Draft,
) -> Option<(usize, Pose)> {
    let [id] = draft.piece_ids.as_slice() else {
        return None;
    };
    let (index, item) = project
        .items
        .iter()
        .enumerate()
        .find(|(_, item)| &item.id == id)?;
    let table = layout.table(item.table_id.as_deref()?)?;
    let ItemKind::Track { part_id, .. } = &item.kind else {
        return None;
    };
    if !layout.visible(&item.layer_id) || !layout.visible(&table.layer_id) {
        return None;
    }
    let route = straight_route(catalog.part(part_id)?)?;
    let radius = draft.radius.min(MAX_SNAP);
    fronts(table)
        .iter()
        .flat_map(|&front| {
            let turn = turn_between(
                item.pose.angle + route.angle,
                front.outward() + QUARTER_TURN,
                180.0,
            );
            let angle = (item.pose.angle + turn).rem_euclid(360.0);
            let rotated = Pose { angle, ..item.pose };
            let center = rotated.transform(route.position);
            let (along, inset) = front.coordinates(table, center);
            Lane::ALL.into_iter().filter_map(move |lane| {
                let distance = (inset - lane.inset()).abs();
                if distance > radius || !(-radius..=front.run(table) + radius).contains(&along) {
                    return None;
                }
                let offset = front.point(table, along, lane.inset()).relative_to(center);
                let position = Point {
                    x: rotated.position.x + offset.x,
                    y: rotated.position.y + offset.y,
                };
                Some((distance, turn.abs(), Pose { angle, position }))
            })
        })
        .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.total_cmp(&b.1)))
        .map(|(_, _, pose)| (index, pose))
}

fn on_grid(pose: Pose, offset: f64) -> bool {
    [pose.position.x, pose.position.y].into_iter().all(|value| {
        let shifted = value - offset;
        (shifted - (shifted / GRID).round() * GRID).abs() <= GRID_TOLERANCE
    }) && turn_between(pose.angle, 0.0, QUARTER_TURN).abs() <= GRID_TOLERANCE
}

struct TablePort<'a, 'p> {
    port: &'p WorldPort<'a>,
    pose: Pose,
    reach: f64,
}

impl TablePort<'_, '_> {
    fn approach(&self, table: &Table, edge: Edge, front: Edge, lane: Lane) -> Option<f64> {
        let (along, inset) = edge.coordinates(table, self.pose.position);
        let (_, offset) = front.coordinates(table, self.pose.position);
        let angle_error = turn_between(self.pose.angle, edge.outward(), 360.0).abs();
        ((offset - lane.inset()).abs() <= POSITION_TOLERANCE
            && angle_error <= ANGLE_TOLERANCE
            && (-POSITION_TOLERANCE..=edge.run(table) + POSITION_TOLERANCE).contains(&along)
            && (-self.reach - POSITION_TOLERANCE..=front.run(table) + POSITION_TOLERANCE)
                .contains(&inset))
        .then_some(inset)
    }
}

pub(crate) fn diagnose<'a>(
    project: &'a Project,
    layout: &Layout<'a>,
    ports: &[WorldPort<'a>],
    in_venue: bool,
) -> Vec<NiltcIssue<'a>> {
    let mut issues = Vec::new();
    let tables = project
        .tables
        .iter()
        .filter(|table| table.niltc.is_some() && layout.visible(&table.layer_id));
    if tables.clone().next().is_none() {
        return issues;
    }
    let mut tracks = HashMap::new();
    for item in project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
    {
        let Some(table) = item.table_id.as_deref().and_then(|id| layout.table(id)) else {
            continue;
        };
        if table.niltc.is_none() || !layout.visible(&table.layer_id) {
            continue;
        }
        match &item.kind {
            ItemKind::Baseplate if !on_grid(item.pose, GRID / 2.0) => {
                issues.push(NiltcIssue::BaseplateGrid {
                    table_id: &table.id,
                    item_id: &item.id,
                });
            }
            ItemKind::Track { part_id, .. } => {
                let reach = if part_id.ends_with(":s08") {
                    S8_LENGTH
                } else {
                    0.0
                };
                tracks.insert(item.id.as_str(), (table, reach));
            }
            _ => {}
        }
    }
    let mut local_ports = HashMap::<_, Vec<_>>::new();
    for port in ports {
        if let Some(&(table, reach)) = tracks.get(port.piece_id) {
            let pose = table.pose.to_local(Pose {
                position: port.position,
                angle: port.angle,
            });
            local_ports
                .entry(table.id.as_str())
                .or_default()
                .push(TablePort { port, pose, reach });
        }
    }

    for table in tables {
        let table_id = table.id.as_str();
        if !in_venue && !on_grid(table.pose, 0.0) {
            issues.push(NiltcIssue::TableGrid { table_id });
        }
        let local_ports = local_ports.get(table_id).map_or(&[][..], Vec::as_slice);
        let approaches: Vec<_> = Edge::ALL
            .into_iter()
            .filter_map(|edge| exit_front(table, edge).map(|front| (edge, front)))
            .collect();
        let mut reserved_approaches = Vec::new();
        let mut exit_issues = Vec::new();
        for exit in project
            .sections
            .iter()
            .flat_map(|section| &section.exits)
            .filter(|exit| exit.table_id == table_id)
        {
            for (lane, endpoint) in [(Lane::Outer, &exit.outer), (Lane::Inner, &exit.inner)] {
                let standard = exit_front(table, exit.edge).is_some_and(|front| {
                    local_ports.iter().any(|local| {
                        local.port.piece_id == endpoint.piece_id
                            && local.port.port_id == endpoint.port_id
                            && local.port.height_plates == TRACK_HEIGHT
                            && local
                                .approach(table, exit.edge, front, lane)
                                .is_some_and(|inset| inset <= S8_LENGTH + POSITION_TOLERANCE)
                    })
                });
                if standard {
                    // A named approach may reserve space for the other table's S8.
                    reserved_approaches.push((exit.edge, lane));
                } else {
                    exit_issues.push(NiltcIssue::ExitOffStandard {
                        table_id,
                        exit_id: &exit.id,
                        lane,
                    });
                }
            }
        }

        for lane in Lane::ALL {
            let mut complete = approaches.len() == 2;
            let mut wrong_height = HashSet::new();
            for &(edge, front) in &approaches {
                let mut reaches_edge = reserved_approaches.contains(&(edge, lane));
                for local in local_ports {
                    if let Some(inset) = local.approach(table, edge, front, lane) {
                        reaches_edge |= inset <= POSITION_TOLERANCE;
                        let item_id = local.port.piece_id;
                        if local.port.height_plates != TRACK_HEIGHT && wrong_height.insert(item_id)
                        {
                            issues.push(NiltcIssue::MainlineHeight {
                                table_id,
                                item_id,
                                lane,
                            });
                        }
                    }
                }
                complete &= reaches_edge;
            }
            if !complete {
                issues.push(NiltcIssue::MissingMainline { table_id, lane });
            }
        }

        issues.extend(exit_issues);
    }
    issues
}

#[cfg(test)]
mod tests;
