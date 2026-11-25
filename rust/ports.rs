use std::cmp::Ordering;
use std::collections::HashSet;

use serde::Serialize;

use crate::model::{Catalog, Draft, ItemKind, Layout, Pair, Point, Pose, Project, Seam, Table};

const JOIN_GAP: f64 = 0.05;
const JOIN_ANGLE: f64 = 0.25;
const SNAP_ANGLE: f64 = 22.5;
const SNAP_TIE_EPSILON: f64 = 1e-8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorldPort<'a> {
    pub piece_id: &'a str,
    pub port_id: &'a str,
    #[serde(flatten)]
    pub position: Point,
    pub angle: f64,
    #[serde(rename = "type")]
    connector_type: &'a str,
    pub height_plates: i64,
    pub joined: bool,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub ambiguous: bool,
}

impl WorldPort<'_> {
    fn alignment(&self, other: &Self) -> Alignment {
        Alignment {
            gap: self.position.distance_to(other.position),
            angle: turn_between(self.angle, other.angle + 180.0).abs(),
            height: self.height_plates.abs_diff(other.height_plates),
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
        let ItemKind::Track {
            part_id,
            height_plates,
        } = &item.kind
        else {
            continue;
        };
        let Some(part) = catalog.part(part_id) else {
            continue;
        };
        let pose = layout.parent_pose(item).to_world(item.pose);
        ports.extend(part.ports.iter().map(|port| {
            let world = pose.to_world(port.pose);
            WorldPort {
                piece_id: &item.id,
                port_id: &port.id,
                position: world.position,
                angle: world.angle,
                connector_type: &port.connector_type,
                height_plates: *height_plates,
                joined: false,
                ambiguous: false,
            }
        }));
    }
    ports
}

#[derive(Serialize)]
struct Alignment {
    gap: f64,
    angle: f64,
    height: u64,
}

impl Alignment {
    fn compare_snap(&self, other: &Self) -> Ordering {
        for (a, b) in [(self.gap, other.gap), (self.angle, other.angle)] {
            if (a - b).abs() > SNAP_TIE_EPSILON {
                return a.total_cmp(&b);
            }
        }
        Ordering::Equal
    }
}

pub(crate) fn recognize_joins(ports: &mut [WorldPort<'_>], group: impl Fn(&str) -> bool) {
    let mut candidates = Vec::new();
    let mut degree = vec![0_usize; ports.len()];
    let x = |point: Point| point.x;
    let y = |point: Point| point.y;
    let spread = |coordinate: fn(Point) -> f64| {
        let (min, max) = ports
            .iter()
            .map(|port| coordinate(port.position))
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
                (min.min(value), max.max(value))
            });
        max - min
    };
    let sweep_y = spread(y) > spread(x);
    let axis: fn(Point) -> f64 = if sweep_y { y } else { x };
    let mut by_axis: Vec<_> = (0..ports.len()).collect();
    by_axis.sort_by(|&left, &right| {
        axis(ports[left].position).total_cmp(&axis(ports[right].position))
    });
    for (rank, &a) in by_axis.iter().enumerate() {
        let start = axis(ports[a].position);
        for &b in &by_axis[rank + 1..] {
            if axis(ports[b].position) - start > JOIN_GAP {
                break;
            }
            if !ports[a].matches(&ports[b]) || group(ports[a].piece_id) != group(ports[b].piece_id)
            {
                continue;
            }
            // Keep the X sweep's argument order so rounding at the angle limit stays consistent.
            let x_order = || {
                x(ports[a].position)
                    .total_cmp(&x(ports[b].position))
                    .then(a.cmp(&b))
            };
            let (first, second) = if sweep_y && x_order().is_gt() {
                (&ports[b], &ports[a])
            } else {
                (&ports[a], &ports[b])
            };
            let alignment = first.alignment(second);
            if alignment.gap <= JOIN_GAP && alignment.angle <= JOIN_ANGLE && alignment.height == 0 {
                candidates.push((a, b));
                degree[a] += 1;
                degree[b] += 1;
            }
        }
    }
    for (a, b) in candidates {
        if degree[a] == 1 && degree[b] == 1 {
            ports[a].joined = true;
            ports[b].joined = true;
        } else {
            ports[a].ambiguous = true;
            ports[b].ambiguous = true;
        }
    }
}

pub(crate) fn snap(
    project: &Project,
    layout: &Layout<'_>,
    catalog: &Catalog,
    draft: &Draft,
) -> Vec<(usize, Pose)> {
    let moving: HashSet<_> = draft.piece_ids.iter().map(String::as_str).collect();
    let mut ports = world_ports(project, layout, catalog);
    recognize_joins(&mut ports, |id| moving.contains(id));
    let (selected, fixed): (Vec<_>, Vec<_>) = ports
        .iter()
        .filter(|port| !port.joined && !port.ambiguous)
        .partition(|port| moving.contains(port.piece_id));
    let candidates = selected
        .into_iter()
        .flat_map(|a| fixed.iter().map(move |&b| (a, b, a.alignment(b))))
        .filter(|(a, b, alignment)| {
            a.matches(b)
                && alignment.height == 0
                && alignment.angle <= SNAP_ANGLE
                && alignment.gap <= draft.radius
        });
    let mut best: Option<(Point, Pose, Alignment)> = None;
    let mut used_ports = HashSet::new();
    let mut ambiguous = false;
    for (from, to, alignment) in candidates {
        let endpoints = [(from.piece_id, from.port_id), (to.piece_id, to.port_id)];
        match best.as_ref().map(|(origin, transform, current)| {
            (alignment.compare_snap(current), origin, transform)
        }) {
            None | Some((Ordering::Less, _, _)) => {
                let transform = Pose {
                    position: to.position,
                    angle: turn_between(from.angle, to.angle + 180.0),
                };
                best = Some((from.position, transform, alignment));
                used_ports.clear();
                used_ports.extend(endpoints);
                ambiguous = false;
            }
            Some((Ordering::Equal, origin, transform)) if !ambiguous => {
                let angle = turn_between(from.angle, to.angle + 180.0);
                let rotation = Pose {
                    angle: transform.angle,
                    ..Pose::IDENTITY
                };
                let expected = rotation.transform(from.position.relative_to(*origin));
                let actual = to.position.relative_to(transform.position);
                let same_transform = turn_between(transform.angle, angle).abs() <= SNAP_TIE_EPSILON
                    && expected.distance_to(actual) <= SNAP_TIE_EPSILON;
                ambiguous =
                    !same_transform || !endpoints.into_iter().all(|end| used_ports.insert(end));
            }
            Some(_) => {}
        }
    }
    let Some((origin, transform, _)) = best.filter(|_| !ambiguous) else {
        return Vec::new();
    };
    project
        .items
        .iter()
        .enumerate()
        .filter(|(_, item)| moving.contains(item.id.as_str()) && layout.visible(&item.layer_id))
        .map(|(index, item)| {
            let parent = layout.parent_pose(item);
            let mut world = parent.to_world(item.pose);
            world.position = world.position.relative_to(origin);
            (index, parent.to_local(transform.to_world(world)))
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum SeamStatus {
    Joined,
    Misaligned,
    Height,
    Missing,
    Hidden,
}

#[derive(Serialize)]
struct SeamDisposition {
    status: SeamStatus,
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    alignment: Option<Alignment>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    ambiguous: bool,
}

impl SeamDisposition {
    fn unmeasured(status: SeamStatus) -> Self {
        Self {
            status,
            alignment: None,
            ambiguous: false,
        }
    }
}

#[derive(Serialize)]
pub(crate) struct EvaluatedSeam<'a> {
    id: &'a str,
    outer: SeamDisposition,
    inner: SeamDisposition,
}

fn seam_pair(
    pair: &Pair,
    sections: [&Table; 2],
    project: &Project,
    layout: &Layout<'_>,
    ports: &[WorldPort<'_>],
) -> SeamDisposition {
    if sections
        .iter()
        .any(|table| !layout.visible(&table.layer_id))
    {
        return SeamDisposition::unmeasured(SeamStatus::Hidden);
    }
    let items = [(&pair.a, sections[0]), (&pair.b, sections[1])].map(|(endpoint, table)| {
        project.items.iter().find(|item| {
            item.id == endpoint.piece_id && item.table_id.as_deref() == Some(table.id.as_str())
        })
    });
    let [Some(item_a), Some(item_b)] = items else {
        return SeamDisposition::unmeasured(SeamStatus::Missing);
    };
    if [item_a, item_b]
        .iter()
        .any(|item| !layout.visible(&item.layer_id))
    {
        return SeamDisposition::unmeasured(SeamStatus::Hidden);
    }
    let [Some(a), Some(b)] = [&pair.a, &pair.b].map(|endpoint| {
        ports
            .iter()
            .find(|port| port.piece_id == endpoint.piece_id && port.port_id == endpoint.port_id)
    }) else {
        return SeamDisposition::unmeasured(SeamStatus::Missing);
    };
    let alignment = a.alignment(b);
    let ambiguous = a.ambiguous || b.ambiguous;
    let status =
        if ambiguous || !a.matches(b) || alignment.gap > JOIN_GAP || alignment.angle > JOIN_ANGLE {
            SeamStatus::Misaligned
        } else if alignment.height != 0 {
            SeamStatus::Height
        } else {
            SeamStatus::Joined
        };
    SeamDisposition {
        status,
        alignment: Some(alignment),
        ambiguous,
    }
}

pub(crate) fn diagnose_seams<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    ports: &[WorldPort<'_>],
) -> Vec<EvaluatedSeam<'a>> {
    project
        .seams
        .iter()
        .map(
            |Seam {
                 id,
                 table_a,
                 table_b,
                 outer,
                 inner,
             }| {
                let sections = [table_a, table_b].map(|table_id| layout.table(table_id));
                let pair = |pair| {
                    let [Some(a), Some(b)] = sections else {
                        return SeamDisposition::unmeasured(SeamStatus::Missing);
                    };
                    seam_pair(pair, [a, b], project, layout, ports)
                };
                EvaluatedSeam {
                    id,
                    outer: pair(outer),
                    inner: pair(inner),
                }
            },
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use crate::evaluation::evaluate;

    use super::{Point, WorldPort, recognize_joins};

    #[test]
    fn sweep_order_preserves_rounding_at_the_join_angle_limit() {
        let mut ports = [
            ("a", 0.01, 213.58089108646206),
            ("b", 0.0, 33.83089108646209),
        ]
        .map(|(piece_id, y, angle)| WorldPort {
            piece_id,
            port_id: "end",
            position: Point { x: 0.0, y },
            angle,
            connector_type: "regular",
            height_plates: 0,
            joined: false,
            ambiguous: false,
        });
        recognize_joins(&mut ports, |_| false);
        assert!(ports.iter().all(|port| !port.joined));
    }

    #[test]
    fn agrees_on_a_rigid_group_snap_only_when_all_tied_ports_match_one_to_one() {
        for (axis, angle) in [("x", 0), ("y", 90)] {
            for (fixed_end, duplicate, expected_shift) in
                [(48.0, false, -0.5), (49.0, false, 0.0), (48.0, true, 0.0)]
            {
                let mut positions = vec![0.0, 16.5, 32.5, fixed_end];
                if duplicate {
                    positions.push(fixed_end);
                }
                let items: Vec<_> = positions
                    .iter()
                    .enumerate()
                    .map(|(index, position)| {
                        let mut item = json!({
                            "id": index.to_string(), "kind": "track", "partId": "lego:9v-s16",
                            "layerId": "layout", "x": 0, "y": 0, "angle": angle,
                            "heightPlates": 0
                        });
                        item[axis] = json!(position);
                        item
                    })
                    .collect();
                let project = json!({
                    "version": 1, "layers": [{"id": "layout", "visible": true}],
                    "tables": [], "items": items, "seams": []
                });
                let draft = r#"{"pieceIds":["1","2"],"radius":2}"#;
                let result: Value =
                    serde_json::from_str(&evaluate(&project.to_string(), draft).unwrap()).unwrap();
                for index in [1, 2] {
                    let position = result["project"]["items"][index][axis].as_f64().unwrap();
                    assert!((position - positions[index] - expected_shift).abs() < 1e-8);
                }
                let joined = result["ports"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|port| port["joined"] == true)
                    .count();
                assert_eq!(joined, if expected_shift == 0.0 { 2 } else { 6 });
            }
        }
    }

    #[test]
    fn seam_endpoints_must_belong_to_their_bound_tables() {
        let mut project: Value =
            serde_json::from_str(include_str!("../examples/two-section.btp.json")).unwrap();
        let mut replacement = project["tables"][0].clone();
        replacement["id"] = json!("replacement");
        project["tables"].as_array_mut().unwrap().push(replacement);
        project["seams"][0]["tableA"] = json!("replacement");

        let result: Value =
            serde_json::from_str(&evaluate(&project.to_string(), "").unwrap()).unwrap();
        assert_eq!(result["seams"][0]["outer"]["status"], "missing");
        assert_eq!(result["seams"][0]["inner"]["status"], "missing");
        assert_eq!(result["project"], project);

        project["items"][0]["tableId"] = json!("replacement");
        let repaired: Value =
            serde_json::from_str(&evaluate(&project.to_string(), "").unwrap()).unwrap();
        assert_eq!(repaired["seams"][0]["outer"]["status"], "joined");
        assert_eq!(repaired["seams"][0]["inner"]["status"], "missing");
    }
}
