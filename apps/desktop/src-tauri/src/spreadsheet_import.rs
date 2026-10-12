use std::path::Path;

use calamine::{open_workbook_auto, Data, Reader};
use serde::Serialize;

const MAX_WORKBOOK_BYTES: u64 = 64 * 1024 * 1024;
const MAX_WORKBOOK_CELLS: usize = 250_000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSpreadsheetSheet {
    name: String,
    rows: Vec<Vec<String>>,
    formula_cell_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedSpreadsheetWorkbook {
    file_name: String,
    sheets: Vec<ImportedSpreadsheetSheet>,
}

fn supported_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "xls" | "xlsx" | "xlsm" | "xlsb"
            )
        })
}

fn cell_text(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        value => value
            .to_string()
            .replace(['\t', '\r', '\n'], " ")
            .trim()
            .to_string(),
    }
}

fn trim_sheet(mut rows: Vec<Vec<String>>) -> Vec<Vec<String>> {
    while rows.last().is_some_and(|row| row.iter().all(String::is_empty)) {
        rows.pop();
    }
    let retained_columns = rows
        .iter()
        .filter_map(|row| row.iter().rposition(|cell| !cell.is_empty()).map(|index| index + 1))
        .max()
        .unwrap_or(0);
    for row in &mut rows {
        row.resize(retained_columns, String::new());
        row.truncate(retained_columns);
    }
    rows
}

#[tauri::command]
pub fn read_spreadsheet_workbook(target: String) -> Result<ImportedSpreadsheetWorkbook, String> {
    let path = Path::new(&target);
    if !supported_extension(path) {
        return Err("XLS / XLSX / XLSM / XLSBファイルを選択してください。".to_string());
    }
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("Spreadsheetファイルを確認できません: {error}"))?;
    if !metadata.is_file() {
        return Err("選択された場所はSpreadsheetファイルではありません。".to_string());
    }
    if metadata.len() > MAX_WORKBOOK_BYTES {
        return Err("Spreadsheetファイルが64 MBを超えています。必要なsheetだけを別ファイルへ保存してから読み込んでください。".to_string());
    }

    let mut workbook = open_workbook_auto(path)
        .map_err(|error| format!("Spreadsheetファイルを開けません: {error}"))?;
    let sheet_names = workbook.sheet_names();
    let mut total_cells = 0usize;
    let mut sheets = Vec::new();
    for name in sheet_names {
        let formula_cell_count = workbook
            .worksheet_formula(&name)
            .map_err(|error| format!("sheet「{name}」の数式情報を読み込めません: {error}"))?
            .cells()
            .filter(|(_, _, formula)| !formula.trim().is_empty())
            .count();
        let range = workbook
            .worksheet_range(&name)
            .map_err(|error| format!("sheet「{name}」を読み込めません: {error}"))?;
        let (height, width) = range.get_size();
        total_cells = total_cells.saturating_add(height.saturating_mul(width));
        if total_cells > MAX_WORKBOOK_CELLS {
            return Err("Workbook全体が250,000セルを超えています。必要なsheetだけを別ファイルへ保存してから読み込んでください。".to_string());
        }
        let rows = trim_sheet(
            range
                .rows()
                .map(|row| row.iter().map(cell_text).collect::<Vec<_>>())
                .collect(),
        );
        sheets.push(ImportedSpreadsheetSheet {
            name,
            rows,
            formula_cell_count,
        });
    }
    if sheets.is_empty() {
        return Err("読み込めるworksheetがありません。".to_string());
    }

    Ok(ImportedSpreadsheetWorkbook {
        file_name: path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("spreadsheet")
            .to_string(),
        sheets,
    })
}

#[cfg(test)]
mod tests {
    use super::{cell_text, read_spreadsheet_workbook, supported_extension, trim_sheet};
    use calamine::Data;
    use std::path::Path;

    #[test]
    fn accepts_supported_excel_extensions_only() {
        assert!(supported_extension(Path::new("data.XLS")));
        assert!(supported_extension(Path::new("data.xlsx")));
        assert!(!supported_extension(Path::new("data.csv")));
    }

    #[test]
    fn keeps_internal_empty_cells_and_removes_only_unused_edges() {
        assert_eq!(
            trim_sheet(vec![
                vec!["A".into(), "".into(), "C".into(), "".into()],
                vec!["".into(), "".into(), "".into(), "".into()],
            ]),
            vec![vec!["A".to_string(), "".to_string(), "C".to_string()]],
        );
    }

    #[test]
    fn normalizes_embedded_delimiters_without_changing_numbers() {
        assert_eq!(cell_text(&Data::Float(1.25)), "1.25");
        assert_eq!(cell_text(&Data::String("A\tB\nC".into())), "A B C");
    }

    #[test]
    fn reads_a_real_multisheet_xlsx_without_collapsing_its_structure() {
        let target = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("biofigurestat-import-reference.xlsx");
        let imported = read_spreadsheet_workbook(target.to_string_lossy().into_owned())
            .expect("the reference workbook should import");

        assert_eq!(imported.file_name, "biofigurestat-import-reference.xlsx");
        assert_eq!(imported.sheets.len(), 2);
        assert_eq!(imported.sheets[0].name, "Primary Data");
        assert_eq!(imported.sheets[0].formula_cell_count, 3);
        assert_eq!(
            imported.sheets[0].rows[0],
            [
                "Sample ID",
                "Treatment",
                "Measurement",
                "Optional note",
                "Normalized",
            ]
        );
        assert_eq!(imported.sheets[0].rows[1][0], "dish-01");
        assert_eq!(imported.sheets[0].rows[1][2], "1.25");
        assert_eq!(imported.sheets[0].rows[1][3], "");
        assert_eq!(imported.sheets[0].rows[2][3], "kept");

        assert_eq!(imported.sheets[1].name, "日本語データ");
        assert_eq!(imported.sheets[1].rows[0], ["実験日", "試料ID", "条件", "測定値"]);
        assert!(!imported.sheets[1].rows[1][0].is_empty());
        assert_eq!(imported.sheets[1].rows[1][1], "培養皿-1");
        assert_eq!(imported.sheets[1].rows[2][3], "101.5");
        assert_eq!(imported.sheets[1].rows[3][3], "-0.25");
    }

    #[test]
    fn reads_a_real_legacy_biff_xls_workbook() {
        let target = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("calamine-any-sheets.xls");
        let imported = read_spreadsheet_workbook(target.to_string_lossy().into_owned())
            .expect("the legacy XLS reference workbook should import");

        assert_eq!(imported.file_name, "calamine-any-sheets.xls");
        assert!(!imported.sheets.is_empty());
        assert!(imported.sheets.iter().any(|sheet| {
            sheet
                .rows
                .iter()
                .flatten()
                .any(|cell| !cell.is_empty())
        }));
    }
}
