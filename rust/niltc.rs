use serde::Serialize;
use std::collections::HashSet;

use crate::model::{Edge, Endpoint, ItemKind, NiltcKind, Project};
use crate::ports::WorldPort;
use crate::routes::{self, RoutePath};

const TOLERANCE: f64 = 0.05;
const TRACK_HEIGHT: i64 = 2;
const MIN_EVENT_STRAIGHT: f64 = 16.0;
const AFTER_S_CURVE_STRAIGHT: f64 = 64.0;

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Lane {
    Outer,
    Inner,
}

#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub(crate) enum NiltcIssue<'a> {
    MissingMainline {
        lane: Lane,
    },
    MainlineHeight {
        item_id: &'a str,
        lane: Lane,
    },
    ExitOffStandard {
        exit_id: &'a str,
        lane: Lane,
    },
    MainlineRadius {
        item_id: &'a str,
        lane: Lane,
        expected_radius: f64,
        actual_radius: f64,
        minimum_radius: bool,
    },
    MainlineCurveSweep {
        lane: Lane,
        actual_degrees: f64,
    },
    MainlineEventSpacing {
        lane: Lane,
        previous_item_id: &'a str,
        item_id: &'a str,
        required_studs: f64,
        actual_studs: f64,
    },
}

fn lane_inset(lane: Lane) -> f64 {
    match lane {
        Lane::Outer => 8.0,
        Lane::Inner => 24.0,
    }
}

fn outward_angle(edge: Edge) -> f64 {
    match edge {
        Edge::North => 270.0,
        Edge::East => 0.0,
        Edge::South => 90.0,
        Edge::West => 180.0,
    }
}

fn is_perpendicular(first: Edge, second: Edge) -> bool {
    matches!(
        (first, second),
        (Edge::North | Edge::South, Edge::East | Edge::West)
            | (Edge::East | Edge::West, Edge::North | Edge::South)
    )
}

fn on_boundary(port: &WorldPort<'_>, project: &Project, edge: Edge) -> bool {
    match edge {
        Edge::North => port.position.y.abs() <= TOLERANCE,
        Edge::East => (port.position.x - project.area.width).abs() <= TOLERANCE,
        Edge::South => (port.position.y - project.area.depth).abs() <= TOLERANCE,
        Edge::West => port.position.x.abs() <= TOLERANCE,
    }
}

fn distance_from_front(port: &WorldPort<'_>, project: &Project, front: Edge) -> f64 {
    match front {
        Edge::North => port.position.y,
        Edge::East => project.area.width - port.position.x,
        Edge::South => project.area.depth - port.position.y,
        Edge::West => port.position.x,
    }
}

fn turn_between(from: f64, to: f64) -> f64 {
    (to - from + 180.0).rem_euclid(360.0) - 180.0
}

fn expected(port: &WorldPort<'_>, project: &Project, edge: Edge, lane: Lane) -> bool {
    port.connector_type == "regular"
        && on_boundary(port, project, edge)
        && turn_between(port.angle, outward_angle(edge)).abs() <= 0.25
        && project
            .area
            .fronts
            .iter()
            .copied()
            .filter(|front| is_perpendicular(*front, edge))
            .any(|front| {
                (distance_from_front(port, project, front) - lane_inset(lane)).abs() <= TOLERANCE
            })
}

fn find_endpoint<'a>(ports: &'a [WorldPort<'a>], endpoint: &Endpoint) -> Option<&'a WorldPort<'a>> {
    ports
        .iter()
        .find(|port| port.piece_id == endpoint.piece_id && port.port_id == endpoint.port_id)
}

fn diagnose_route<'a>(
    project: &'a Project,
    lane: Lane,
    corner: bool,
    route: &[routes::DirectedRoute<'_, 'a>],
    issues: &mut Vec<NiltcIssue<'a>>,
) {
    let expected_radius = if corner {
        match lane {
            Lane::Outer => 120.0,
            Lane::Inner => 104.0,
        }
    } else {
        104.0
    };
    let mut heights_reported = HashSet::new();
    // item, event kind, signed curve turn, an S-curve has just ended
    let mut previous_event: Option<(&str, &str, f64, bool)> = None;
    let mut distance_since_event = 0.0;
    let mut curve_turn = 0.0;
    for step in route.iter().filter(|step| step.is_internal()) {
        let item_id = step.item_id();
        if heights_reported.insert(item_id)
            && project
                .items
                .iter()
                .find(|item| item.id == item_id)
                .is_some_and(|item| {
                    !matches!(
                        &item.kind,
                        ItemKind::Track {
                            height_plates: 2,
                            ..
                        }
                    )
                })
        {
            issues.push(NiltcIssue::MainlineHeight { item_id, lane });
        }
        let event = step.event();
        if let Some(event) = event {
            let turn = step.turn();
            if event == "curve" {
                curve_turn += turn;
                let actual_radius = step.radius().unwrap_or(0.0);
                let wrong_radius = if corner {
                    (actual_radius - expected_radius).abs() > TOLERANCE
                } else {
                    actual_radius + TOLERANCE < expected_radius
                };
                if wrong_radius {
                    issues.push(NiltcIssue::MainlineRadius {
                        item_id,
                        lane,
                        expected_radius,
                        actual_radius,
                        minimum_radius: !corner,
                    });
                }
            }
            if let Some((previous_item_id, previous_event_name, previous_turn, after_s_curve)) =
                previous_event
            {
                let contiguous_curves = previous_event_name == "curve"
                    && event == "curve"
                    && distance_since_event <= TOLERANCE;
                if contiguous_curves && previous_turn * turn > 0.0 {
                    // One ordinary bend can use several arc pieces.
                    previous_event = Some((item_id, event, turn, after_s_curve));
                } else if contiguous_curves && previous_turn * turn < 0.0 {
                    // The reversal completes an S-curve. Its 20-inch clearance
                    // starts after the last opposite-sweep arc.
                    previous_event = Some((item_id, event, turn, true));
                } else {
                    let required_studs = if after_s_curve {
                        AFTER_S_CURVE_STRAIGHT
                    } else {
                        MIN_EVENT_STRAIGHT
                    };
                    if distance_since_event + TOLERANCE < required_studs {
                        issues.push(NiltcIssue::MainlineEventSpacing {
                            lane,
                            previous_item_id,
                            item_id,
                            required_studs,
                            actual_studs: distance_since_event,
                        });
                    }
                    previous_event = Some((item_id, event, turn, false));
                }
            } else {
                previous_event = Some((item_id, event, turn, false));
            }
            distance_since_event = 0.0;
        } else if previous_event.is_some() {
            distance_since_event += step.length();
        }
    }
    if corner && (curve_turn.abs() - 90.0).abs() > 0.25 {
        issues.push(NiltcIssue::MainlineCurveSweep {
            lane,
            actual_degrees: curve_turn,
        });
    }
}

pub(crate) fn diagnose<'a>(
    project: &'a Project,
    ports: &[WorldPort<'_>],
    routes: &[RoutePath<'a>],
) -> Vec<NiltcIssue<'a>> {
    if project.area.niltc.is_none() {
        return Vec::new();
    }
    let mut issues = Vec::new();
    for exit in &project.area.exits {
        for (lane, endpoint) in [(Lane::Outer, &exit.outer), (Lane::Inner, &exit.inner)] {
            let Some(port) = find_endpoint(ports, endpoint) else {
                issues.push(NiltcIssue::ExitOffStandard {
                    exit_id: &exit.id,
                    lane,
                });
                continue;
            };
            if port.height_plates != TRACK_HEIGHT {
                issues.push(NiltcIssue::MainlineHeight {
                    item_id: &endpoint.piece_id,
                    lane,
                });
            }
            if !expected(port, project, exit.edge, lane) {
                issues.push(NiltcIssue::ExitOffStandard {
                    exit_id: &exit.id,
                    lane,
                });
            }
        }
    }
    let needed_exits = match project.area.niltc {
        Some(NiltcKind::Straight) => 2,
        Some(NiltcKind::Corner) => 2,
        None => 0,
    };
    for lane in [Lane::Outer, Lane::Inner] {
        let valid: Vec<_> = project
            .area
            .exits
            .iter()
            .filter(|exit| {
                let end = match lane {
                    Lane::Outer => &exit.outer,
                    Lane::Inner => &exit.inner,
                };
                find_endpoint(ports, end).is_some_and(|port| {
                    expected(port, project, exit.edge, lane) && port.height_plates == TRACK_HEIGHT
                })
            })
            .collect();
        let route = valid.first().zip(valid.get(1)).map(|(first, second)| {
            let start = match lane {
                Lane::Outer => &first.outer,
                Lane::Inner => &first.inner,
            };
            let end = match lane {
                Lane::Outer => &second.outer,
                Lane::Inner => &second.inner,
            };
            routes::trace_path(routes, start, end)
        });
        let connected = route.as_ref().is_some_and(|route| !route.is_empty());
        if valid.len() < needed_exits || !connected {
            issues.push(NiltcIssue::MissingMainline { lane });
        } else if let Some(route) = route {
            diagnose_route(
                project,
                lane,
                project.area.niltc == Some(NiltcKind::Corner),
                &route,
                &mut issues,
            );
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::{Lane, diagnose_route, expected};
    use crate::evaluate;
    use crate::model::{Catalog, Edge, Layout, Point, Project};
    use crate::ports::WorldPort;
    use crate::routes::{DirectedRoute, trace};

    const STRAIGHT: &str = include_str!("../examples/member-straight.btp.json");
    const CORNER: &str = include_str!("../examples/member-corner.btp.json");

    fn analyze(project: &Value) -> Value {
        serde_json::from_str(&evaluate(&project.to_string()).unwrap()).unwrap()
    }

    fn area(fronts: Value) -> Project {
        serde_json::from_value(json!({
            "version": 3,
            "name": "orientation fixture",
            "area": {"width": 200, "depth": 160, "fronts": fronts, "niltc": "straight", "exits": []},
            "layers": [],
            "items": []
        }))
        .unwrap()
    }

    fn port(x: f64, y: f64, angle: f64, connector_type: &'static str) -> WorldPort<'static> {
        WorldPort {
            piece_id: "piece",
            port_id: "port",
            position: Point { x, y },
            angle,
            connector_type,
            height_plates: 2,
            joined: false,
            ambiguous: false,
            joined_to: None,
        }
    }

    #[test]
    fn accepts_straight_exits_for_every_public_edge() {
        for (front, edge, x, y, angle) in [
            ("north", Edge::East, 200.0, 8.0, 0.0),
            ("east", Edge::South, 192.0, 160.0, 90.0),
            ("south", Edge::West, 0.0, 152.0, 180.0),
            ("west", Edge::North, 8.0, 0.0, 270.0),
        ] {
            let project = area(json!([front]));
            assert!(expected(
                &port(x, y, angle, "regular"),
                &project,
                edge,
                Lane::Outer
            ));
            let (inner_x, inner_y) = match front {
                "north" => (200.0, 24.0),
                "east" => (176.0, 160.0),
                "south" => (0.0, 136.0),
                "west" => (24.0, 0.0),
                _ => unreachable!(),
            };
            assert!(expected(
                &port(inner_x, inner_y, angle, "regular"),
                &project,
                edge,
                Lane::Inner
            ));
        }
    }

    #[test]
    fn accepts_both_handoff_edges_for_every_public_corner() {
        for (fronts, exits) in [
            (
                json!(["north", "west"]),
                [
                    (Edge::East, 200.0, 8.0, 0.0),
                    (Edge::South, 8.0, 160.0, 90.0),
                ],
            ),
            (
                json!(["north", "east"]),
                [
                    (Edge::West, 0.0, 8.0, 180.0),
                    (Edge::South, 192.0, 160.0, 90.0),
                ],
            ),
            (
                json!(["east", "south"]),
                [
                    (Edge::North, 192.0, 0.0, 270.0),
                    (Edge::West, 0.0, 152.0, 180.0),
                ],
            ),
            (
                json!(["south", "west"]),
                [
                    (Edge::North, 8.0, 0.0, 270.0),
                    (Edge::East, 200.0, 152.0, 0.0),
                ],
            ),
        ] {
            let project = area(fronts);
            for (edge, x, y, angle) in exits {
                assert!(expected(
                    &port(x, y, angle, "regular"),
                    &project,
                    edge,
                    Lane::Outer
                ));
            }
        }
    }

    fn spacing_diagnostics(s_curve: bool, straight_count: usize) -> Vec<(f64, f64)> {
        let mut project: Project = serde_json::from_str(STRAIGHT).unwrap();
        let mut parts = vec!["trixbrix:r104"];
        if s_curve {
            parts.push("trixbrix:r104");
        }
        parts.extend(std::iter::repeat_n("trixbrix:s08", straight_count));
        parts.push("trixbrix:r104");
        project.items = parts
            .into_iter()
            .enumerate()
            .map(|(index, part_id)| {
                serde_json::from_value(json!({
                    "id": index.to_string(), "kind": "track", "partId": part_id,
                    "layerId": "layout", "x": 0, "y": 0, "angle": 0, "heightPlates": 2
                }))
                .unwrap()
            })
            .collect();
        let links = trace(
            &project,
            &Layout::new(&project),
            Catalog::load().unwrap(),
            &[],
        );
        let route = links
            .iter()
            .enumerate()
            .map(|(index, path)| DirectedRoute {
                path,
                reversed: s_curve && index == 1,
            })
            .collect::<Vec<_>>();
        let mut issues = Vec::new();
        diagnose_route(&project, Lane::Inner, false, &route, &mut issues);
        issues
            .into_iter()
            .filter_map(|issue| match issue {
                super::NiltcIssue::MainlineEventSpacing {
                    actual_studs,
                    required_studs,
                    ..
                } => Some((actual_studs, required_studs)),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn enforces_event_spacing_at_sixteen_studs_and_after_an_s_curve() {
        for (s_curve, straight_count, expected) in [
            (false, 2, None),
            (false, 1, Some((8.0, 16.0))),
            (true, 8, None),
            (true, 7, Some((56.0, 64.0))),
        ] {
            assert_eq!(
                spacing_diagnostics(s_curve, straight_count),
                expected.as_slice(),
                "S-curve: {s_curve}, eight-stud straights: {straight_count}"
            );
        }
    }

    #[test]
    fn rejects_non_regular_or_public_edge_exits() {
        let project = area(json!(["north"]));
        assert!(!expected(
            &port(200.0, 8.0, 0.0, "trixbrix_sw_r104_d1_right_turn"),
            &project,
            Edge::East,
            Lane::Outer
        ));
        assert!(!expected(
            &port(8.0, 0.0, 270.0, "regular"),
            &project,
            Edge::North,
            Lane::Outer
        ));
    }

    #[test]
    fn rejects_phantom_or_duplicate_handoff_edges_before_evaluation() {
        let mut project = json!({
            "version": 3,
            "name": "invalid exit edges",
            "area": {
                "width": 200, "depth": 160, "fronts": ["north"], "niltc": "straight",
                "exits": [
                    {"id":"front","edge":"north","outer":{"pieceId":"x","portId":"a"},"inner":{"pieceId":"y","portId":"a"}}
                ]
            },
            "layers": [], "items": []
        });
        assert!(evaluate(&project.to_string()).is_err());
        project["area"]["exits"] = json!([
            {"id":"one","edge":"east","outer":{"pieceId":"x","portId":"a"},"inner":{"pieceId":"y","portId":"a"}},
            {"id":"two","edge":"east","outer":{"pieceId":"x","portId":"b"},"inner":{"pieceId":"y","portId":"b"}}
        ]);
        assert!(evaluate(&project.to_string()).is_err());
    }

    #[test]
    fn requires_each_named_mainline_exit_to_have_a_track_route() {
        let mut project: Value = serde_json::from_str(STRAIGHT).unwrap();
        assert_eq!(analyze(&project)["niltcIssues"], json!([]));
        project["items"]
            .as_array_mut()
            .unwrap()
            .retain(|item| item["id"] != "outer-6");
        assert_eq!(
            analyze(&project)["niltcIssues"],
            json!([{"kind":"missing-mainline", "lane":"outer"}]),
        );
    }

    #[test]
    fn accepts_the_measured_corner_fixture() {
        let project: Value = serde_json::from_str(CORNER).unwrap();
        assert_eq!(analyze(&project)["niltcIssues"], json!([]));
    }
}
