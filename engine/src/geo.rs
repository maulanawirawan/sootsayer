//! Point-in-polygon for assigning fire detections to districts.

use std::collections::BTreeMap;

use crate::dates;
use crate::error::EngineError;
use crate::model::{DistrictShape, FireCountInput, FireCountOutput, LocateInput, LocateOutput, Located};

type Ring = Vec<[f64; 2]>;

/// Even-odd ray casting over every ring of one polygon (outer ring plus holes).
/// Points exactly on an edge may fall either way; at a 375 m fire pixel this
/// does not matter.
fn polygon_contains(rings: &[Ring], lon: f64, lat: f64) -> bool {
    let mut inside = false;
    for ring in rings {
        let n = ring.len();
        if n < 3 {
            continue;
        }
        let mut j = n - 1;
        for i in 0..n {
            let [xi, yi] = ring[i];
            let [xj, yj] = ring[j];
            if (yi > lat) != (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi {
                inside = !inside;
            }
            j = i;
        }
    }
    inside
}

struct Indexed<'a> {
    code: &'a str,
    bbox: [f64; 4],
    polygons: &'a [Vec<Ring>],
}

fn index(shapes: &[DistrictShape]) -> Result<Vec<Indexed<'_>>, EngineError> {
    shapes
        .iter()
        .map(|s| {
            let mut bbox = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
            for p in s.multipolygon.iter().flatten().flatten() {
                if !p[0].is_finite() || !p[1].is_finite() {
                    return Err(EngineError::new(format!("district '{}' has a non-finite coordinate", s.code)));
                }
                bbox = [bbox[0].min(p[0]), bbox[1].min(p[1]), bbox[2].max(p[0]), bbox[3].max(p[1])];
            }
            Ok(Indexed { code: &s.code, bbox, polygons: &s.multipolygon })
        })
        .collect()
}

fn find<'a>(idx: &'a [Indexed<'a>], lon: f64, lat: f64) -> Option<&'a str> {
    idx.iter()
        .filter(|d| lon >= d.bbox[0] && lon <= d.bbox[2] && lat >= d.bbox[1] && lat <= d.bbox[3])
        .find(|d| d.polygons.iter().any(|rings| polygon_contains(rings, lon, lat)))
        .map(|d| d.code)
}

/// Points just outside every district are snapped to the nearest one when it
/// is within this distance, in degrees (about 3 km). Coastal puskesmas can sit
/// outside simplified boundaries; the reference pipeline uses the same rule.
pub const SNAP_DEG: f64 = 0.03;

/// Planar distance from a point to a segment, in degrees.
fn segment_distance(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
    let len2 = dx * dx + dy * dy;
    let t = if len2 > 0.0 { (((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2).clamp(0.0, 1.0) } else { 0.0 };
    let (cx, cy) = (a[0] + t * dx, a[1] + t * dy);
    ((p[0] - cx).powi(2) + (p[1] - cy).powi(2)).sqrt()
}

fn nearest_within<'a>(idx: &'a [Indexed<'a>], lon: f64, lat: f64, max: f64) -> Option<&'a str> {
    let mut best: Option<(&str, f64)> = None;
    for d in idx {
        if lon < d.bbox[0] - max || lon > d.bbox[2] + max || lat < d.bbox[1] - max || lat > d.bbox[3] + max {
            continue;
        }
        for ring in d.polygons.iter().flatten() {
            for w in ring.windows(2) {
                let dist = segment_distance([lon, lat], w[0], w[1]);
                if dist <= max && best.is_none_or(|(_, b)| dist < b) {
                    best = Some((d.code, dist));
                }
            }
        }
    }
    best.map(|(c, _)| c)
}

/// Which district each point falls in (for imported puskesmas lists).
pub fn locate(input: &LocateInput) -> Result<LocateOutput, EngineError> {
    let idx = index(&input.districts)?;
    let mut located = Vec::with_capacity(input.points.len());
    for (i, [lon, lat]) in input.points.iter().copied().enumerate() {
        if !lon.is_finite() || !lat.is_finite() || !(-180.0..=180.0).contains(&lon) || !(-90.0..=90.0).contains(&lat) {
            return Err(EngineError::new(format!("point {}: invalid coordinate [{lon}, {lat}]", i + 1)));
        }
        located.push(match find(&idx, lon, lat) {
            Some(code) => Some(Located { district_code: code.to_string(), snapped: false }),
            None => nearest_within(&idx, lon, lat, SNAP_DEG).map(|code| Located { district_code: code.to_string(), snapped: true }),
        });
    }
    Ok(LocateOutput { located })
}

/// Count fire detections per district per day.
pub fn fire_counts(input: &FireCountInput) -> Result<FireCountOutput, EngineError> {
    let mut day_index = BTreeMap::new();
    for (i, d) in input.days.iter().enumerate() {
        dates::parse(d).ok_or_else(|| EngineError::new(format!("invalid date '{d}'")))?;
        day_index.insert(d.as_str(), i);
    }
    let idx = index(&input.districts)?;
    let mut counts: BTreeMap<String, Vec<u32>> =
        input.districts.iter().map(|d| (d.code.clone(), vec![0; input.days.len()])).collect();
    let (mut outside_districts, mut outside_days) = (0u32, 0u32);
    for (lon, lat, date) in &input.fires {
        let Some(&di) = day_index.get(date.as_str()) else {
            outside_days += 1;
            continue;
        };
        match find(&idx, *lon, *lat) {
            Some(code) => {
                if let Some(v) = counts.get_mut(code) {
                    v[di] += 1;
                }
            }
            None => outside_districts += 1,
        }
    }
    Ok(FireCountOutput { days: input.days.clone(), counts, outside_districts, outside_days })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(x0: f64, y0: f64, x1: f64, y1: f64) -> Ring {
        vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
    }

    #[test]
    fn holes_are_excluded() {
        let rings = vec![square(0.0, 0.0, 10.0, 10.0), square(4.0, 4.0, 6.0, 6.0)];
        assert!(polygon_contains(&rings, 2.0, 2.0));
        assert!(!polygon_contains(&rings, 5.0, 5.0));
        assert!(!polygon_contains(&rings, 11.0, 5.0));
    }

    #[test]
    fn counts_by_district_and_day() {
        let input = FireCountInput {
            days: vec!["2026-10-01".into(), "2026-10-02".into()],
            districts: vec![
                DistrictShape { code: "A".into(), multipolygon: vec![vec![square(0.0, 0.0, 1.0, 1.0)]] },
                DistrictShape { code: "B".into(), multipolygon: vec![vec![square(1.0, 0.0, 2.0, 1.0)]] },
            ],
            fires: vec![
                (0.5, 0.5, "2026-10-01".into()),
                (0.6, 0.5, "2026-10-02".into()),
                (1.5, 0.5, "2026-10-02".into()),
                (5.0, 5.0, "2026-10-02".into()),
                (0.5, 0.5, "2026-09-30".into()),
            ],
        };
        let out = fire_counts(&input).unwrap();
        assert_eq!(out.counts["A"], vec![1, 1]);
        assert_eq!(out.counts["B"], vec![0, 1]);
        assert_eq!(out.outside_districts, 1);
        assert_eq!(out.outside_days, 1);
    }

    #[test]
    fn locate_inside_snapped_and_outside() {
        let input = LocateInput {
            districts: vec![
                DistrictShape { code: "A".into(), multipolygon: vec![vec![square(0.0, 0.0, 1.0, 1.0)]] },
                DistrictShape { code: "B".into(), multipolygon: vec![vec![square(1.0, 0.0, 2.0, 1.0)]] },
            ],
            points: vec![[0.5, 0.5], [1.5, 0.5], [2.02, 0.5], [3.0, 3.0]],
        };
        let out = locate(&input).unwrap().located;
        assert_eq!(out[0].as_ref().map(|l| (l.district_code.as_str(), l.snapped)), Some(("A", false)));
        assert_eq!(out[1].as_ref().map(|l| l.district_code.as_str()), Some("B"));
        assert_eq!(out[2].as_ref().map(|l| (l.district_code.as_str(), l.snapped)), Some(("B", true)));
        assert!(out[3].is_none());
        let bad = LocateInput { districts: input.districts.clone(), points: vec![[f64::NAN, 0.0]] };
        assert!(locate(&bad).is_err());
    }
}
