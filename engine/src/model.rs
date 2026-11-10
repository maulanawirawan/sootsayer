//! Input and output types. Field names carry their units.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Profile {
    /// Urban area; estimates from Palangka Raya City.
    Kota,
    /// Regency; estimates from Pulang Pisau Regency.
    Kabupaten,
}

/// A point estimate with its 95% interval.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Range {
    pub point: f64,
    pub low: f64,
    pub high: f64,
}

impl Range {
    pub const ZERO: Range = Range { point: 0.0, low: 0.0, high: 0.0 };
    pub const ONE: Range = Range { point: 1.0, low: 1.0, high: 1.0 };

    pub fn scale(self, k: f64) -> Range {
        Range { point: self.point * k, low: self.low * k, high: self.high * k }
    }

    pub fn minus(self, k: f64) -> Range {
        Range { point: self.point - k, low: self.low - k, high: self.high - k }
    }

    pub fn add(self, other: Range) -> Range {
        Range {
            point: self.point + other.point,
            low: self.low + other.low,
            high: self.high + other.high,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DayStatus {
    Clear,
    Haze,
    FireHaze,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum DurationGroup {
    #[serde(rename = "1-3")]
    D1to3,
    #[serde(rename = "4-14")]
    D4to14,
    #[serde(rename = "15+")]
    D15plus,
}

impl DurationGroup {
    pub fn of(run_days: u32) -> Option<DurationGroup> {
        match run_days {
            0 => None,
            1..=3 => Some(DurationGroup::D1to3),
            4..=14 => Some(DurationGroup::D4to14),
            _ => Some(DurationGroup::D15plus),
        }
    }
}

// ---------- outlook input ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistrictInput {
    pub code: String,
    pub name: String,
    pub profile: Profile,
    pub pm10_ugm3: Vec<Option<f64>>,
    pub fire_count: Vec<Option<u32>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PuskesmasInput {
    pub id: String,
    pub name: String,
    pub district_code: String,
    #[serde(default)]
    pub baseline_visits_per_day: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutlookInput {
    pub days: Vec<String>,
    pub window_start: String,
    pub districts: Vec<DistrictInput>,
    #[serde(default)]
    pub puskesmas: Vec<PuskesmasInput>,
}

// ---------- outlook output ----------

#[derive(Debug, Clone, Serialize)]
pub struct DistrictDay {
    pub date: String,
    pub in_window: bool,
    pub pm10_ugm3: Option<f64>,
    pub fire_count: Option<u32>,
    pub status: DayStatus,
    pub duration_days: u32,
    pub duration_group: Option<DurationGroup>,
    /// None when the day is unknown; exactly 1 on clear days.
    pub rr: Option<Range>,
    /// False when fire data was missing for that day.
    pub fire_data: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DistrictOutlook {
    pub code: String,
    pub name: String,
    pub profile: Profile,
    pub days: Vec<DistrictDay>,
    /// True when every window day has PM10 data.
    pub complete: bool,
    pub haze_days: u32,
    pub fire_haze_days: u32,
    /// Mean of (relative risk - 1) over known window days: the expected
    /// relative change in respiratory visits. Independent of baselines and of
    /// how many puskesmas are mapped. None when no window day is known.
    pub window_mean_change: Option<Range>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BaselineSource {
    User,
    DefaultKota,
    DefaultKabupaten,
}

#[derive(Debug, Clone, Serialize)]
pub struct PuskesmasDay {
    pub date: String,
    pub in_window: bool,
    pub expected: Option<Range>,
    pub extra: Option<Range>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PuskesmasOutlook {
    pub id: String,
    pub name: String,
    pub district_code: String,
    pub baseline_visits_per_day: f64,
    pub baseline_source: BaselineSource,
    pub days: Vec<PuskesmasDay>,
    /// Sum of extra visits over known window days.
    pub window_extra: Range,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct PriorityEntry {
    pub district_code: String,
    pub district_name: String,
    /// None for incomplete districts: they are listed, never ranked low.
    pub rank: Option<u32>,
    /// Ranking key: expected relative change in visits over the window.
    pub mean_change: Option<Range>,
    /// Extra visits summed over the puskesmas in the input (mapped ones only).
    pub window_extra: Range,
    pub haze_days: u32,
    pub fire_haze_days: u32,
    pub puskesmas_count: u32,
    pub complete: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MethodInfo {
    pub citation: &'static str,
    pub doi: &'static str,
    pub haze_pm10_ugm3: f64,
    pub rr_source: &'static str,
    pub baseline_source: &'static str,
    pub limits: Vec<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OutlookOutput {
    pub method: MethodInfo,
    pub days: Vec<String>,
    pub window_start: String,
    pub districts: Vec<DistrictOutlook>,
    pub puskesmas: Vec<PuskesmasOutlook>,
    pub priority: Vec<PriorityEntry>,
}

// ---------- clean-air plan ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CleanAirInput {
    pub floor_area_m2: f64,
    pub ceiling_height_m: f64,
    pub unit_cadr_m3h: f64,
    #[serde(default)]
    pub target_ach: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CleanAirOutput {
    pub volume_m3: f64,
    pub target_ach: f64,
    pub cadr_needed_m3h: f64,
    pub unit_cadr_m3h: f64,
    pub units: u32,
    pub delivered_ach: f64,
    pub source: &'static str,
}

// ---------- fire assignment ----------

/// A district as a multipolygon: polygons -> rings -> [lon, lat] points.
/// The first ring of each polygon is the outer ring, the rest are holes.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DistrictShape {
    pub code: String,
    pub multipolygon: Vec<Vec<Vec<[f64; 2]>>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FireCountInput {
    pub days: Vec<String>,
    pub districts: Vec<DistrictShape>,
    /// [lon, lat, "YYYY-MM-DD"]
    pub fires: Vec<(f64, f64, String)>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FireCountOutput {
    pub days: Vec<String>,
    /// district code -> count per day, aligned with `days`.
    pub counts: std::collections::BTreeMap<String, Vec<u32>>,
    /// Fires inside the date range but outside every district.
    pub outside_districts: u32,
    /// Fires with a date outside `days`.
    pub outside_days: u32,
}
