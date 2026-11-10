//! Property-based tests for the engine's invariants.

use proptest::prelude::*;
use sootsayer_engine::model::*;
use sootsayer_engine::outlook::outlook;
use sootsayer_engine::plan::clean_air;

fn day_strings(n: usize) -> Vec<String> {
    // Contiguous days starting 2026-09-17 (crosses into October).
    (0..n)
        .map(|i| {
            let (m, d) = if i < 14 { (9, 17 + i) } else { (10, i - 13) };
            format!("2026-{m:02}-{d:02}")
        })
        .collect()
}

fn profile() -> impl Strategy<Value = Profile> {
    prop_oneof![Just(Profile::Kota), Just(Profile::Kabupaten)]
}

fn pm10() -> impl Strategy<Value = Option<f64>> {
    prop_oneof![1 => Just(None), 9 => (0.0f64..1500.0).prop_map(Some)]
}

fn fires() -> impl Strategy<Value = Option<u32>> {
    prop_oneof![1 => Just(None), 9 => (0u32..30).prop_map(Some)]
}

prop_compose! {
    fn outlook_input()(n in 1usize..40)
        (pm in prop::collection::vec(pm10(), n),
         fc in prop::collection::vec(fires(), n),
         profile in profile(),
         baseline in prop::option::of(0.0f64..60.0),
         window in 0..n,
         n in Just(n)) -> OutlookInput {
        let days = day_strings(n);
        OutlookInput {
            window_start: days[window].clone(),
            days,
            districts: vec![DistrictInput {
                code: "D".into(), name: "D".into(), profile, pm10_ugm3: pm, fire_count: fc,
            }],
            puskesmas: vec![PuskesmasInput {
                id: "P".into(), name: "P".into(), district_code: "D".into(),
                baseline_visits_per_day: baseline,
            }],
        }
    }
}

fn ordered(r: &Range) -> bool {
    r.low <= r.point && r.point <= r.high
}

proptest! {
    #[test]
    fn ranges_are_always_ordered(input in outlook_input()) {
        let out = outlook(&input).unwrap();
        for d in &out.districts[0].days {
            if let Some(rr) = &d.rr { prop_assert!(ordered(rr)); }
        }
        let p = &out.puskesmas[0];
        for d in &p.days {
            if let Some(e) = &d.expected { prop_assert!(ordered(e)); }
            if let Some(x) = &d.extra { prop_assert!(ordered(x)); }
        }
        prop_assert!(ordered(&p.window_extra));
    }

    #[test]
    fn clear_days_leave_visits_unchanged_and_unknown_days_give_nothing(input in outlook_input()) {
        let out = outlook(&input).unwrap();
        let p = &out.puskesmas[0];
        for (dd, pd) in out.districts[0].days.iter().zip(&p.days) {
            match dd.status {
                DayStatus::Clear => {
                    let e = pd.expected.unwrap();
                    prop_assert_eq!(e.point, p.baseline_visits_per_day);
                    prop_assert_eq!(e.low, p.baseline_visits_per_day);
                    prop_assert_eq!(e.high, p.baseline_visits_per_day);
                }
                DayStatus::Unknown => prop_assert!(pd.expected.is_none()),
                _ => {}
            }
        }
    }

    #[test]
    fn kabupaten_effect_never_shrinks_during_an_unbroken_run(
        n in 1usize..40, with_fire in any::<bool>(), level in 100.0f64..1500.0
    ) {
        let days = day_strings(n);
        let input = OutlookInput {
            window_start: days[0].clone(),
            days,
            districts: vec![DistrictInput {
                code: "D".into(), name: "D".into(), profile: Profile::Kabupaten,
                pm10_ugm3: vec![Some(level); n],
                fire_count: vec![Some(if with_fire { 3 } else { 0 }); n],
            }],
            puskesmas: vec![],
        };
        let out = outlook(&input).unwrap();
        let points: Vec<f64> = out.districts[0].days.iter().map(|d| d.rr.unwrap().point).collect();
        prop_assert!(points.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn same_input_same_output(input in outlook_input()) {
        let a = serde_json::to_string(&outlook(&input).unwrap()).unwrap();
        let b = serde_json::to_string(&outlook(&input).unwrap()).unwrap();
        prop_assert_eq!(a, b);
    }

    #[test]
    fn purifier_count_covers_the_room_and_is_minimal(
        area in 1.0f64..500.0, height in 2.0f64..8.0, unit in 50.0f64..2000.0, ach in 1.0f64..12.0
    ) {
        let out = clean_air(&CleanAirInput {
            floor_area_m2: area, ceiling_height_m: height, unit_cadr_m3h: unit, target_ach: Some(ach),
        }).unwrap();
        let needed = area * height * ach;
        prop_assert!(f64::from(out.units) * unit >= needed * (1.0 - 1e-12));
        prop_assert!(out.units == 0 || f64::from(out.units - 1) * unit < needed);
    }
}
