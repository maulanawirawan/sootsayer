//! Forecast check: how well a forecast caught haze days, per lead day.
//!
//! Each pair is (lead day, forecast PM10, hindsight PM10) for one district-day.
//! A day counts as a haze day with the same rule as the outlook (study Table 1,
//! `method::HAZE_PM10_UGM3`). The result is the standard 2 x 2 contingency
//! table per lead day. Pairs with a missing value are counted, never guessed.
//!
//! Hindsight is the model's own later estimate (archived CAMS data), so the
//! check measures agreement with that estimate, not accuracy against measured
//! air quality.

use crate::error::EngineError;
use crate::model::{CheckInput, CheckOutput, DayStatus, LeadCheck};
use crate::{method, outlook};

/// The threshold is not written out here: it is `threshold_pm10_ugm3` in the
/// same output, from `method.rs`.
pub const DEFINITIONS: &str = "Hit: forecast and hindsight are both haze days (district daily mean PM10 at or above threshold_pm10_ugm3). Miss: haze in hindsight, not in the forecast. False alarm: haze in the forecast, not in hindsight. POD (probability of detection) = hits / (hits + misses). FAR (false alarm ratio) = false alarms / (hits + false alarms). Hindsight is archived model data, not station measurements, so this measures how well the morning forecast matched the model's later estimate, not accuracy against measured air quality.";

const MAX_LEAD_DAYS: u32 = 16;

fn is_haze(pm10_ugm3: f64) -> bool {
    matches!(outlook::classify(Some(pm10_ugm3), None).0, DayStatus::Haze | DayStatus::FireHaze)
}

fn ratio(num: u32, den: u32) -> Option<f64> {
    (den > 0).then(|| f64::from(num) / f64::from(den))
}

pub fn forecast_check(input: &CheckInput) -> Result<CheckOutput, EngineError> {
    if !(1..=MAX_LEAD_DAYS).contains(&input.lead_days) {
        return Err(EngineError::new(format!("lead_days must be 1 to {MAX_LEAD_DAYS}, got {}", input.lead_days)));
    }
    let mut rows: Vec<LeadCheck> = (0..input.lead_days)
        .map(|lead_day| LeadCheck {
            lead_day,
            pairs: 0,
            missing: 0,
            hits: 0,
            misses: 0,
            false_alarms: 0,
            correct_negatives: 0,
            pod: None,
            far: None,
            accuracy: None,
        })
        .collect();
    for (i, (lead, forecast, hindsight)) in input.pairs.iter().enumerate() {
        if *lead >= input.lead_days {
            return Err(EngineError::new(format!("pair {}: lead day {lead} is not below lead_days {}", i + 1, input.lead_days)));
        }
        for v in [forecast, hindsight].into_iter().flatten() {
            if !v.is_finite() || *v < 0.0 {
                return Err(EngineError::new(format!("pair {}: invalid PM10 value {v}", i + 1)));
            }
        }
        let row = &mut rows[*lead as usize];
        row.pairs += 1;
        match (forecast, hindsight) {
            (Some(f), Some(h)) => match (is_haze(*f), is_haze(*h)) {
                (true, true) => row.hits += 1,
                (false, true) => row.misses += 1,
                (true, false) => row.false_alarms += 1,
                (false, false) => row.correct_negatives += 1,
            },
            _ => row.missing += 1,
        }
    }
    for row in &mut rows {
        let compared = row.pairs - row.missing;
        row.pod = ratio(row.hits, row.hits + row.misses);
        row.far = ratio(row.false_alarms, row.hits + row.false_alarms);
        row.accuracy = ratio(row.hits + row.correct_negatives, compared);
    }
    Ok(CheckOutput { threshold_pm10_ugm3: method::HAZE_PM10_UGM3, leads: rows, definitions: DEFINITIONS })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(pairs: Vec<(u32, Option<f64>, Option<f64>)>) -> CheckInput {
        CheckInput { lead_days: 3, pairs }
    }

    #[test]
    fn counts_the_contingency_table() {
        let out = forecast_check(&input(vec![
            (0, Some(150.0), Some(120.0)), // hit
            (0, Some(150.0), Some(40.0)),  // false alarm
            (0, Some(60.0), Some(130.0)),  // miss
            (0, Some(60.0), Some(30.0)),   // correct negative
            (0, Some(100.0), Some(100.0)), // threshold is inclusive: hit
            (1, None, Some(300.0)),        // missing
            (1, Some(10.0), Some(20.0)),
        ]))
        .unwrap();
        let r0 = &out.leads[0];
        assert_eq!((r0.pairs, r0.hits, r0.false_alarms, r0.misses, r0.correct_negatives, r0.missing), (5, 2, 1, 1, 1, 0));
        assert!((r0.pod.unwrap() - 2.0 / 3.0).abs() < 1e-12);
        assert!((r0.far.unwrap() - 1.0 / 3.0).abs() < 1e-12);
        assert!((r0.accuracy.unwrap() - 3.0 / 5.0).abs() < 1e-12);
        let r1 = &out.leads[1];
        assert_eq!((r1.pairs, r1.missing, r1.correct_negatives), (2, 1, 1));
        assert_eq!((r1.pod, r1.far), (None, None), "no haze at all: rates are undefined, not zero");
        assert_eq!(out.leads[2].pairs, 0);
        assert_eq!(out.leads[2].accuracy, None);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(forecast_check(&input(vec![(3, Some(1.0), Some(1.0))])).is_err());
        assert!(forecast_check(&input(vec![(0, Some(f64::NAN), Some(1.0))])).is_err());
        assert!(forecast_check(&input(vec![(0, Some(1.0), Some(-5.0))])).is_err());
        assert!(forecast_check(&CheckInput { lead_days: 0, pairs: vec![] }).is_err());
    }
}
