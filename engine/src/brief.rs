//! Deterministic briefing text for health offices, in Bahasa Indonesia and
//! English.
//!
//! The web app (WebAssembly) and the MCP server (native CLI) both call this
//! code, so the text a Dinkes WhatsApp group, a Telegram channel, a printout,
//! and the screen show is the same, word for word and number for number. A
//! language model may forward it, but never writes its numbers. The engine
//! has no clock: callers pass the data times they fetched.

use crate::dates;
use crate::error::EngineError;
use crate::method;
use crate::model::{BriefInput, BriefMode, BriefOutput, Lang, PriorityEntry, Profile, Range};
use crate::outlook;

struct Words {
    title: &'static str,
    for_office: &'static str,
    mode_live: &'static str,
    mode_replay: &'static str,
    mode_forecast: &'static str,
    priority_head: &'static str,
    priority_hint: &'static str,
    haze_days: &'static str,
    fire_haze_days: &'static str,
    mapped: &'static str,
    profile_kota: &'static str,
    profile_kabupaten: &'static str,
    no_haze: &'static str,
    incomplete: &'static str,
    more: &'static str,
    kota_note: &'static str,
    future_fires: &'static str,
    sources_head: &'static str,
    failed_head: &'static str,
    method: &'static str,
    limits_head: &'static str,
    not_medical: &'static str,
    details: &'static str,
    months: [&'static str; 12],
}

const ID: Words = Words {
    title: "Briefing kabut Sootsayer",
    for_office: "untuk Dinas Kesehatan",
    mode_live: "Langsung: prakiraan CAMS terbaru",
    mode_replay: "Putar ulang (hindsight): data model arsip, bukan prakiraan yang terbit pada hari itu",
    mode_forecast: "Putar ulang (seperti diprakirakan): prakiraan CAMS yang tersedia pukul 06.00 WIB pada hari pertama",
    priority_head: "Prioritas posko & rumah oksigen",
    priority_hint: "Perkiraan perubahan kunjungan pernapasan puskesmas, rata-rata {n} hari, dengan rentang 95%:",
    haze_days: "{n} hari kabut",
    fire_haze_days: "{n} kabut berapi",
    mapped: "{n} puskesmas terpetakan",
    profile_kota: "profil kota",
    profile_kabupaten: "profil kabupaten",
    no_haze: "Tidak ada hari kabut di jendela ini untuk kabupaten/kota dengan data lengkap.",
    incomplete: "Data belum lengkap, tidak diperingkat:",
    more: "dan {n} lainnya",
    kota_note: "Profil kota: angka di bawah 0% berarti pasien bergeser ke RS, posko, atau rumah oksigen. Itu bukan kabar baik.",
    future_fires: "Hari prakiraan belum punya data api, jadi dihitung sebagai hari kabut biasa.",
    sources_head: "Sumber data:",
    failed_head: "Sumber gagal (hari tanpa data tidak dihitung):",
    method: "Metode: Phung dkk. 2025, Int J Epidemiol, doi:{doi} (Tabel 4, model utama).",
    limits_head: "Batas metode:",
    not_medical: "Ini perkiraan beban layanan untuk perencanaan, bukan nasihat medis untuk perorangan.",
    details: "Rincian:",
    months: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
};

const EN: Words = Words {
    title: "Sootsayer haze briefing",
    for_office: "for the district health office",
    mode_live: "Live: latest CAMS forecast",
    mode_replay: "Replay (hindsight): archived model data, not the forecast issued on that day",
    mode_forecast: "Replay (as forecast): the CAMS forecast available at 06:00 WIB on the first day",
    priority_head: "Priority for posko and oxygen houses",
    priority_hint: "Expected change in puskesmas respiratory visits, mean over {n} days, with 95% range:",
    haze_days: "{n} haze days",
    fire_haze_days: "{n} with local fires",
    mapped: "{n} mapped puskesmas",
    profile_kota: "city profile",
    profile_kabupaten: "regency profile",
    no_haze: "No haze days in this window for districts with complete data.",
    incomplete: "Incomplete data, not ranked:",
    more: "and {n} more",
    kota_note: "City profile: values below 0% mean patients shift to hospitals, posko, or oxygen houses. That is not good news.",
    future_fires: "Forecast days have no fire data yet, so they count as plain haze days.",
    sources_head: "Data sources:",
    failed_head: "Failed sources (days without data are not counted):",
    method: "Method: Phung et al. 2025, Int J Epidemiol, doi:{doi} (Table 4, main model).",
    limits_head: "Method limits:",
    not_medical: "This estimates clinic load for planning. It is not medical advice for individuals.",
    details: "Details:",
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const MAX_TOP: u32 = 20;
const MAX_INCOMPLETE_NAMES: usize = 8;

/// Percent with the same rounding and signs as the web app (`fmtPercent`):
/// nearest integer, ties toward +infinity, U+2212 for minus, ± for zero.
pub fn percent(x: f64) -> String {
    let v = (x * 100.0 + 0.5).floor();
    let sign = if v > 0.0 {
        "+"
    } else if v < 0.0 {
        "\u{2212}"
    } else {
        "\u{b1}"
    };
    format!("{sign}{}%", v.abs())
}

fn range_text(r: &Range) -> String {
    format!("{} ({} \u{2026} {})", percent(r.point), percent(r.low), percent(r.high))
}

fn ymd(iso: &str) -> Result<(u32, usize, u32), EngineError> {
    dates::parse(iso).ok_or_else(|| EngineError::new(format!("invalid date '{iso}'")))?;
    let y: u32 = iso[0..4].parse().map_err(|_| EngineError::new("bad year"))?;
    let m: usize = iso[5..7].parse().map_err(|_| EngineError::new("bad month"))?;
    let d: u32 = iso[8..10].parse().map_err(|_| EngineError::new("bad day"))?;
    Ok((y, m, d))
}

/// "14\u{2013}18 Okt 2026", "28 Sep \u{2013} 2 Okt 2026", or full dates across years.
fn date_span(a: &str, b: &str, w: &Words) -> Result<String, EngineError> {
    let (ya, ma, da) = ymd(a)?;
    let (yb, mb, db) = ymd(b)?;
    let mon = |m: usize| w.months[m - 1];
    Ok(if a == b {
        format!("{da} {} {ya}", mon(ma))
    } else if ya != yb {
        format!("{da} {} {ya} \u{2013} {db} {} {yb}", mon(ma), mon(mb))
    } else if ma != mb {
        format!("{da} {} \u{2013} {db} {} {yb}", mon(ma), mon(mb))
    } else {
        format!("{da}\u{2013}{db} {} {yb}", mon(mb))
    })
}

fn clean(label: &str, s: &str, max: usize) -> Result<String, EngineError> {
    let t = s.trim();
    if t.is_empty() || t.chars().count() > max || t.chars().any(char::is_control) {
        return Err(EngineError::new(format!("{label} must be 1 to {max} characters on one line")));
    }
    Ok(t.to_string())
}

fn ranked_line(i: usize, p: &PriorityEntry, profile: Profile, w: &Words) -> Option<String> {
    let change = p.mean_change.as_ref()?;
    let mut parts = vec![w.haze_days.replace("{n}", &p.haze_days.to_string())];
    if p.fire_haze_days > 0 {
        parts.push(w.fire_haze_days.replace("{n}", &p.fire_haze_days.to_string()));
    }
    parts.push(
        match profile {
            Profile::Kota => w.profile_kota,
            Profile::Kabupaten => w.profile_kabupaten,
        }
        .to_string(),
    );
    parts.push(w.mapped.replace("{n}", &p.puskesmas_count.to_string()));
    Some(format!("{}. {}: {}; {}", i + 1, p.district_name, range_text(change), parts.join(", ")))
}

pub fn brief(input: &BriefInput) -> Result<BriefOutput, EngineError> {
    let w = match input.lang {
        Lang::Id => &ID,
        Lang::En => &EN,
    };
    if !(1..=MAX_TOP).contains(&input.top) {
        return Err(EngineError::new(format!("top must be 1 to {MAX_TOP}, got {}", input.top)));
    }
    let region = clean("region_name", &input.region_name, 80)?;
    let link = match &input.link {
        Some(l) => {
            let l = clean("link", l, 500)?;
            if !l.starts_with("https://") || l.contains(char::is_whitespace) {
                return Err(EngineError::new("link must be one https:// URL"));
            }
            Some(l)
        }
        None => None,
    };
    let out = outlook::outlook(&input.outlook)?;
    let window: Vec<&String> = out.days.iter().filter(|d| **d >= out.window_start).collect();
    let window_end = window.last().map_or(out.window_start.clone(), |d| (*d).clone());
    let profiles: std::collections::BTreeMap<&str, Profile> =
        out.districts.iter().map(|d| (d.code.as_str(), d.profile)).collect();

    // The same list the app shows: complete districts with haze in the window.
    let ranked: Vec<&PriorityEntry> = out
        .priority
        .iter()
        .filter(|p| p.complete && p.haze_days > 0 && p.mean_change.is_some())
        .take(input.top as usize)
        .collect();
    let incomplete: Vec<&str> = out.priority.iter().filter(|p| !p.complete).map(|p| p.district_name.as_str()).collect();

    let span = date_span(&out.window_start, &window_end, w)?;
    let title = format!("{}: {region}, {span}", w.title);
    let mut lines: Vec<String> = vec![
        format!("{} {}", title, w.for_office),
        match input.mode {
            BriefMode::Live => w.mode_live,
            BriefMode::Replay => w.mode_replay,
            BriefMode::Forecast => w.mode_forecast,
        }
        .to_string(),
        String::new(),
        w.priority_head.to_string(),
    ];
    if ranked.is_empty() {
        lines.push(w.no_haze.to_string());
    } else {
        lines.push(w.priority_hint.replace("{n}", &window.len().to_string()));
        for (i, p) in ranked.iter().enumerate() {
            let profile = profiles.get(p.district_code.as_str()).copied().unwrap_or(Profile::Kabupaten);
            if let Some(line) = ranked_line(i, p, profile, w) {
                lines.push(line);
            }
        }
    }
    if !incomplete.is_empty() {
        let mut names = incomplete.iter().take(MAX_INCOMPLETE_NAMES).copied().collect::<Vec<_>>().join(", ");
        if incomplete.len() > MAX_INCOMPLETE_NAMES {
            names = format!("{names} {}", w.more.replace("{n}", &(incomplete.len() - MAX_INCOMPLETE_NAMES).to_string()));
        }
        lines.push(format!("{} {names}", w.incomplete));
    }
    let kota_ranked = ranked.iter().any(|p| profiles.get(p.district_code.as_str()) == Some(&Profile::Kota));
    if kota_ranked {
        lines.push(w.kota_note.to_string());
    }
    // Live and as-forecast windows have no fire data for future days.
    if input.mode != BriefMode::Replay {
        lines.push(w.future_fires.to_string());
    }
    lines.push(String::new());
    if !input.data_times.is_empty() {
        lines.push(w.sources_head.to_string());
        for t in &input.data_times {
            lines.push(format!("\u{2022} {}: {}", clean("data_times.source", &t.source, 120)?, clean("data_times.time", &t.time, 120)?));
        }
    }
    if !input.errors.is_empty() {
        lines.push(w.failed_head.to_string());
        for e in &input.errors {
            lines.push(format!("\u{2022} {}: {}", clean("errors.source", &e.source, 120)?, clean("errors.error", &e.error, 300)?));
        }
    }
    lines.push(w.method.replace("{doi}", method::DOI));
    lines.push(w.limits_head.to_string());
    let limits: &[&str] = match input.lang {
        Lang::Id => &method::LIMITS_ID,
        Lang::En => &method::LIMITS,
    };
    for l in limits {
        lines.push(format!("\u{2022} {l}"));
    }
    lines.push(w.not_medical.to_string());
    if let Some(l) = link {
        lines.push(format!("{} {l}", w.details));
    }
    Ok(BriefOutput {
        lang: input.lang,
        title,
        text: lines.join("\n"),
        window_start: out.window_start.clone(),
        window_end,
        ranked: ranked.len() as u32,
        complete: out.districts.iter().all(|d| d.complete),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BriefInput, DataTime, DistrictInput, OutlookInput, PuskesmasInput, SourceIssue};

    fn input(lang: Lang, pm: f64, mode: BriefMode) -> BriefInput {
        let days: Vec<String> = (1..=8).map(|d| format!("2026-10-{d:02}")).collect();
        BriefInput {
            outlook: OutlookInput {
                window_start: "2026-10-04".into(),
                days,
                districts: vec![
                    DistrictInput {
                        code: "KT-pulang-pisau".into(),
                        name: "Pulang Pisau".into(),
                        profile: Profile::Kabupaten,
                        pm10_ugm3: vec![Some(pm); 8],
                        fire_count: vec![Some(3); 8],
                    },
                    DistrictInput {
                        code: "KT-kota-palangka-raya".into(),
                        name: "Kota Palangka Raya".into(),
                        profile: Profile::Kota,
                        pm10_ugm3: vec![Some(pm); 8],
                        fire_count: vec![Some(0); 8],
                    },
                    DistrictInput {
                        code: "KT-katingan".into(),
                        name: "Katingan".into(),
                        profile: Profile::Kabupaten,
                        pm10_ugm3: vec![None; 8],
                        fire_count: vec![None; 8],
                    },
                ],
                puskesmas: vec![PuskesmasInput {
                    id: "osm:node/1".into(),
                    name: "Puskesmas Test".into(),
                    district_code: "KT-pulang-pisau".into(),
                    baseline_visits_per_day: None,
                }],
            },
            lang,
            region_name: "Kalimantan".into(),
            mode,
            data_times: vec![DataTime { source: "CAMS (Open-Meteo)".into(), time: "2026-10-04T06:00:00Z".into() }],
            errors: vec![SourceIssue { source: "NASA FIRMS".into(), error: "HTTP 503".into() }],
            top: 5,
            link: Some("https://sootsayer.vercel.app/?mode=replay&date=2026-10-04".into()),
        }
    }

    #[test]
    fn haze_brief_lists_ranges_limits_and_sources() {
        let out = brief(&input(Lang::Id, 300.0, BriefMode::Replay)).unwrap();
        let t = &out.text;
        assert_eq!(out.ranked, 2);
        assert!(!out.complete);
        assert_eq!((out.window_start.as_str(), out.window_end.as_str()), ("2026-10-04", "2026-10-08"));
        assert!(t.starts_with("Briefing kabut Sootsayer: Kalimantan, 4\u{2013}8 Okt 2026"), "{t}");
        // Pulang Pisau: run of 4..8 fire-haze days -> 4-14 group, 1.700 (1.111-2.601).
        assert!(t.contains("1. Pulang Pisau: +70% (+11% \u{2026} +160%)"), "{t}");
        assert!(t.contains("Kota Palangka Raya"));
        assert!(t.contains("Profil kota"));
        assert!(t.contains("Data belum lengkap, tidak diperingkat: Katingan"));
        assert!(t.contains("NASA FIRMS: HTTP 503"));
        assert!(t.contains("CAMS (Open-Meteo): 2026-10-04T06:00:00Z"));
        for l in method::LIMITS_ID {
            assert!(t.contains(l));
        }
        assert!(t.contains("bukan nasihat medis"));
        assert!(t.contains("doi:10.1093/ije/dyaf169"));
        assert!(!t.contains("Hari prakiraan"), "replay has no forecast-fire note");
    }

    #[test]
    fn clear_window_says_so_in_english() {
        let out = brief(&input(Lang::En, 20.0, BriefMode::Live)).unwrap();
        assert_eq!(out.ranked, 0);
        assert!(out.text.contains("No haze days in this window"));
        assert!(out.text.contains("Forecast days have no fire data yet"));
        for l in method::LIMITS {
            assert!(out.text.contains(l));
        }
        assert!(out.text.contains("Oct 2026"));
    }

    #[test]
    fn forecast_replay_says_what_was_known_that_morning() {
        let out = brief(&input(Lang::En, 300.0, BriefMode::Forecast)).unwrap();
        assert!(out.text.contains("Replay (as forecast): the CAMS forecast available at 06:00 WIB"));
        assert!(out.text.contains("Forecast days have no fire data yet"));
        assert!(!out.text.contains("hindsight"));
        let id = brief(&input(Lang::Id, 300.0, BriefMode::Forecast)).unwrap();
        assert!(id.text.contains("seperti diprakirakan"));
    }

    #[test]
    fn rejects_bad_metadata() {
        let mut i = input(Lang::Id, 300.0, BriefMode::Live);
        i.top = 0;
        assert!(brief(&i).is_err());
        let mut i = input(Lang::Id, 300.0, BriefMode::Live);
        i.link = Some("javascript:alert(1)".into());
        assert!(brief(&i).is_err());
        let mut i = input(Lang::Id, 300.0, BriefMode::Live);
        i.region_name = "Kalimantan\nINJECT".into();
        assert!(brief(&i).is_err());
    }

    #[test]
    fn percent_matches_the_web_rounding() {
        assert_eq!(percent(0.875), "+88%");
        assert_eq!(percent(-0.285), "\u{2212}28%");
        assert_eq!(percent(-0.004), "\u{b1}0%");
        assert_eq!(percent(2.11), "+211%");
    }

    #[test]
    fn spans_across_months_and_years() {
        assert_eq!(date_span("2026-09-28", "2026-10-02", &ID).unwrap(), "28 Sep \u{2013} 2 Okt 2026");
        assert_eq!(date_span("2026-12-30", "2027-01-03", &EN).unwrap(), "30 Dec 2026 \u{2013} 3 Jan 2027");
        assert_eq!(date_span("2026-10-31", "2026-10-31", &EN).unwrap(), "31 Oct 2026");
    }
}
