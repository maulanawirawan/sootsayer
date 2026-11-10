//! Haze-day classification, duration, relative risk, and expected visits.

use std::collections::{BTreeMap, HashSet};

use crate::dates;
use crate::error::EngineError;
use crate::method::{self, Definition};
use crate::model::*;

/// Classify one district-day.
/// Returns (status, fire_data).
pub fn classify(pm10_ugm3: Option<f64>, fire_count: Option<u32>) -> (DayStatus, bool) {
    let fire_data = fire_count.is_some();
    let status = match pm10_ugm3 {
        None => DayStatus::Unknown,
        Some(v) if v < method::HAZE_PM10_UGM3 => DayStatus::Clear,
        Some(_) => match fire_count {
            Some(c) if c > 0 => DayStatus::FireHaze,
            _ => DayStatus::Haze,
        },
    };
    (status, fire_data)
}

fn validate(input: &OutlookInput) -> Result<usize, EngineError> {
    if input.days.is_empty() {
        return Err(EngineError::new("days must not be empty"));
    }
    let mut prev: Option<i64> = None;
    for d in &input.days {
        let n = dates::parse(d).ok_or_else(|| EngineError::new(format!("invalid date '{d}' (want YYYY-MM-DD)")))?;
        if let Some(p) = prev {
            if n != p + 1 {
                return Err(EngineError::new(format!("days must be contiguous; '{d}' does not follow the previous day")));
            }
        }
        prev = Some(n);
    }
    let window = input
        .days
        .iter()
        .position(|d| d == &input.window_start)
        .ok_or_else(|| EngineError::new(format!("window_start '{}' is not in days", input.window_start)))?;

    let n = input.days.len();
    let mut codes = HashSet::new();
    for d in &input.districts {
        if !codes.insert(d.code.as_str()) {
            return Err(EngineError::new(format!("duplicate district code '{}'", d.code)));
        }
        if d.pm10_ugm3.len() != n || d.fire_count.len() != n {
            return Err(EngineError::new(format!(
                "district '{}': pm10_ugm3 has {} values and fire_count has {}, expected {n}",
                d.code,
                d.pm10_ugm3.len(),
                d.fire_count.len()
            )));
        }
        if let Some(bad) = d.pm10_ugm3.iter().flatten().find(|v| !v.is_finite() || **v < 0.0) {
            return Err(EngineError::new(format!("district '{}': invalid pm10 value {bad}", d.code)));
        }
    }
    let mut ids = HashSet::new();
    for p in &input.puskesmas {
        if !ids.insert(p.id.as_str()) {
            return Err(EngineError::new(format!("duplicate puskesmas id '{}'", p.id)));
        }
        if !codes.contains(p.district_code.as_str()) {
            return Err(EngineError::new(format!("puskesmas '{}': unknown district '{}'", p.id, p.district_code)));
        }
        if let Some(b) = p.baseline_visits_per_day {
            if !b.is_finite() || b < 0.0 {
                return Err(EngineError::new(format!("puskesmas '{}': invalid baseline {b}", p.id)));
            }
        }
    }
    Ok(window)
}

fn district_outlook(d: &DistrictInput, days: &[String], window: usize) -> DistrictOutlook {
    let mut run = 0u32;
    let mut out_days = Vec::with_capacity(days.len());
    let (mut complete, mut haze_days, mut fire_haze_days) = (true, 0u32, 0u32);
    for (i, date) in days.iter().enumerate() {
        let (status, fire_data) = classify(d.pm10_ugm3[i], d.fire_count[i]);
        run = match status {
            DayStatus::Haze | DayStatus::FireHaze => run + 1,
            DayStatus::Clear | DayStatus::Unknown => 0,
        };
        let group = DurationGroup::of(run);
        let rr = match (status, group) {
            (DayStatus::Unknown, _) => None,
            (DayStatus::Clear, _) => Some(Range::ONE),
            (DayStatus::Haze, Some(g)) => Some(method::relative_risk(d.profile, Definition::Haze, g)),
            (DayStatus::FireHaze, Some(g)) => Some(method::relative_risk(d.profile, Definition::FireHaze, g)),
            // A haze status always has run >= 1, so a group exists.
            (_, None) => None,
        };
        let in_window = i >= window;
        if in_window {
            match status {
                DayStatus::Unknown => complete = false,
                DayStatus::Haze => haze_days += 1,
                DayStatus::FireHaze => {
                    haze_days += 1;
                    fire_haze_days += 1;
                }
                DayStatus::Clear => {}
            }
        }
        out_days.push(DistrictDay {
            date: date.clone(),
            in_window,
            pm10_ugm3: d.pm10_ugm3[i],
            fire_count: d.fire_count[i],
            status,
            duration_days: run,
            duration_group: group,
            rr,
            fire_data,
        });
    }
    DistrictOutlook {
        code: d.code.clone(),
        name: d.name.clone(),
        profile: d.profile,
        days: out_days,
        complete,
        haze_days,
        fire_haze_days,
    }
}

fn puskesmas_outlook(p: &PuskesmasInput, district: &DistrictOutlook) -> PuskesmasOutlook {
    let (baseline, baseline_source) = match p.baseline_visits_per_day {
        Some(b) => (b, BaselineSource::User),
        None => (
            method::default_baseline(district.profile),
            match district.profile {
                Profile::Kota => BaselineSource::DefaultKota,
                Profile::Kabupaten => BaselineSource::DefaultKabupaten,
            },
        ),
    };
    let mut window_extra = Range::ZERO;
    let days = district
        .days
        .iter()
        .map(|dd| {
            let expected = dd.rr.map(|r| r.scale(baseline));
            let extra = expected.map(|e| e.minus(baseline));
            if dd.in_window {
                if let Some(x) = extra {
                    window_extra = window_extra.add(x);
                }
            }
            PuskesmasDay { date: dd.date.clone(), in_window: dd.in_window, expected, extra }
        })
        .collect();
    PuskesmasOutlook {
        id: p.id.clone(),
        name: p.name.clone(),
        district_code: p.district_code.clone(),
        baseline_visits_per_day: baseline,
        baseline_source,
        days,
        window_extra,
        complete: district.complete,
    }
}

fn priority(districts: &[DistrictOutlook], puskesmas: &[PuskesmasOutlook]) -> Vec<PriorityEntry> {
    let mut sums: BTreeMap<&str, (Range, u32)> = BTreeMap::new();
    for p in puskesmas {
        let e = sums.entry(p.district_code.as_str()).or_insert((Range::ZERO, 0));
        e.0 = e.0.add(p.window_extra);
        e.1 += 1;
    }
    let mut entries: Vec<PriorityEntry> = districts
        .iter()
        .map(|d| {
            let (window_extra, puskesmas_count) = sums.get(d.code.as_str()).copied().unwrap_or((Range::ZERO, 0));
            PriorityEntry {
                district_code: d.code.clone(),
                district_name: d.name.clone(),
                rank: None,
                window_extra,
                haze_days: d.haze_days,
                fire_haze_days: d.fire_haze_days,
                puskesmas_count,
                complete: d.complete,
            }
        })
        .collect();
    // Complete districts first, ordered by expected extra visits, then fire-haze
    // days, then haze days; the code breaks ties so the order is deterministic.
    entries.sort_by(|a, b| {
        b.complete
            .cmp(&a.complete)
            .then(b.window_extra.point.total_cmp(&a.window_extra.point))
            .then(b.fire_haze_days.cmp(&a.fire_haze_days))
            .then(b.haze_days.cmp(&a.haze_days))
            .then(a.district_code.cmp(&b.district_code))
    });
    let mut rank = 0;
    for e in entries.iter_mut().filter(|e| e.complete) {
        rank += 1;
        e.rank = Some(rank);
    }
    entries
}

pub fn outlook(input: &OutlookInput) -> Result<OutlookOutput, EngineError> {
    let window = validate(input)?;
    let districts: Vec<DistrictOutlook> =
        input.districts.iter().map(|d| district_outlook(d, &input.days, window)).collect();
    let by_code: BTreeMap<&str, &DistrictOutlook> = districts.iter().map(|d| (d.code.as_str(), d)).collect();
    let puskesmas: Vec<PuskesmasOutlook> = input
        .puskesmas
        .iter()
        .map(|p| puskesmas_outlook(p, by_code[p.district_code.as_str()]))
        .collect();
    let priority = priority(&districts, &puskesmas);
    Ok(OutlookOutput {
        method: MethodInfo {
            citation: method::CITATION,
            doi: method::DOI,
            haze_pm10_ugm3: method::HAZE_PM10_UGM3,
            rr_source: "Table 4, main model (cumulative relative risk, lag 0-5)",
            baseline_source: "Table 2, daily mean respiratory visits 2015-2019 (kota 5.9, kabupaten 2.5)",
            limits: method::LIMITS.to_vec(),
        },
        days: input.days.clone(),
        window_start: input.window_start.clone(),
        districts,
        puskesmas,
        priority,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn days(n: usize) -> Vec<String> {
        (0..n).map(|i| format!("2026-10-{:02}", i + 1)).collect()
    }

    fn input(pm10: Vec<Option<f64>>, fires: Vec<Option<u32>>, profile: Profile, window: usize) -> OutlookInput {
        let n = pm10.len();
        let days = days(n);
        OutlookInput {
            window_start: days[window].clone(),
            days,
            districts: vec![DistrictInput {
                code: "D1".into(),
                name: "Test".into(),
                profile,
                pm10_ugm3: pm10,
                fire_count: fires,
            }],
            puskesmas: vec![PuskesmasInput {
                id: "P1".into(),
                name: "Puskesmas Test".into(),
                district_code: "D1".into(),
                baseline_visits_per_day: None,
            }],
        }
    }

    #[test]
    fn threshold_is_inclusive() {
        assert_eq!(classify(Some(99.9), Some(5)).0, DayStatus::Clear);
        assert_eq!(classify(Some(100.0), Some(0)).0, DayStatus::Haze);
        assert_eq!(classify(Some(100.0), Some(1)).0, DayStatus::FireHaze);
        assert_eq!(classify(Some(500.0), None), (DayStatus::Haze, false));
        assert_eq!(classify(None, Some(3)).0, DayStatus::Unknown);
    }

    #[test]
    fn duration_groups_switch_at_4_and_15() {
        let n = 16;
        let out = outlook(&input(vec![Some(200.0); n], vec![Some(0); n], Profile::Kabupaten, 0)).unwrap();
        let g: Vec<_> = out.districts[0].days.iter().map(|d| d.duration_group).collect();
        assert_eq!(g[2], Some(DurationGroup::D1to3));
        assert_eq!(g[3], Some(DurationGroup::D4to14));
        assert_eq!(g[13], Some(DurationGroup::D4to14));
        assert_eq!(g[14], Some(DurationGroup::D15plus));
        assert_eq!(out.districts[0].days[15].rr.unwrap().point, 1.828);
    }

    #[test]
    fn clear_or_unknown_day_ends_a_run() {
        let pm = vec![Some(150.0), Some(150.0), Some(20.0), Some(150.0), None, Some(150.0)];
        let out = outlook(&input(pm, vec![Some(0); 6], Profile::Kabupaten, 0)).unwrap();
        let runs: Vec<u32> = out.districts[0].days.iter().map(|d| d.duration_days).collect();
        assert_eq!(runs, vec![1, 2, 0, 1, 0, 1]);
        assert!(!out.districts[0].complete);
        assert!(out.districts[0].days[4].rr.is_none());
    }

    #[test]
    fn expected_visits_use_default_baseline_and_rr() {
        let out = outlook(&input(vec![Some(300.0); 5], vec![Some(4); 5], Profile::Kabupaten, 4)).unwrap();
        let p = &out.puskesmas[0];
        assert_eq!(p.baseline_source, BaselineSource::DefaultKabupaten);
        let day5 = p.days[4].expected.unwrap();
        // Day 5 of a fire-haze run: 4-14 group, kabupaten fire-haze 1.700 (1.111-2.601).
        assert!((day5.point - 2.5 * 1.700).abs() < 1e-12);
        assert!((day5.low - 2.5 * 1.111).abs() < 1e-12);
        assert!((day5.high - 2.5 * 2.601).abs() < 1e-12);
        assert!((p.window_extra.point - (2.5 * 1.700 - 2.5)).abs() < 1e-12);
    }

    #[test]
    fn user_baseline_wins() {
        let mut inp = input(vec![Some(300.0); 3], vec![Some(0); 3], Profile::Kota, 0);
        inp.puskesmas[0].baseline_visits_per_day = Some(10.0);
        let out = outlook(&inp).unwrap();
        assert_eq!(out.puskesmas[0].baseline_source, BaselineSource::User);
        assert!((out.puskesmas[0].days[0].expected.unwrap().point - 9.92).abs() < 1e-9);
    }

    #[test]
    fn incomplete_districts_are_not_ranked() {
        let mut inp = input(vec![Some(300.0), None], vec![Some(1), Some(1)], Profile::Kabupaten, 0);
        inp.districts.push(DistrictInput {
            code: "D2".into(),
            name: "Clear".into(),
            profile: Profile::Kabupaten,
            pm10_ugm3: vec![Some(10.0), Some(10.0)],
            fire_count: vec![Some(0), Some(0)],
        });
        let out = outlook(&inp).unwrap();
        let d1 = out.priority.iter().find(|e| e.district_code == "D1").unwrap();
        let d2 = out.priority.iter().find(|e| e.district_code == "D2").unwrap();
        assert_eq!(d1.rank, None);
        assert_eq!(d2.rank, Some(1));
    }

    #[test]
    fn rejects_bad_input() {
        let mut inp = input(vec![Some(1.0); 3], vec![Some(0); 3], Profile::Kota, 0);
        inp.days[1] = "2026-10-05".into();
        assert!(outlook(&inp).unwrap_err().to_string().contains("contiguous"));

        let mut inp = input(vec![Some(1.0); 3], vec![Some(0); 2], Profile::Kota, 0);
        inp.window_start = "2026-10-01".into();
        assert!(outlook(&inp).unwrap_err().to_string().contains("expected 3"));

        let mut inp = input(vec![Some(f64::NAN); 3], vec![Some(0); 3], Profile::Kota, 0);
        inp.window_start = "2026-10-01".into();
        assert!(outlook(&inp).is_err());

        let mut inp = input(vec![Some(1.0); 3], vec![Some(0); 3], Profile::Kota, 0);
        inp.puskesmas[0].district_code = "nope".into();
        assert!(outlook(&inp).unwrap_err().to_string().contains("unknown district"));
    }
}
