//! Clean-air room sizing.

use crate::error::EngineError;
use crate::method;
use crate::model::{CadrPreset, CleanAirInput, CleanAirOutput, IndoorEstimate, Span};

fn span(outdoor: f64, (low, high): (f64, f64)) -> Span {
    Span { low: outdoor * low, high: outdoor * high }
}

/// Indoor PM2.5 from an outdoor value and measured infiltration factors
/// (method::FINF_*). A plain multiplication: no ventilation model, no guess.
pub fn indoor_estimate(outdoor_pm25_ugm3: f64) -> Result<IndoorEstimate, EngineError> {
    if !outdoor_pm25_ugm3.is_finite() || !(0.0..=5000.0).contains(&outdoor_pm25_ugm3) {
        return Err(EngineError::new(format!(
            "outdoor_pm25_ugm3 must be a number from 0 to 5000, got {outdoor_pm25_ugm3}"
        )));
    }
    Ok(IndoorEstimate {
        outdoor_pm25_ugm3,
        without_cleaner_ugm3: span(outdoor_pm25_ugm3, method::FINF_NO_CLEANER),
        with_cleaner_ugm3: span(outdoor_pm25_ugm3, method::FINF_HEPA),
        source: method::INDOOR_SOURCE,
    })
}

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
    let indoor = input.outdoor_pm25_ugm3.map(indoor_estimate).transpose()?;
    Ok(CleanAirOutput {
        volume_m3: volume,
        target_ach: ach,
        cadr_needed_m3h: needed,
        unit_cadr_m3h: unit,
        units,
        delivered_ach: f64::from(units) * unit / volume,
        source: method::CLEAN_AIR_SOURCE,
        indoor,
        presets: vec![CadrPreset {
            name: "Corsi-Rosenthal box (4 x MERV-13 + box fan)",
            cadr_m3h: method::CR_BOX_CADR_M3H,
            source: method::CR_BOX_SOURCE,
        }],
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
            outdoor_pm25_ugm3: None,
        })
        .unwrap();
        assert!(out.indoor.is_none());
        assert_eq!(out.volume_m3, 144.0);
        assert_eq!(out.cadr_needed_m3h, 720.0);
        assert_eq!(out.units, 3);
        assert!(out.delivered_ach >= 5.0);
    }

    #[test]
    fn rejects_zero_and_nan() {
        for (a, h, u) in [(0.0, 3.0, 300.0), (48.0, f64::NAN, 300.0), (48.0, 3.0, -1.0)] {
            let input = CleanAirInput {
                floor_area_m2: a,
                ceiling_height_m: h,
                unit_cadr_m3h: u,
                target_ach: None,
                outdoor_pm25_ugm3: None,
            };
            assert!(clean_air(&input).is_err());
        }
    }

    #[test]
    fn indoor_estimate_uses_measured_infiltration() {
        // Palangka Raya reported 844.6 ug/m3 PM2.5 on 15 Oct 2026.
        let out = clean_air(&CleanAirInput {
            floor_area_m2: 48.0,
            ceiling_height_m: 3.0,
            unit_cadr_m3h: method::CR_BOX_CADR_M3H,
            target_ach: None,
            outdoor_pm25_ugm3: Some(844.6),
        })
        .unwrap();
        let indoor = out.indoor.unwrap();
        assert!((indoor.without_cleaner_ugm3.low - 844.6 * 0.27).abs() < 1e-9);
        assert!((indoor.without_cleaner_ugm3.high - 844.6 * 0.61).abs() < 1e-9);
        assert!((indoor.with_cleaner_ugm3.low - 844.6 * 0.10).abs() < 1e-9);
        assert!(indoor.with_cleaner_ugm3.high < indoor.without_cleaner_ugm3.high);
        // 144 m3 x 5 ACH = 720 m3/h: two CR boxes of 682 m3/h.
        assert_eq!(out.units, 2);
        assert!(clean_air(&CleanAirInput {
            floor_area_m2: 48.0,
            ceiling_height_m: 3.0,
            unit_cadr_m3h: 300.0,
            target_ach: None,
            outdoor_pm25_ugm3: Some(f64::NAN),
        })
        .is_err());
    }

    #[test]
    fn cr_box_preset_matches_the_cited_test() {
        // 111.2 cfm x (1 + 2.61) = 401.4 cfm; 1 cfm = 1.699 m3/h.
        let cfm = 111.2 * 3.61;
        assert!((cfm * 1.699 - method::CR_BOX_CADR_M3H).abs() < 1.0);
    }
}
