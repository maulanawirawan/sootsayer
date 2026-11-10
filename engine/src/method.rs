//! Study constants. This is the only place where numbers from the literature
//! live. Every value carries its source so it can be checked.
//!
//! Main source: Phung VLH, Ueda K, Yulianti N, et al. "Effects of smoke haze on
//! respiratory clinic visits in Central Kalimantan, Indonesia according to
//! different haze characteristics." International Journal of Epidemiology,
//! 2025. doi:10.1093/ije/dyaf169 (open access: PMC12533422).

use crate::model::{DurationGroup, Profile, Range};

pub const CITATION: &str = "Phung et al. 2025, Effects of smoke haze on respiratory clinic visits in Central Kalimantan, Indonesia according to different haze characteristics. International Journal of Epidemiology.";
pub const DOI: &str = "10.1093/ije/dyaf169";

/// Haze day: daily mean PM10 at or above this value (Table 1, Definition-1).
pub const HAZE_PM10_UGM3: f64 = 100.0;

/// Default daily respiratory visits per puskesmas, kota profile.
/// Table 2: Kereng Bangkirai 2.6, Menteng 9.4, Tangkiling 5.6 -> mean 5.87.
pub const BASELINE_KOTA: f64 = 5.9;

/// Default daily respiratory visits per puskesmas, kabupaten profile.
/// Table 2: Bereng 2.5, Bukit Rawi 1.8, Pulang Pisau 3.2 -> mean 2.5.
pub const BASELINE_KABUPATEN: f64 = 2.5;

/// Clean air target for a cleaner-air room: at least 5 air changes per hour
/// of clean air in occupied rooms (US CDC/NIOSH "Aim for 5", Ventilation in
/// Buildings, 2023). The target was set for respiratory viruses; Sootsayer uses
/// it as a practical clean-air-room target during smoke, and says so.
pub const CLEAN_AIR_TARGET_ACH: f64 = 5.0;
pub const CLEAN_AIR_SOURCE: &str = "US CDC/NIOSH 'Aim for 5' (Ventilation in Buildings, 2023): at least 5 air changes per hour of clean air in occupied rooms. Set for respiratory viruses; used here as a practical target for a clean-air room during smoke.";

/// Which haze definition a relative risk belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Definition {
    /// Definition-1: PM10 >= 100, fire activity not considered.
    Haze,
    /// Definition-2: PM10 >= 100 and at least one fire hotspot.
    FireHaze,
}

/// Cumulative relative risk (lag 0-5) of respiratory visits on a haze day
/// versus a non-haze day. Table 4, "Main model" column.
///
/// Note: the abstract reports Pulang Pisau fire-haze overall as +74.4%, while
/// Table 4 gives 1.774 (1.189-2.646). The geometric mean of that interval is
/// 1.774, so the table is treated as authoritative. Duration-group values
/// below are all taken from Table 4.
pub fn relative_risk(profile: Profile, definition: Definition, group: DurationGroup) -> Range {
    use Definition::{FireHaze, Haze};
    use DurationGroup::{D1to3, D4to14, D15plus};
    use Profile::{Kabupaten, Kota};
    let (point, low, high) = match (profile, definition, group) {
        // Pulang Pisau Regency (kabupaten profile)
        (Kabupaten, Haze, D1to3) => (1.195, 0.877, 1.629),
        (Kabupaten, Haze, D4to14) => (1.573, 1.201, 2.060),
        (Kabupaten, Haze, D15plus) => (1.828, 1.317, 2.537),
        (Kabupaten, FireHaze, D1to3) => (1.317, 0.908, 1.912),
        (Kabupaten, FireHaze, D4to14) => (1.700, 1.111, 2.601),
        (Kabupaten, FireHaze, D15plus) => (1.881, 1.138, 3.108),
        // Palangka Raya City (kota profile)
        (Kota, Haze, D1to3) => (0.992, 0.833, 1.181),
        (Kota, Haze, D4to14) => (0.968, 0.821, 1.141),
        (Kota, Haze, D15plus) => (0.703, 0.561, 0.883),
        (Kota, FireHaze, D1to3) => (0.929, 0.732, 1.180),
        (Kota, FireHaze, D4to14) => (0.970, 0.755, 1.247),
        (Kota, FireHaze, D15plus) => (1.333, 0.169, 10.496),
    };
    Range { point, low, high }
}

pub fn default_baseline(profile: Profile) -> f64 {
    match profile {
        Profile::Kota => BASELINE_KOTA,
        Profile::Kabupaten => BASELINE_KABUPATEN,
    }
}

/// Limits the UI must show next to the numbers (product house rule 3).
pub const LIMITS: [&str; 4] = [
    "One study: six puskesmas in Palangka Raya and Pulang Pisau, 2015-2019.",
    "The effect was clear in Pulang Pisau (kabupaten) and absent in Palangka Raya city (kota); the authors call the overall result inconclusive.",
    "Relative risks are cumulative over lag 0-5 days and are applied as daily multipliers, which is exact only for sustained haze.",
    "Smoke values are model estimates (CAMS, about 45 km grid), not station measurements.",
];

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [(Profile, Definition, DurationGroup); 12] = [
        (Profile::Kabupaten, Definition::Haze, DurationGroup::D1to3),
        (Profile::Kabupaten, Definition::Haze, DurationGroup::D4to14),
        (Profile::Kabupaten, Definition::Haze, DurationGroup::D15plus),
        (Profile::Kabupaten, Definition::FireHaze, DurationGroup::D1to3),
        (Profile::Kabupaten, Definition::FireHaze, DurationGroup::D4to14),
        (Profile::Kabupaten, Definition::FireHaze, DurationGroup::D15plus),
        (Profile::Kota, Definition::Haze, DurationGroup::D1to3),
        (Profile::Kota, Definition::Haze, DurationGroup::D4to14),
        (Profile::Kota, Definition::Haze, DurationGroup::D15plus),
        (Profile::Kota, Definition::FireHaze, DurationGroup::D1to3),
        (Profile::Kota, Definition::FireHaze, DurationGroup::D4to14),
        (Profile::Kota, Definition::FireHaze, DurationGroup::D15plus),
    ];

    #[test]
    fn every_cell_has_ordered_interval() {
        for (p, d, g) in ALL {
            let r = relative_risk(p, d, g);
            assert!(r.low > 0.0 && r.low <= r.point && r.point <= r.high, "{p:?} {d:?} {g:?}");
        }
    }

    #[test]
    fn point_is_close_to_geometric_mean_of_interval() {
        // Log-symmetric intervals: point ~= sqrt(low * high). Catches typos.
        for (p, d, g) in ALL {
            let r = relative_risk(p, d, g);
            let gm = (r.low * r.high).sqrt();
            assert!((gm - r.point).abs() / r.point < 0.03, "{p:?} {d:?} {g:?}: {} vs {gm}", r.point);
        }
    }

    #[test]
    fn kabupaten_effect_grows_with_duration() {
        for d in [Definition::Haze, Definition::FireHaze] {
            let a = relative_risk(Profile::Kabupaten, d, DurationGroup::D1to3).point;
            let b = relative_risk(Profile::Kabupaten, d, DurationGroup::D4to14).point;
            let c = relative_risk(Profile::Kabupaten, d, DurationGroup::D15plus).point;
            assert!(a < b && b < c);
        }
    }

    #[test]
    fn default_baselines_match_table_2_means() {
        let kota: f64 = (2.6 + 9.4 + 5.6) / 3.0;
        let kab: f64 = (2.5 + 1.8 + 3.2) / 3.0;
        assert!((BASELINE_KOTA - kota).abs() < 0.05);
        assert!((BASELINE_KABUPATEN - kab).abs() < 0.05);
    }
}
