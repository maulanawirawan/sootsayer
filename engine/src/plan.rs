//! Clean-air room sizing.

use crate::error::EngineError;
use crate::method;
use crate::model::{CleanAirInput, CleanAirOutput};

fn positive(name: &str, v: f64, max: f64) -> Result<f64, EngineError> {
    if v.is_finite() && v > 0.0 && v <= max {
        Ok(v)
    } else {
        Err(EngineError::new(format!("{name} must be a number above 0 and at most {max}, got {v}")))
    }
}

/// How many purifiers of a given rated CADR a room needs to reach the target
/// air changes per hour of clean air. Always rounds up.
pub fn clean_air(input: &CleanAirInput) -> Result<CleanAirOutput, EngineError> {
    let area = positive("floor_area_m2", input.floor_area_m2, 10_000.0)?;
    let height = positive("ceiling_height_m", input.ceiling_height_m, 30.0)?;
    let unit = positive("unit_cadr_m3h", input.unit_cadr_m3h, 100_000.0)?;
    let ach = positive("target_ach", input.target_ach.unwrap_or(method::CLEAN_AIR_TARGET_ACH), 60.0)?;
    let volume = area * height;
    let needed = volume * ach;
    let units_f = (needed / unit).ceil();
    if units_f > f64::from(u32::MAX) {
        return Err(EngineError::new("room needs more units than can be counted"));
    }
    let units = units_f as u32;
    Ok(CleanAirOutput {
        volume_m3: volume,
        target_ach: ach,
        cadr_needed_m3h: needed,
        unit_cadr_m3h: unit,
        units,
        delivered_ach: f64::from(units) * unit / volume,
        source: method::CLEAN_AIR_SOURCE,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn waiting_room_example() {
        // 6 m x 8 m room, 3 m ceiling = 144 m3; 5 ACH -> 720 m3/h.
        let out = clean_air(&CleanAirInput {
            floor_area_m2: 48.0,
            ceiling_height_m: 3.0,
            unit_cadr_m3h: 300.0,
            target_ach: None,
        })
        .unwrap();
        assert_eq!(out.volume_m3, 144.0);
        assert_eq!(out.cadr_needed_m3h, 720.0);
        assert_eq!(out.units, 3);
        assert!(out.delivered_ach >= 5.0);
    }

    #[test]
    fn rejects_zero_and_nan() {
        for (a, h, u) in [(0.0, 3.0, 300.0), (48.0, f64::NAN, 300.0), (48.0, 3.0, -1.0)] {
            assert!(clean_air(&CleanAirInput { floor_area_m2: a, ceiling_height_m: h, unit_cadr_m3h: u, target_ach: None }).is_err());
        }
    }
}
