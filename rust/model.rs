use std::collections::HashMap;
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

pub(crate) const CATALOG_JSON: &str = include_str!("../data/catalog.json");

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
pub(crate) struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub const ORIGIN: Self = Self { x: 0.0, y: 0.0 };

    pub fn distance_to(self, other: Self) -> f64 {
        (self.x - other.x).hypot(self.y - other.y)
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub(crate) struct Pose {
    #[serde(flatten)]
    pub position: Point,
    pub angle: f64,
}

impl Pose {
    pub const IDENTITY: Self = Self {
        position: Point::ORIGIN,
        angle: 0.0,
    };

    pub fn transform(self, local: Point) -> Point {
        let (sin, cos) = self.angle.rem_euclid(360.0).to_radians().sin_cos();
        Point {
            x: self.position.x + local.x * cos - local.y * sin,
            y: self.position.y + local.x * sin + local.y * cos,
        }
    }

    pub fn to_world(self, local: Self) -> Self {
        Self {
            position: self.transform(local.position),
            angle: (self.angle + local.angle).rem_euclid(360.0),
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct Catalog {
    pub parts: Vec<Part>,
}

impl Catalog {
    pub fn load() -> Result<&'static Self, &'static serde_json::Error> {
        static CATALOG: OnceLock<Result<Catalog, serde_json::Error>> = OnceLock::new();
        CATALOG
            .get_or_init(|| serde_json::from_str(CATALOG_JSON))
            .as_ref()
    }

    pub fn part(&self, id: &str) -> Option<&Part> {
        self.parts.iter().find(|part| part.id == id)
    }
}

#[derive(Deserialize)]
pub(crate) struct Part {
    pub id: String,
    #[serde(rename = "brand")]
    pub _brand: String,
    #[serde(rename = "name")]
    pub _name: String,
    pub ports: Vec<Port>,
    #[serde(default)]
    pub paths: Vec<Vec<Point>>,
    pub footprint: Vec<Point>,
    #[serde(default)]
    pub routes: Vec<Route>,
}

#[derive(Deserialize)]
pub(crate) struct Port {
    pub id: String,
    #[serde(flatten)]
    pub pose: Pose,
    #[serde(rename = "type")]
    pub connector_type: String,
}

#[derive(Deserialize)]
pub(crate) struct Route {
    pub from: String,
    pub to: String,
    pub path: usize,
    #[serde(default)]
    pub radius: Option<f64>,
    #[serde(default)]
    pub event: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct Project {
    pub version: u32,
    #[serde(rename = "name")]
    pub _name: String,
    pub area: DesignArea,
    pub layers: Vec<Layer>,
    pub items: Vec<Item>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesignArea {
    pub width: f64,
    pub depth: f64,
    #[serde(default)]
    pub fronts: Vec<Edge>,
    pub niltc: Option<NiltcKind>,
    #[serde(default)]
    pub exits: Vec<SectionExit>,
}

#[derive(Deserialize)]
pub(crate) struct Layer {
    pub id: String,
    pub visible: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Edge {
    North,
    East,
    South,
    West,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum NiltcKind {
    Straight,
    Corner,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SectionExit {
    pub id: String,
    pub edge: Edge,
    pub outer: Endpoint,
    pub inner: Endpoint,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Endpoint {
    pub piece_id: String,
    pub port_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    pub id: String,
    pub layer_id: String,
    #[serde(flatten)]
    pub pose: Pose,
    #[serde(flatten)]
    pub kind: ItemKind,
}

#[derive(Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum ItemKind {
    Track {
        part_id: String,
        height_plates: i64,
        #[serde(default, rename = "groupId")]
        _group_id: Option<String>,
    },
    Unresolved {
        source_id: String,
        name: String,
        width: f64,
        depth: f64,
    },
}

pub(crate) struct Layout<'a> {
    layers: HashMap<&'a str, bool>,
}

impl<'a> Layout<'a> {
    pub fn new(project: &'a Project) -> Self {
        Self {
            layers: project
                .layers
                .iter()
                .map(|layer| (layer.id.as_str(), layer.visible))
                .collect(),
        }
    }

    pub fn layer_visibility(&self, id: &str) -> Option<bool> {
        self.layers.get(id).copied()
    }
    pub fn visible(&self, layer_id: &str) -> bool {
        self.layer_visibility(layer_id).unwrap_or(false)
    }
}
