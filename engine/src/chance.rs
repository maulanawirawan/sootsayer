//! Haze-day chance: a statistical correction of the CAMS forecast (model
//! output statistics). For lead day k the model is one logistic regression,
//! trained in the pipeline with scikit-learn (build_chance):
//!
//! ```text
//! chance = 1 / (1 + e^-(a_k + b_k ln F + c_k ln Y))
//! ```
//!
//! F is the forecast district PM10 of that day and Y the district PM10 of
//! the day before the window (known on the morning the forecast is read),
//! both floored at `method::CHANCE_FLOOR_UGM3`. The engine only evaluates the
//! model: the coefficients come in with the input.
//!
//! `ln` and `exp` below use IEEE basic operations only (+, -, *, /, rounding
//! and bit manipulation). The platform's libm does not promise the same bits
//! on WebAssembly and native, and the browser and the agent must agree to the
//! byte.

use std::f64::consts::{LN_2, SQRT_2};

use crate::error::EngineError;
use crate::method;
use crate::model::{
    ChanceCheckInput, ChanceCheckOutput, ChanceLeadCheck, ChanceModel, DayStatus, ReliabilityBin,
};
use crate::outlook;

pub const MAX_LEAD_DAYS: usize = 16;

pub const DEFINITIONS: &str = "Chance: the haze-day chance of a model that did not see the week of the pair (purged leave-one-week-out). Warning: chance at or above alert. Hit, miss, false alarm, POD and FAR as in the forecast check, with that warning in place of the raw rule. Brier: mean of (chance - outcome)^2, outcome 1 for a haze day in hindsight, else 0; brier_raw is the same for the raw rule (forecast PM10 at or above threshold_pm10_ugm3 as 1). Reliability: pairs grouped by chance; a reliable chance has mean_chance close to observed. Hindsight is archived model data, not station measurements.";

/// Natural logarithm for finite x > 0, accurate to about 1e-15.
pub fn ln(x: f64) -> f64 {
    debug_assert!(x.is_finite() && x > 0.0);
    let bits = x.to_bits();
    let mut e = ((bits >> 52) & 0x7ff) as i64 - 1023;
    // Mantissa in [1, 2); callers never pass subnormals (inputs are floored).
    let mut m = f64::from_bits((bits & 0x000f_ffff_ffff_ffff) | 0x3ff0_0000_0000_0000);
    if m > SQRT_2 {
        m /= 2.0;
        e += 1;
    }
    // ln m = 2 atanh s = 2 (s + s^3/3 + s^5/5 + ...), |s| <= 0.172
    let s = (m - 1.0) / (m + 1.0);
    let s2 = s * s;
    let (mut term, mut sum) = (s, 0.0);
    for k in 0..24 {
        sum += term / f64::from(2 * k + 1);
        term *= s2;
    }
    2.0 * sum + (e as f64) * LN_2
}

/// e^x, accurate to about 1e-15 relative; x is clamped to [-700, 700].
pub fn exp(x: f64) -> f64 {
    let x = x.clamp(-700.0, 700.0);
    let n = (x / LN_2).round();
    let r = x - n * LN_2; // |r| <= ln 2 / 2
    let (mut term, mut sum) = (1.0, 1.0);
    for i in 1..28 {
        term *= r / f64::from(i);
        sum += term;
    }
    // 2^n exactly, n in [-1010, 1010]
    sum * f64::from_bits(((n as i64 + 1023) as u64) << 52)
}

/// The haze-day chance of one district-day, rounded to 0.001, or None when
/// the lead day is outside the model or an input is unknown.
pub fn chance(model: &ChanceModel, lead: usize, forecast: Option<f64>, day_before: Option<f64>) -> Option<f64> {
    let [a, b, c] = *model.coefficients.get(lead)?;
    let f = forecast?.max(method::CHANCE_FLOOR_UGM3);
    let y = day_before?.max(method::CHANCE_FLOOR_UGM3);
    let z = (a + b * ln(f) + c * ln(y)).clamp(-40.0, 40.0);
    let p = 1.0 / (1.0 + exp(-z));
    Some((p * 1000.0).round() / 1000.0)
}

pub fn validate(model: &ChanceModel) -> Result<(), EngineError> {
    let id = model.id.trim();
    if id.is_empty() || id.chars().count() > 80 || id.chars().any(char::is_control) {
        return Err(EngineError::new("haze_chance_model.id must be 1 to 80 characters on one line"));
    }
    if model.coefficients.is_empty() || model.coefficients.len() > MAX_LEAD_DAYS {
        return Err(EngineError::new(format!(
            "haze_chance_model '{id}': coefficients must have 1 to {MAX_LEAD_DAYS} rows, got {}",
            model.coefficients.len()
        )));
    }
    for (k, row) in model.coefficients.iter().enumerate() {
        if row.iter().any(|v| !v.is_finite()) {
            return Err(EngineError::new(format!("haze_chance_model '{id}': lead day {k} has a non-finite coefficient")));
        }
    }
    Ok(())
}

fn is_haze(pm10_ugm3: f64) -> bool {
    matches!(outlook::classify(Some(pm10_ugm3), None).0, DayStatus::Haze | DayStatus::FireHaze)
}

fn ratio(num: u32, den: u32) -> Option<f64> {
    (den > 0).then(|| f64::from(num) / f64::from(den))
}

/// The test table of a chance model: held-out chances against hindsight.
pub fn chance_check(input: &ChanceCheckInput) -> Result<ChanceCheckOutput, EngineError> {
    let lead_days = input.lead_days as usize;
    if !(1..=MAX_LEAD_DAYS).contains(&lead_days) {
        return Err(EngineError::new(format!("lead_days must be 1 to {MAX_LEAD_DAYS}, got {lead_days}")));
    }
    if input.models.is_empty() {
        return Err(EngineError::new("models must not be empty"));
    }
    for m in &input.models {
        validate(m)?;
    }
    let mut rows: Vec<ChanceLeadCheck> = (0..input.lead_days)
        .map(|lead_day| ChanceLeadCheck {
            lead_day,
            pairs: 0,
            missing: 0,
            hits: 0,
            misses: 0,
            false_alarms: 0,
            correct_negatives: 0,
            pod: None,
            far: None,
            brier: None,
            brier_raw: None,
        })
        .collect();
    let mut sq = vec![(0.0_f64, 0.0_f64); lead_days];
    let edges = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
    let mut bins = vec![(0_u32, 0.0_f64, 0_u32); edges.len() - 1];
    for (i, (model, lead, forecast, before, hindsight)) in input.pairs.iter().enumerate() {
        let k = *lead as usize;
        if k >= lead_days {
            return Err(EngineError::new(format!("pair {}: lead day {lead} is not below lead_days {lead_days}", i + 1)));
        }
        let m = input
            .models
            .get(*model)
            .ok_or_else(|| EngineError::new(format!("pair {}: model {model} does not exist", i + 1)))?;
        for v in [forecast, before, hindsight].into_iter().flatten() {
            if !v.is_finite() || *v < 0.0 {
                return Err(EngineError::new(format!("pair {}: invalid PM10 value {v}", i + 1)));
            }
        }
        let row = &mut rows[k];
        row.pairs += 1;
        let (Some(p), Some(f), Some(h)) = (chance(m, k, *forecast, *before), forecast, hindsight) else {
            row.missing += 1;
            continue;
        };
        let warned = p >= method::HAZE_CHANCE_ALERT;
        let happened = is_haze(*h);
        match (warned, happened) {
            (true, true) => row.hits += 1,
            (false, true) => row.misses += 1,
            (true, false) => row.false_alarms += 1,
            (false, false) => row.correct_negatives += 1,
        }
        let o = if happened { 1.0 } else { 0.0 };
        let raw = if is_haze(*f) { 1.0 } else { 0.0 };
        sq[k].0 += (p - o) * (p - o);
        sq[k].1 += (raw - o) * (raw - o);
        let b = edges.windows(2).position(|w| p < w[1]).unwrap_or(bins.len() - 1);
        bins[b].0 += 1;
        bins[b].1 += p;
        if happened {
            bins[b].2 += 1;
        }
    }
    for (row, (s, s_raw)) in rows.iter_mut().zip(&sq) {
        let compared = row.pairs - row.missing;
        row.pod = ratio(row.hits, row.hits + row.misses);
        row.far = ratio(row.false_alarms, row.hits + row.false_alarms);
        if compared > 0 {
            row.brier = Some(s / f64::from(compared));
            row.brier_raw = Some(s_raw / f64::from(compared));
        }
    }
    let reliability = bins
        .iter()
        .enumerate()
        .map(|(i, (n, sum, haze))| ReliabilityBin {
            from: edges[i],
            to: edges[i + 1],
            n: *n,
            mean_chance: (*n > 0).then(|| sum / f64::from(*n)),
            observed: ratio(*haze, *n),
        })
        .collect();
    Ok(ChanceCheckOutput {
        alert: method::HAZE_CHANCE_ALERT,
        threshold_pm10_ugm3: method::HAZE_PM10_UGM3,
        leads: rows,
        reliability,
        definitions: DEFINITIONS,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(rows: Vec<[f64; 3]>) -> ChanceModel {
        ChanceModel { id: "test".into(), coefficients: rows }
    }

    #[test]
    fn ln_and_exp_match_known_values() {
        for (x, want) in [(1.0, 0.0), (2.0, LN_2), (10.0, 2.302_585_092_994_046), (100.0, 4.605_170_185_988_092), (0.5, -LN_2)] {
            assert!((ln(x) - want).abs() < 1e-14, "ln({x}) = {} want {want}", ln(x));
        }
        for (x, want) in [(0.0, 1.0), (1.0, std::f64::consts::E), (-1.0, 1.0 / std::f64::consts::E), (10.0, 22_026.465_794_806_718)] {
            assert!(((exp(x) - want) / want).abs() < 1e-14, "exp({x}) = {} want {want}", exp(x));
        }
        for x in [1.0_f64, 3.7, 55.0, 99.9, 100.0, 250.0, 1234.5] {
            assert!((exp(ln(x)) / x - 1.0).abs() < 1e-13);
        }
    }

    #[test]
    fn chance_is_the_logistic_of_the_linear_score() {
        let m = model(vec![[-20.0, 4.0, 0.5]]);
        // z = -20 + 4 ln 100 + 0.5 ln 100 = -20 + 4.5 * 4.60517 = 0.72327
        let p = chance(&m, 0, Some(100.0), Some(100.0)).unwrap();
        assert_eq!(p, 0.673);
        assert_eq!(chance(&m, 1, Some(100.0), Some(100.0)), None, "lead day outside the model");
        assert_eq!(chance(&m, 0, None, Some(100.0)), None);
        assert_eq!(chance(&m, 0, Some(100.0), None), None);
        // Floored: 0 and 1 give the same input.
        assert_eq!(chance(&m, 0, Some(0.0), Some(0.0)), chance(&m, 0, Some(1.0), Some(1.0)));
        assert_eq!(chance(&model(vec![[100.0, 0.0, 0.0]]), 0, Some(1.0), Some(1.0)), Some(1.0));
        assert_eq!(chance(&model(vec![[-100.0, 0.0, 0.0]]), 0, Some(1.0), Some(1.0)), Some(0.0));
    }

    #[test]
    fn rejects_bad_models() {
        assert!(validate(&model(vec![])).is_err());
        assert!(validate(&model(vec![[f64::NAN, 0.0, 0.0]])).is_err());
        assert!(validate(&model(vec![[0.0, 0.0, 0.0]; 17])).is_err());
        assert!(validate(&ChanceModel { id: " ".into(), coefficients: vec![[0.0; 3]] }).is_err());
        assert!(validate(&model(vec![[0.0, 1.0, 1.0]; 5])).is_ok());
    }

    #[test]
    fn check_counts_table_brier_and_bins() {
        // Lead 0: chance 1 for F >= 100 (huge slope), else 0.
        let m = model(vec![[-460.517, 100.0, 0.0], [0.0, 0.0, 0.0]]);
        let out = chance_check(&ChanceCheckInput {
            lead_days: 2,
            models: vec![m],
            pairs: vec![
                (0, 0, Some(150.0), Some(80.0), Some(120.0)), // warned, haze: hit
                (0, 0, Some(150.0), Some(80.0), Some(40.0)),  // warned, clear: false alarm
                (0, 0, Some(50.0), Some(80.0), Some(130.0)),  // quiet, haze: miss
                (0, 0, Some(50.0), Some(80.0), Some(30.0)),   // quiet, clear
                (0, 0, None, Some(80.0), Some(30.0)),         // missing
                (0, 1, Some(500.0), Some(500.0), Some(500.0)), // chance 0.5 exactly: warned, hit
            ],
        })
        .unwrap();
        let r = &out.leads[0];
        assert_eq!((r.pairs, r.missing, r.hits, r.false_alarms, r.misses, r.correct_negatives), (5, 1, 1, 1, 1, 1));
        assert_eq!((r.pod, r.far), (Some(0.5), Some(0.5)));
        assert_eq!(r.brier, Some(0.5));
        assert_eq!(r.brier_raw, Some(0.5));
        let r1 = &out.leads[1];
        assert_eq!((r1.hits, r1.brier), (1, Some(0.25)));
        let n: u32 = out.reliability.iter().map(|b| b.n).sum();
        assert_eq!(n, 5);
        assert_eq!(out.reliability[4].n, 2, "chance 1.0 falls in the last bin");
        assert_eq!(out.reliability[2].n, 1, "chance 0.5 falls in 0.4-0.6");
        assert_eq!(out.alert, method::HAZE_CHANCE_ALERT);
    }

    #[test]
    fn check_rejects_bad_input() {
        let m = || vec![model(vec![[0.0; 3]])];
        assert!(chance_check(&ChanceCheckInput { lead_days: 1, models: m(), pairs: vec![(1, 0, None, None, None)] }).is_err());
        assert!(chance_check(&ChanceCheckInput { lead_days: 1, models: m(), pairs: vec![(0, 1, None, None, None)] }).is_err());
        assert!(chance_check(&ChanceCheckInput { lead_days: 1, models: m(), pairs: vec![(0, 0, Some(-1.0), None, None)] }).is_err());
        assert!(chance_check(&ChanceCheckInput { lead_days: 1, models: vec![], pairs: vec![] }).is_err());
        assert!(chance_check(&ChanceCheckInput { lead_days: 0, models: m(), pairs: vec![] }).is_err());
    }
}
