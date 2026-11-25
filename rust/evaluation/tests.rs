use serde_json::{Value, json};

use super::{EvaluationError, evaluate};

const TWO_SECTION: &str = include_str!("../../examples/two-section.btp.json");
const DOUBLE_CORNER: &str = include_str!("../../examples/double-corner.btp.json");

fn fixture() -> Value {
    serde_json::from_str(TWO_SECTION).unwrap()
}

fn analyze(project: &Value, draft: &str) -> Value {
    serde_json::from_str(&evaluate(&project.to_string(), draft).unwrap()).unwrap()
}

fn item_mut<'a>(project: &'a mut Value, id: &str) -> &'a mut Value {
    project["items"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|item| item["id"] == id)
        .unwrap()
}

fn number(value: &Value) -> f64 {
    value.as_f64().unwrap()
}

fn near(actual: f64, expected: f64) {
    assert!(
        (actual - expected).abs() < 1e-5,
        "{actual} versus {expected}"
    );
}

#[test]
fn table_union_and_seam_openings() {
    let mut project = fixture();
    let initial = analyze(&project, "null");
    assert_eq!(initial["project"], project);
    assert_eq!(initial["noTable"], false);
    assert_eq!(initial["overhangs"], json!([]));
    for lane in ["outer", "inner"] {
        assert_eq!(initial["seams"][0][lane]["status"], "joined");
        near(number(&initial["seams"][0][lane]["gap"]), 0.0);
    }
    let count: u64 = initial["counts"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["count"].as_u64().unwrap())
        .sum();
    assert_eq!(count, 11);

    project["tables"][1]["x"] = json!(130);
    let shifted = analyze(&project, "");
    for lane in ["outer", "inner"] {
        assert_eq!(shifted["seams"][0][lane]["status"], "misaligned");
        near(number(&shifted["seams"][0][lane]["gap"]), 2.0);
    }
    let overhangs = shifted["overhangs"].as_array().unwrap();
    assert_eq!(overhangs.len(), 1);
    assert_eq!(overhangs[0]["pieceId"], "inner-span");
    let ring = overhangs[0]["rings"][0].as_array().unwrap();
    assert_eq!(ring.first(), ring.last());
    assert!(
        ring.iter()
            .all(|point| (127.99999..=130.00001).contains(&number(&point["x"])))
    );
}

#[test]
fn table_union_keeps_an_enclosed_uncovered_region() {
    let mut project = fixture();
    let tables = [
        (0, 0, 32, 12),
        (0, 20, 32, 12),
        (0, 12, 12, 8),
        (20, 12, 12, 8),
    ];
    project["tables"] = Value::Array(
        tables
            .into_iter()
            .enumerate()
            .map(|(i, (x, y, width, depth))| {
                json!({
                    "id": i.to_string(), "name": "Table", "layerId": "layout",
                    "x": x, "y": y, "angle": 0, "width": width, "depth": depth, "fronts": []
                })
            })
            .collect(),
    );
    project["items"] = json!([{
        "id": "spanning-plate", "layerId": "layout", "kind": "baseplate",
        "x": 16, "y": 16, "angle": 0
    }]);
    project["seams"] = json!([]);
    let result = analyze(&project, "");
    let overhang = &result["overhangs"][0];
    assert_eq!(overhang["pieceId"], "spanning-plate");
    let ring = overhang["rings"][0].as_array().unwrap();
    assert_eq!(ring.len(), 5);
    for axis in ["x", "y"] {
        let (min, max) = ring
            .iter()
            .map(|point| number(&point[axis]))
            .fold((f64::INFINITY, f64::NEG_INFINITY), |(min, max), value| {
                (min.min(value), max.max(value))
            });
        near(min, 12.0);
        near(max, 20.0);
    }
}

#[test]
fn seam_status_reports_height_and_visibility() {
    let mut project = fixture();
    item_mut(&mut project, "inner-b")["heightPlates"] = json!(-2);
    let raised = analyze(&project, "");
    assert_eq!(raised["seams"][0]["inner"]["status"], "height");
    assert_eq!(raised["seams"][0]["inner"]["height"], 2);
    assert_eq!(raised["seams"][0]["outer"]["status"], "joined");

    project["seams"][0]["inner"]["a"]["portId"] = json!("removed-port");
    assert_eq!(
        analyze(&project, "")["seams"][0]["inner"]["status"],
        "missing"
    );

    project["layers"].as_array_mut().unwrap().push(json!({
        "id": "section", "name": "Section", "visible": false
    }));
    project["tables"][0]["layerId"] = json!("section");
    project["tables"][1]["layerId"] = json!("section");
    let hidden = analyze(&project, "");
    assert_eq!(hidden["seams"][0]["inner"]["status"], "hidden");
    assert_eq!(hidden["seams"][0]["outer"]["status"], "hidden");
    assert_eq!(hidden["ports"], raised["ports"]);
    assert_eq!(hidden["counts"], raised["counts"]);
    assert_eq!(hidden["noTable"], true);
    assert_eq!(hidden["overhangs"], json!([]));

    project["layers"][0]["visible"] = json!(false);
    let hidden = analyze(&project, "");
    assert_eq!(hidden["counts"], json!([]));
    assert_eq!(hidden["ports"], json!([]));
}

#[test]
fn rotated_snap_preserves_group_and_project_fields() {
    let project = json!({
        "version": 1, "name": "Rotated table",
        "layers": [{"id": "main", "name": "Main", "visible": true}],
        "tables": [{
            "id": "t", "name": "Rotated", "layerId": "main",
            "x": 100, "y": 40, "angle": 90, "width": 128, "depth": 96,
            "fronts": ["north"], "nominal": "30 x 40 in"
        }],
        "items": [{
            "id": "target", "tableId": "t", "layerId": "main",
            "x": 40, "y": 20, "angle": 0,
            "kind": "track", "partId": "lego:9v-s16", "heightPlates": -1
        }, {
            "id": "moving", "tableId": "t", "layerId": "main",
            "x": 57, "y": 20.7, "angle": 10,
            "kind": "track", "partId": "lego:9v-s16", "heightPlates": -1
        }, {
            "id": "plate", "layerId": "main",
            "x": 63, "y": 75, "angle": 25,
            "kind": "baseplate", "name": "Green", "color": "#1A6032"
        }],
        "seams": []
    });
    let result = analyze(&project, r#"{"pieceIds":["moving","plate"],"radius":2}"#);
    let moved = &result["project"]["items"][1];
    near(number(&moved["x"]), 56.0);
    near(number(&moved["y"]), 20.0);
    near(number(&moved["angle"]), 0.0);
    let plate = &result["project"]["items"][2];
    near(number(&plate["angle"]), 15.0);
    near(
        (number(&plate["x"]) - 80.0).hypot(number(&plate["y"]) - 96.0),
        (63_f64 - 79.3).hypot(75_f64 - 97.0),
    );
    assert_eq!(plate["color"], "#1A6032");
    assert_eq!(result["project"]["tables"], project["tables"]);
    let joined = result["ports"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|port| port["joined"] == true)
        .count();
    assert_eq!(joined, 2);
}

#[test]
fn coincident_targets_stay_unjoined_and_do_not_snap() {
    let mut project = fixture();
    let mut duplicate = item_mut(&mut project, "outer-b").clone();
    duplicate["id"] = json!("outer-b-duplicate");
    project["items"].as_array_mut().unwrap().push(duplicate);
    let overlap = analyze(&project, "");
    let seam = &overlap["seams"][0]["outer"];
    assert_eq!(seam["status"], "misaligned");
    assert_eq!(seam["ambiguous"], true);
    let ambiguous: Vec<_> = overlap["ports"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|port| port["ambiguous"] == true)
        .collect();
    assert_eq!(ambiguous.len(), 3);
    assert!(ambiguous.iter().all(|port| port["joined"] == false));

    item_mut(&mut project, "outer-a")["x"] = json!(119);
    let tied = analyze(&project, r#"{"pieceIds":["outer-a"],"radius":2}"#);
    assert_eq!(tied["project"], project);
}

#[test]
fn curves_join_across_catalog_brands() {
    let result: Value = serde_json::from_str(&evaluate(DOUBLE_CORNER, "").unwrap()).unwrap();
    let ports = result["ports"].as_array().unwrap();
    assert_eq!(ports.len(), 32);
    assert_eq!(ports.iter().filter(|p| p["joined"] == true).count(), 28);
    assert_eq!(result["overhangs"], json!([]));
}

#[test]
fn tables_and_items_share_a_selection_id_namespace() {
    let mut project = fixture();
    let table_id = project["tables"][0]["id"].clone();
    project["seams"][0]["id"] = table_id.clone();
    assert_eq!(analyze(&project, "")["project"], project);

    project["items"][0]["id"] = table_id;
    assert!(matches!(
        evaluate(&project.to_string(), ""),
        Err(EvaluationError::Validation(message)) if message.contains("duplicate table or item ID")
    ));
}

#[test]
fn distant_supported_tables_preserve_overhangs() {
    let mut project = fixture();
    project["tables"][1]["x"] = json!(130);
    project["tables"].as_array_mut().unwrap().push(json!({
        "id": "distant", "layerId": "layout",
        "x": 100_000, "y": -100_000, "angle": 0, "width": 128, "depth": 96
    }));
    let result = analyze(&project, "");
    let overhangs = result["overhangs"].as_array().unwrap();
    assert_eq!(overhangs.len(), 1);
    assert_eq!(overhangs[0]["pieceId"], "inner-span");

    project["tables"][2]["x"] = json!(1e10);
    assert!(matches!(
        evaluate(&project.to_string(), ""),
        Err(EvaluationError::Validation(message)) if message.contains("distant")
    ));
    project["tables"][2]["x"] = json!(0);
    project["tables"][2]["width"] = json!(100_001);
    assert!(matches!(
        evaluate(&project.to_string(), ""),
        Err(EvaluationError::Validation(message)) if message.contains("distant")
    ));
}

#[test]
fn snapping_checks_the_resulting_group_positions() {
    let mut project = fixture();
    item_mut(&mut project, "outer-a")["x"] = json!(121);
    project["items"].as_array_mut().unwrap().push(json!({
        "id": "far-plate", "layerId": "layout", "kind": "baseplate",
        "x": -100_000, "y": 0, "angle": 0
    }));
    let draft = r#"{"pieceIds":["outer-a","far-plate"],"radius":2}"#;
    assert!(matches!(
        evaluate(&project.to_string(), draft),
        Err(EvaluationError::Validation(message)) if message.contains("far-plate")
    ));
}

#[test]
fn evaluation_preserves_project_float_bits() {
    let input = TWO_SECTION.replacen("\"x\": 120", "\"x\": 0.9275049693906069", 1);
    let output: Value = serde_json::from_str(&evaluate(&input, "").unwrap()).unwrap();
    assert_eq!(
        number(&output["project"]["items"][0]["x"]),
        0.9275049693906069
    );
}

#[test]
fn input_errors_leave_no_partial_evaluation() {
    assert!(matches!(
        evaluate("{", ""),
        Err(EvaluationError::Project(_))
    ));
    assert!(matches!(
        evaluate(TWO_SECTION, "{"),
        Err(EvaluationError::Draft(_))
    ));
    assert!(matches!(
        evaluate(TWO_SECTION, r#"{"pieceIds":["removed"],"radius":2}"#),
        Err(EvaluationError::Validation(_))
    ));
}

#[test]
fn venue_reports_only_visible_positive_area_conflicts() {
    let project = json!({
        "version": 2,
        "layers": [{"id": "show", "visible": true}, {"id": "hidden", "visible": false}],
        "tables": [
            {"id": "a", "layerId": "show", "x": 0, "y": 0, "angle": 0, "width": 32, "depth": 32},
            {"id": "b", "layerId": "show", "x": 32, "y": 0, "angle": 0, "width": 32, "depth": 32},
            {"id": "c", "layerId": "show", "x": 23, "y": 25, "angle": 45, "width": 8, "depth": 8},
            {"id": "d", "layerId": "show", "x": 64, "y": 0, "angle": 90, "width": 32, "depth": 32},
            {"id": "hidden", "layerId": "hidden", "x": 0, "y": 0, "angle": 0, "width": 32, "depth": 32}
        ],
        "items": [], "seams": [], "sections": [], "members": [],
        "venue": {"width": 64, "depth": 32, "keepouts": [
            {"id": "corner", "name": "Club door", "x": 1, "y": 1, "width": 2, "depth": 2},
            {"id": "touch", "name": "Aisle", "x": -1, "y": 8, "width": 2, "depth": 2}
        ]}
    });
    assert_eq!(
        analyze(&project, "")["venueIssues"],
        json!([
            {"kind": "table-overlap", "entityId": "a", "otherId": "c"},
            {"kind": "table-overlap", "entityId": "b", "otherId": "d"},
            {"kind": "outside-venue", "entityId": "c"},
            {"kind": "keepout", "entityId": "a", "otherId": "corner"}
        ])
    );

    let mut project = project;
    project.as_object_mut().unwrap().remove("venue");
    assert_eq!(
        analyze(&project, "")["venueIssues"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    project["version"] = json!(1);
    project["venue"] = json!("legacy extra metadata");
    let result = analyze(&project, "");
    assert_eq!(result["project"], project);
    assert_eq!(result["venueIssues"], json!([]));
}

#[test]
fn rotated_tables_sharing_an_edge_are_clear_until_they_overlap() {
    let angle = 29.0_f64;
    let (sin, cos) = angle.to_radians().sin_cos();
    let mut project = json!({
        "version": 2, "layers": [{"id": "show", "visible": true}],
        "tables": [
            {"id": "a", "layerId": "show", "x": 0, "y": 0, "angle": angle, "width": 32, "depth": 32},
            {"id": "b", "layerId": "show", "x": 32.0 * cos, "y": 32.0 * sin, "angle": angle, "width": 32, "depth": 32}
        ],
        "items": [], "seams": []
    });
    assert_eq!(analyze(&project, "")["venueIssues"], json!([]));
    project["tables"][1]["x"] = json!((32.0 - 0.0001) * cos);
    project["tables"][1]["y"] = json!((32.0 - 0.0001) * sin);
    assert_eq!(
        analyze(&project, "")["venueIssues"],
        json!([
            {"kind": "table-overlap", "entityId": "a", "otherId": "b"}
        ])
    );
}

#[test]
fn keepouts_use_all_footprints_independently_of_table_support() {
    let project = json!({
        "version": 2,
        "layers": [{"id": "show", "visible": true}, {"id": "hidden", "visible": false}],
        "tables": [{
            "id": "table", "layerId": "hidden", "x": 55, "y": 25, "angle": 90,
            "width": 32, "depth": 32, "sectionId": "section"
        }],
        "items": [
            {"id": "track", "layerId": "show", "tableId": "table", "x": 0, "y": 5, "angle": 0,
             "kind": "track", "partId": "lego:9v-s16", "heightPlates": 1, "ballast": "gray", "countBallast": true},
            {"id": "unmapped", "layerId": "show", "x": 50, "y": 28, "angle": 90,
             "kind": "unresolved", "sourceId": "ghost", "name": "Imported", "width": 8, "depth": 2},
            {"id": "plate", "layerId": "show", "x": 65, "y": 25, "angle": 0, "kind": "baseplate", "color": "#ffffff"},
            {"id": "hidden-plate", "layerId": "hidden", "x": 50, "y": 25, "angle": 0, "kind": "baseplate"}
        ],
        "seams": [],
        "sections": [{"id": "section", "name": "Section", "memberId": "lead", "exits": []}],
        "members": [{"id": "lead", "name": "Lead", "bring": {"lego:9v-s16": 1}}],
        "venue": {"width": 100, "depth": 100, "keepouts": [
            {"id": "door", "name": "Door", "x": 50, "y": 25, "width": 2, "depth": 2}
        ]}
    });
    let result = analyze(&project, "");
    assert_eq!(result["project"], project);
    assert_eq!(result["noTable"], true);
    assert_eq!(result["overhangs"], json!([]));
    assert_eq!(
        result["venueIssues"],
        json!([
            {"kind": "keepout", "entityId": "track", "otherId": "door"},
            {"kind": "keepout", "entityId": "unmapped", "otherId": "door"},
            {"kind": "keepout", "entityId": "plate", "otherId": "door"}
        ])
    );

    let mut project = project;
    project["venue"]["keepouts"][0]["depth"] = json!(-1);
    assert!(matches!(
        evaluate(&project.to_string(), ""),
        Err(EvaluationError::Validation(message)) if message.contains("door")
    ));
}
