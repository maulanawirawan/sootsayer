//! Minimal ISO date handling (no clock, no time zones): enough to check that a
//! series of `YYYY-MM-DD` days is valid and contiguous.

/// Days since 1970-01-01 for a proleptic Gregorian date (H. Hinnant's
/// days_from_civil algorithm).
fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (i64::from(m) + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(y) => 29,
        _ => 28,
    }
}

/// Parse `YYYY-MM-DD` into a day number. Returns None for anything else.
pub fn parse(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    if !b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit()) {
        return None;
    }
    let y: i64 = s[0..4].parse().ok()?;
    let m: u32 = s[5..7].parse().ok()?;
    let d: u32 = s[8..10].parse().ok()?;
    if !(1..=12).contains(&m) || d == 0 || d > days_in_month(y, m) {
        return None;
    }
    Some(days_from_civil(y, m, d))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_days() {
        assert_eq!(parse("1970-01-01"), Some(0));
        // 1970..=2025 has 56 years and 14 leap days: 20_454 days to 2026-01-01,
        // then 273 days to 1 October and 14 more to the 15th.
        assert_eq!(parse("2026-10-15"), Some(20_741));
        assert_eq!(parse("2024-02-29").map(|d| d + 1), parse("2024-03-01"));
    }

    #[test]
    fn rejects_bad_dates() {
        for s in ["2026-02-29", "2026-13-01", "2026-00-10", "2026-1-01", "26-10-15", "2026/10/15", "2026-10-1a"] {
            assert_eq!(parse(s), None, "{s}");
        }
    }
}
