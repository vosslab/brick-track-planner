use serde::Serialize;

use crate::model::{Catalog, ItemKind, Layout, Project};
use crate::ports::{self, WorldPort};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize)]
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
