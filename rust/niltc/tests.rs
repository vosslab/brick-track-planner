use serde_json::{Value, json};

use crate::evaluate;

fn project() -> Value {
    json!({
        "version": 2,
        "layers": [{"id": "layout", "visible": true}],
        "tables": [{
            "id": "table", "layerId": "layout", "x": 0, "y": 0, "angle": 0,
            "width": 32, "depth": 32, "niltc": "straight", "fronts": ["north"]
        }],
        "sections": [], "items": [], "seams": []
    })
}

fn analyze(project: &Value, draft: &str) -> Value {
    serde_json::from_str(&evaluate(&project.to_string(), draft).unwrap()).unwrap()
}

fn straight(id: &str, x: f64, y: f64) -> Value {
    json!({
        "id": id, "layerId": "layout", "tableId": "table", "kind": "track",
        "partId": "lego:9v-s16", "x": x, "y": y, "angle": 0, "heightPlates": 2
    })
}

#[test]
fn snaps_first_piece_to_actual_lane_and_prefers_connectors() {
    const DRAFT: &str = r#"{"pieceIds":["draft"],"radius":10}"#;
    let mut project = project();
    project["tables"][0]["angle"] = json!(90);
    project["items"] = json!([straight("draft", 16.0, 9.5)]);
    project["items"][0]["angle"] = json!(270);
    project["items"][0]["heightPlates"] = json!(1);
    let snapped = analyze(&project, DRAFT);
    let item = &snapped["project"]["items"][0];
    assert_eq!(
        (item["y"].as_f64(), item["angle"].as_f64()),
        (Some(8.0), Some(180.0))
    );
    assert_eq!(item["heightPlates"], 1);
    assert_eq!(
        snapped["niltcIssues"][0],
        json!({"kind":"mainline-height","tableId":"table","itemId":"draft","lane":"outer"})
    );
    assert_eq!(analyze(&project, "")["project"], project);

    project["items"][0]["y"] = json!(11.5);
    assert_eq!(analyze(&project, DRAFT)["project"], project);
    project["items"][0]["y"] = json!(9.5);
    let narrow = r#"{"pieceIds":["draft"],"radius":1}"#;
    assert_eq!(analyze(&project, narrow)["project"], project);

    project["items"][0]["angle"] = json!(0);
    project["items"][0]["heightPlates"] = json!(2);
    project["items"][0]["x"] = json!(24.5);
    project["items"]
        .as_array_mut()
        .unwrap()
        .push(straight("fixed", 8.0, 9.5));
    let connector = analyze(&project, DRAFT);
    let item = &connector["project"]["items"][0];
    assert!((item["x"].as_f64().unwrap() - 24.0).abs() < 1e-8);
    assert!((item["y"].as_f64().unwrap() - 9.5).abs() < 1e-8);

    project["items"] = json!([straight("draft", 16.0, 2.625)]);
    project["items"][0]["partId"] = json!("lego:9v-r40-left");
    let switch = analyze(&project, DRAFT);
    assert_eq!(switch["project"]["items"][0]["y"].as_f64(), Some(1.625));
}

#[test]
fn checks_owned_s8_exit_and_local_plate_grid_in_arbitrary_venue_pose() {
    let mut project = project();
    assert_eq!(
        analyze(&project, "")["niltcIssues"],
        json!([
            {"kind":"missing-mainline","tableId":"table","lane":"outer"},
            {"kind":"missing-mainline","tableId":"table","lane":"inner"}
        ])
    );
    project["items"] = json!([
        straight("outer-w", 8.0, 8.0), straight("outer-e", 20.0, 8.0),
        straight("inner-w", 8.0, 24.0), straight("inner-e", 24.0, 24.0),
        straight("span", 36.0, 24.0), {
            "id":"baseplate","layerId":"layout","tableId":"table","kind":"baseplate",
            "x":16,"y":16,"angle":90
        }
    ]);
    project["items"][1]["partId"] = json!("trixbrix:s08");
    project["items"][4]["partId"] = json!("bricktracks:s08");
    assert_eq!(
        analyze(&project, "")["niltcIssues"],
        json!([{"kind":"missing-mainline","tableId":"table","lane":"outer"}])
    );
    project["sections"] = json!([{"exits": [{
        "id":"east","edge":"east","tableId":"table",
        "outer":{"pieceId":"outer-e","portId":"b"},
        "inner":{"pieceId":"span","portId":"b"}
    }]}]);
    project["tables"][0]["x"] = json!(34.5);
    project["tables"][0]["angle"] = json!(17);
    assert_eq!(
        analyze(&project, "")["niltcIssues"],
        json!([{"kind":"table-grid","tableId":"table"}])
    );

    project["venue"] = json!({"width":128,"depth":128,"keepouts":[]});
    assert_eq!(analyze(&project, "")["niltcIssues"], json!([]));

    project["items"][4]
        .as_object_mut()
        .unwrap()
        .remove("tableId");
    project["items"][5]["y"] = json!(17);
    assert_eq!(
        analyze(&project, "")["niltcIssues"],
        json!([
            {"kind":"baseplate-grid","tableId":"table","itemId":"baseplate"},
            {"kind":"exit-off-standard","tableId":"table","exitId":"east","lane":"inner"}
        ])
    );
    project["tables"][0]
        .as_object_mut()
        .unwrap()
        .remove("niltc");
    assert_eq!(analyze(&project, "")["niltcIssues"], json!([]));
}

#[test]
fn checks_both_outward_edges_of_a_corner() {
    let bundle: Value =
        serde_json::from_str(include_str!("../../examples/corner.btps.json")).unwrap();
    let mut project = bundle["project"].clone();
    project["tables"][0]["angle"] = json!(270);
    assert_eq!(analyze(&project, "")["niltcIssues"], json!([]));

    let exit = &mut project["sections"][0]["exits"][0];
    let id = exit["id"].clone();
    exit["inner"]["portId"] = json!("a");
    assert_eq!(
        analyze(&project, "")["niltcIssues"],
        json!([
            {"kind":"exit-off-standard","tableId":"corner","exitId":id,"lane":"inner"}
        ])
    );
}
