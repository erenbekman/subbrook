use std::io::Cursor;
use std::path::{Path, PathBuf};

use calamine::{open_workbook_auto_from_rs, Data, Reader};
use tauri::ipc::{InvokeBody, Request};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + if month <= 2 { 1 } else { 0 };
    (year, month, day)
}

fn excel_date(serial: f64) -> String {
    let (y, m, d) = civil_from_days(serial.floor() as i64 - 25_569);
    format!("{y:04}-{m:02}-{d:02}")
}

fn cell_text(cell: &Data) -> String {
    match cell {
        Data::String(s) | Data::DateTimeIso(s) | Data::DurationIso(s) => s.trim().to_string(),
        Data::Float(f) => f.to_string(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => excel_date(dt.as_f64()),
        Data::Empty | Data::Error(_) => String::new(),
    }
}

#[tauri::command]
pub async fn read_spreadsheet(request: Request<'_>) -> Result<Vec<Vec<String>>, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes.".into());
    };
    let mut book = open_workbook_auto_from_rs(Cursor::new(bytes.clone())).map_err(|e| e.to_string())?;
    book.worksheets()
        .into_iter()
        .map(|(_, range)| range)
        .find(|range| !range.is_empty())
        .map(|range| range.rows().map(|row| row.iter().map(cell_text).collect()).collect())
        .ok_or_else(|| "The spreadsheet is empty.".into())
}

fn pick_save_path(app: &AppHandle, name: &str) -> Result<Option<PathBuf>, String> {
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).unwrap_or("txt").to_string();
    let Some(path) = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter(ext.to_uppercase(), &[ext.as_str()])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    path.into_path().map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file(app: AppHandle, name: String, contents: String) -> Result<bool, String> {
    let Some(path) = pick_save_path(&app, &name)? else { return Ok(false) };
    std::fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(true)
}

#[tauri::command]
pub async fn save_binary(app: AppHandle, request: Request<'_>) -> Result<bool, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes.".into());
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("subbrook.png")
        .to_string();
    let Some(path) = pick_save_path(&app, &name)? else { return Ok(false) };
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excel_serials_become_iso_dates() {
        assert_eq!(excel_date(45_658.0), "2025-01-01");
        assert_eq!(excel_date(46_304.75), "2026-10-09");
        assert_eq!(excel_date(60.0), "1900-02-28");
    }
}
