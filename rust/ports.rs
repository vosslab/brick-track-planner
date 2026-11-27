use std::collections::HashMap;

use serde::Serialize;

use crate::model::{Catalog, ItemKind, Layout, Point, Project};

const JOIN_GAP: f64 = 0.05;
const JOIN_ANGLE: f64 = 0.25;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorldPort<'a> {
    pub piece_id: &'a str,
    pub port_id: &'a str,
    #[serde(flatten)]
    pub position: Point,
    pub angle: f64,
    #[serde(rename = "type")]
    pub connector_type: &'a str,
    pub joined: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub ambiguous: bool,
    #[serde(skip)]
    pub(crate) joined_to: Option<usize>,
}

impl WorldPort<'_> {
    fn alignment(&self, other: &Self) -> Alignment {
        Alignment {
            gap: self.position.distance_to(other.position),
            angle: turn_between(self.angle, other.angle + 180.0).abs(),
        }
    }

    fn matches(&self, other: &Self) -> bool {
        self.piece_id != other.piece_id && self.connector_type == other.connector_type
    }
}

fn turn_between(from: f64, to: f64) -> f64 {
    (to - from + 180.0).rem_euclid(360.0) - 180.0
}

pub(crate) fn world_ports<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &'a Catalog,
) -> Vec<WorldPort<'a>> {
    let mut ports = Vec::new();
    for item in project
        .items
        .iter()
        .filter(|item| layout.visible(&item.layer_id))
    {
        let ItemKind::Track { part_id, .. } = &item.kind else {
            continue;
        };
        let Some(part) = catalog.part(part_id) else {
            continue;
        };
        ports.extend(part.ports.iter().map(|port| {
            let world = item.pose.to_world(port.pose);
            WorldPort {
                piece_id: &item.id,
                port_id: &port.id,
                position: world.position,
                angle: world.angle,
                connector_type: &port.connector_type,
                joined: false,
                ambiguous: false,
                joined_to: None,
            }
        }));
    }
    ports
}

#[derive(Serialize)]
struct Alignment {
    gap: f64,
    angle: f64,
}

fn candidates(ports: &[WorldPort<'_>]) -> Vec<(usize, usize)> {
    // A join can only cross into one of the eight neighboring tolerance-sized
    // cells. Indexing as we walk the stable port order keeps output deterministic
    // and avoids comparing every connector in a large, sparse plan.
    let mut cells: HashMap<(i64, i64, &str), Vec<usize>> = HashMap::new();
    let mut matches = Vec::new();
    for (b, port) in ports.iter().enumerate() {
        let cell_x = (port.position.x / JOIN_GAP).floor() as i64;
        let cell_y = (port.position.y / JOIN_GAP).floor() as i64;
        for x in (cell_x - 1)..=(cell_x + 1) {
            for y in (cell_y - 1)..=(cell_y + 1) {
                let key = (x, y, port.connector_type);
                for &a in cells.get(&key).into_iter().flatten() {
                    if !ports[a].matches(port) {
                        continue;
                    }
                    let alignment = ports[a].alignment(&ports[b]);
                    if alignment.gap <= JOIN_GAP && alignment.angle <= JOIN_ANGLE {
                        matches.push((a, b));
                    }
                }
            }
        }
        cells
            .entry((cell_x, cell_y, port.connector_type))
            .or_default()
            .push(b);
    }
    matches.sort_unstable();
    matches
}

pub(crate) fn recognize_joins(ports: &mut [WorldPort<'_>]) {
    let matches = candidates(ports);
    let mut degree = vec![0; ports.len()];
    for &(a, b) in &matches {
        degree[a] += 1;
        degree[b] += 1;
    }
    for (a, b) in matches {
        if degree[a] == 1 && degree[b] == 1 {
            ports[a].joined = true;
            ports[b].joined = true;
            ports[a].joined_to = Some(b);
            ports[b].joined_to = Some(a);
        } else {
            ports[a].ambiguous = true;
            ports[b].ambiguous = true;
        }
    }
}

pub(crate) fn join_links(ports: &[WorldPort<'_>]) -> Vec<(usize, usize)> {
    ports
        .iter()
        .enumerate()
        .filter_map(|(a, port)| port.joined_to.filter(|&b| a < b).map(|b| (a, b)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{WorldPort, join_links, recognize_joins};
    use crate::model::Point;

    fn port(piece_id: &str, x: f64, y: f64, angle: f64) -> WorldPort<'_> {
        WorldPort {
            piece_id,
            port_id: "rail",
            position: Point { x, y },
            angle,
            connector_type: "regular",
            joined: false,
            ambiguous: false,
            joined_to: None,
        }
    }

    #[test]
    fn recognizes_a_join_across_spatial_cell_borders() {
        let mut ports = vec![
            port("left", 0.049, 0.0, 0.0),
            port("right", 0.051, 0.0, 180.0),
        ];
        recognize_joins(&mut ports);
        assert!(ports.iter().all(|port| port.joined));
        assert_eq!(join_links(&ports), vec![(0, 1)]);
    }

    #[test]
    fn marks_three_way_contacts_ambiguous() {
        let mut ports = vec![
            port("center", 0.0, 0.0, 0.0),
            port("one", 0.01, 0.0, 180.0),
            port("two", 0.02, 0.0, 180.0),
        ];
        recognize_joins(&mut ports);
        assert!(ports.iter().all(|port| port.ambiguous && !port.joined));
        assert!(join_links(&ports).is_empty());
    }
}
