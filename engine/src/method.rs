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

/// Infiltration factor of outdoor PM2.5 into homes during forest-fire and
/// wood smoke, measured in British Columbia (Barn P, Larson T, Noullett M,
/// Kennedy S, Copes R, Brauer M. Infiltration of forest fire and residential
/// wood smoke: an evaluation of air cleaner effectiveness. J Expo Sci Environ
/// Epidemiol 2008;18(5):503-511, abstract). Mean Finf without HEPA air
/// cleaners: 0.27 (winter, n=19) and 0.61 (summer, n=13); with HEPA air
/// cleaners in place: 0.10 (winter) and 0.19 (summer). Sootsayer shows the span
/// between the winter and summer means as a range; it is not a 95% interval.
pub const FINF_NO_CLEANER: (f64, f64) = (0.27, 0.61);
pub const FINF_HEPA: (f64, f64) = (0.10, 0.19);
pub const INDOOR_SOURCE: &str = "Barn et al. 2008, J Expo Sci Environ Epidemiol 18:503-511: indoor/outdoor PM2.5 during forest fire and wood smoke in British Columbia homes. Mean infiltration 0.27 (winter) to 0.61 (summer) without HEPA air cleaners, 0.10 to 0.19 with them. Range = winter-to-summer means, not a 95% interval; open clinic windows can let in more smoke.";

/// Clean air delivery rate of a Corsi-Rosenthal box (four MERV-13 filters and
/// a 20-inch box fan) in a US EPA chamber test with simulated wildfire smoke:
/// the single-filter box fan gave 111.2 cfm and the CR box design 261% more,
/// i.e. 111.2 x 3.61 = 401.4 cfm = 682 m3/h (Holder AL, Halliday HS,
/// Virtaranta L. Indoor Air 2022;32(11):e13163, abstract; 1 cfm = 1.699 m3/h).
/// Home builds vary with the fan and filters, and smoke-loaded filters lose
/// much of their CADR.
pub const CR_BOX_CADR_M3H: f64 = 682.0;
pub const CR_BOX_SOURCE: &str = "Holder et al. 2022, Indoor Air 32:e13163 (US EPA chamber test, simulated wildfire smoke): Corsi-Rosenthal box with four MERV-13 filters, 401 cfm = 682 m3/h. Your build can differ; change filters often during smoke.";

/// Limits the UI must show next to the numbers (product house rule 3).
pub const LIMITS: [&str; 5] = [
    "One study: six puskesmas in Palangka Raya and Pulang Pisau, 2015-2019.",
    "The effect was clear in Pulang Pisau (kabupaten) and absent in Palangka Raya city (kota); the authors call the overall result inconclusive.",
    "Outside Central Kalimantan the study's estimates are applied by analogy: other Kalimantan provinces and Sumatra were not part of the study.",
    "Relative risks are cumulative over lag 0-5 days and are applied as daily multipliers, which is exact only for sustained haze.",
    "Smoke values are model estimates (CAMS, about 45 km grid), not station measurements.",
];

/// The same limits in Bahasa Indonesia, item for item.
pub const LIMITS_ID: [&str; 5] = [
    "Satu studi: enam puskesmas di Palangka Raya dan Pulang Pisau, 2015-2019.",
    "Efeknya jelas di Pulang Pisau (kabupaten) dan tidak ada di Kota Palangka Raya (kota); penulis menyebut hasil keseluruhannya belum konklusif.",
    "Di luar Kalimantan Tengah, angka studi dipakai dengan analogi: provinsi Kalimantan lain dan Sumatra tidak diteliti.",
    "Risiko relatif adalah kumulatif lag 0-5 hari dan dipakai sebagai pengali harian; ini tepat hanya untuk kabut yang berlangsung terus.",
    "Nilai asap adalah perkiraan model (CAMS, grid sekitar 45 km), bukan pengukuran stasiun.",
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
