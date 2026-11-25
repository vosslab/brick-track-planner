use serde::Serialize;

use std::collections::{HashMap, HashSet, VecDeque};

use crate::model::{Catalog, Endpoint, ItemKind, Layout, Project};
use crate::ports::{self, WorldPort};

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EndpointRef<'a> {
    piece_id: &'a str,
    port_id: &'a str,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum RouteKind {
    Internal,
    Joint,
}

/// A traversable rail connection. A UI can join these links into the route to a selected siding.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RoutePath<'a> {
    from: EndpointRef<'a>,
    to: EndpointRef<'a>,
    kind: RouteKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    radius: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    turn: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    event: Option<&'a str>,
}

pub(crate) struct DirectedRoute<'route, 'data> {
    pub path: &'route RoutePath<'data>,
    pub reversed: bool,
}

impl<'route, 'data> DirectedRoute<'route, 'data> {
    pub(crate) fn is_internal(&self) -> bool {
        self.path.kind == RouteKind::Internal
    }

    pub(crate) fn item_id(&self) -> &'data str {
        self.path.from.piece_id
    }

    pub(crate) fn length(&self) -> f64 {
        self.path.length.unwrap_or(0.0)
    }

    pub(crate) fn radius(&self) -> Option<f64> {
        self.path.radius
    }

    pub(crate) fn event(&self) -> Option<&'data str> {
        self.path.event
    }

    pub(crate) fn turn(&self) -> f64 {
        let turn = self.path.turn.unwrap_or(0.0);
        if self.reversed { -turn } else { turn }
    }
}

fn turn_between(from: f64, to: f64) -> f64 {
    (to - from + 180.0).rem_euclid(360.0) - 180.0
}

fn path_length(points: &[crate::model::Point]) -> f64 {
    points
        .windows(2)
        .map(|pair| {
            let dx = pair[1].x - pair[0].x;
            let dy = pair[1].y - pair[0].y;
            (dx * dx + dy * dy).sqrt()
        })
        .sum()
}

fn endpoint<'a>(piece_id: &'a str, port_id: &'a str) -> EndpointRef<'a> {
    EndpointRef { piece_id, port_id }
}

pub(crate) fn trace<'a>(
    project: &'a Project,
    layout: &Layout<'_>,
    catalog: &'a Catalog,
    ports: &[WorldPort<'a>],
) -> Vec<RoutePath<'a>> {
    let mut routes = Vec::new();
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
        for route in &part.routes {
            let from = part.ports.iter().find(|port| port.id == route.from);
            let to = part.ports.iter().find(|port| port.id == route.to);
            let turn = from
                .zip(to)
                .map(|(from, to)| turn_between(from.pose.angle + 180.0, to.pose.angle));
            let event = route.event.as_deref().or_else(|| {
                (route.radius.is_some() && turn.is_some_and(|turn| turn.abs() > 0.25))
                    .then_some("curve")
            });
            routes.push(RoutePath {
                from: endpoint(&item.id, &route.from),
                to: endpoint(&item.id, &route.to),
                kind: RouteKind::Internal,
                path: Some(route.path),
                length: part.paths.get(route.path).map(|points| path_length(points)),
                radius: route.radius,
                turn,
                event,
            });
        }
    }
    for (from, to) in ports::join_links(ports) {
        routes.push(RoutePath {
            from: endpoint(ports[from].piece_id, ports[from].port_id),
            to: endpoint(ports[to].piece_id, ports[to].port_id),
            kind: RouteKind::Joint,
            path: None,
            length: None,
            radius: None,
            turn: None,
            event: None,
        });
    }
    routes
}

/// Finds a buildable path through actual track routes and recognized rail joints.
/// Finds a continuous train route.  A train must cross a physical joint after
/// taking a route inside a part; this deliberately prevents branch-to-branch
/// travel through the common leg of a turnout.
pub(crate) fn trace_path<'route, 'data>(
    paths: &'route [RoutePath<'data>],
    start: &Endpoint,
    target: &Endpoint,
) -> Vec<DirectedRoute<'route, 'data>> {
    let key = |piece_id: &str, port_id: &str| format!("{piece_id}\u{0}{port_id}");
    let start = key(&start.piece_id, &start.port_id);
    let target = key(&target.piece_id, &target.port_id);
    if start == target {
        return Vec::new();
    }
    let mut neighbors: HashMap<String, Vec<(usize, String)>> = HashMap::new();
    for (index, path) in paths.iter().enumerate() {
        let from = key(path.from.piece_id, path.from.port_id);
        let to = key(path.to.piece_id, path.to.port_id);
        neighbors
            .entry(from.clone())
            .or_default()
            .push((index, to.clone()));
        neighbors.entry(to).or_default().push((index, from));
    }
    let mut pending = VecDeque::from([(start.clone(), None)]);
    let mut seen = HashSet::from([(start.clone(), None)]);
    let mut previous: HashMap<
        (String, Option<RouteKind>),
        ((String, Option<RouteKind>), usize, bool),
    > = HashMap::new();
    let mut end = None;
    while let Some((current, previous_kind)) = pending.pop_front() {
        for (index, next) in neighbors.get(&current).into_iter().flatten() {
            let path = &paths[*index];
            if previous_kind == Some(path.kind) {
                continue;
            }
            let state = (next.clone(), Some(path.kind));
            if !seen.insert(state.clone()) {
                continue;
            }
            let reversed = current != key(path.from.piece_id, path.from.port_id);
            previous.insert(
                state.clone(),
                ((current.clone(), previous_kind), *index, reversed),
            );
            if next == &target {
                end = Some(state);
                break;
            }
            pending.push_back(state);
        }
        if end.is_some() {
            break;
        }
    }
    let Some(mut state) = end else {
        return Vec::new();
    };
    let mut result = Vec::new();
    while state.0 != start {
        let (before, index, reversed) = previous.remove(&state).unwrap();
        result.push(DirectedRoute {
            path: &paths[index],
            reversed,
        });
        state = before;
    }
    result.reverse();
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn link(
        from: (&'static str, &'static str),
        to: (&'static str, &'static str),
        kind: RouteKind,
    ) -> RoutePath<'static> {
        RoutePath {
            from: endpoint(from.0, from.1),
            to: endpoint(to.0, to.1),
            kind,
            path: None,
            length: None,
            radius: None,
            turn: None,
            event: None,
        }
    }

    #[test]
    fn does_not_turn_between_two_internal_turnout_routes() {
        let links = vec![
            link(("main", "west"), ("switch", "left"), RouteKind::Joint),
            link(
                ("switch", "left"),
                ("switch", "common"),
                RouteKind::Internal,
            ),
            link(
                ("switch", "common"),
                ("switch", "right"),
                RouteKind::Internal,
            ),
            link(("switch", "right"), ("yard", "east"), RouteKind::Joint),
        ];
        let start = Endpoint {
            piece_id: "main".into(),
            port_id: "west".into(),
        };
        let end = Endpoint {
            piece_id: "yard".into(),
            port_id: "east".into(),
        };
        assert!(trace_path(&links, &start, &end).is_empty());
    }
}
