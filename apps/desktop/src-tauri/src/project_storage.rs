use rusqlite::{params, Connection, OpenFlags};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const MANIFEST_PATH: &str = "manifest.json";
// Keep the legacy SQLite locations aligned with packages/project. New
// containers resolve their authoritative database payload from manifest.json.
const DATABASE_PATH: &str = "project.sqlite";
const LEGACY_DATABASE_PATH: &str = "data/project.sqlite";
const CONTAINER_FORMAT: &str = "lsaa-sqlite-container-v1";
const MAX_ENTRY_BYTES: u64 = 512 * 1024 * 1024;
const MAX_CONTAINER_BYTES: u64 = 2 * 1024 * 1024 * 1024;
static TRANSACTION_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug)]
struct ProjectWriteTransaction {
    target: PathBuf,
    staging: PathBuf,
}

#[derive(Default)]
pub struct ProjectWriteState {
    transactions: Mutex<HashMap<String, ProjectWriteTransaction>>,
}

fn validated_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    if relative_path.is_empty() || relative_path.contains('\\') {
        return Err("Project paths must be normalized package-relative paths".to_string());
    }
    let path = Path::new(relative_path);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Project path must remain inside the project package".to_string());
    }
    Ok(path.to_path_buf())
}

fn sibling_path(target: &Path, label: &str, token: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Project target must have a parent directory".to_string())?;
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Project target must have a valid file name".to_string())?;
    Ok(parent.join(format!(".{name}.{label}-{token}")))
}

fn durable_migration_backup_path(
    target: &Path,
    old_version: i64,
    token: &str,
) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Project target must have a parent directory".to_string())?;
    let name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Project target must have a valid file name".to_string())?;
    Ok(parent.join(format!(
        "{name}.pre-migration-v{old_version}-backup-{token}"
    )))
}

fn package_database_version(package_root: &Path) -> Option<i64> {
    if package_root.is_dir() {
        let canonical_database = package_root.join(DATABASE_PATH);
        let legacy_database = package_root.join(LEGACY_DATABASE_PATH);
        let database = if canonical_database.is_file() {
            canonical_database
        } else {
            // Read-only compatibility for early directory packages. New saves
            // always use the canonical package-root database path.
            legacy_database
        };
        if !database.is_file() {
            return None;
        }
        let connection =
            Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
        return connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .ok();
    }

    let connection =
        Connection::open_with_flags(package_root, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    connection
        .query_row(
            "SELECT value FROM container_metadata WHERE key = 'project_database_user_version'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|value| value.parse().ok())
}

fn transaction_token() -> Result<String, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("System clock cannot create a save transaction: {error}"))?
        .as_nanos();
    let counter = TRANSACTION_COUNTER.fetch_add(1, Ordering::Relaxed);
    Ok(format!("{}-{nanos}-{counter}", std::process::id()))
}

fn begin_transaction(target: PathBuf) -> Result<(String, ProjectWriteTransaction), String> {
    if target.as_os_str().is_empty() {
        return Err("Project target is required".to_string());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "Project target must have a parent directory".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create the project parent directory: {error}"))?;

    let token = transaction_token()?;
    let staging = sibling_path(&target, "staging", &token)?;
    fs::create_dir(&staging)
        .map_err(|error| format!("Could not create the project staging directory: {error}"))?;
    Ok((token, ProjectWriteTransaction { target, staging }))
}

fn write_transaction_file(
    transaction: &ProjectWriteTransaction,
    relative_path: &str,
    data: &[u8],
) -> Result<(), String> {
    let relative = validated_relative_path(relative_path)?;
    let destination = transaction.staging.join(relative);
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create a project package directory: {error}"))?;
    }
    let mut file = File::create(&destination)
        .map_err(|error| format!("Could not create a project package file: {error}"))?;
    file.write_all(data)
        .map_err(|error| format!("Could not write a project package file: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("Could not flush a project package file: {error}"))
}

fn collect_staged_files(
    root: &Path,
    directory: &Path,
    output: &mut Vec<PathBuf>,
) -> Result<(), String> {
    for entry in fs::read_dir(directory)
        .map_err(|error| format!("Could not inspect the staged project: {error}"))?
    {
        let path = entry
            .map_err(|error| format!("Could not inspect a staged project entry: {error}"))?
            .path();
        if path.is_dir() {
            collect_staged_files(root, &path, output)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|_| "Staged project entry escaped its package root".to_string())?;
            let normalized_relative = relative
                .to_str()
                .ok_or_else(|| "Project entry path must be valid UTF-8".to_string())?
                .replace(std::path::MAIN_SEPARATOR, "/");
            validated_relative_path(&normalized_relative)?;
            output.push(path);
        }
    }
    Ok(())
}

fn sqlite_user_version(database: &Path) -> Result<i64, String> {
    let connection = Connection::open_with_flags(database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not validate the staged project database: {error}"))?;
    let integrity: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not validate the staged project database: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "Staged project database integrity check failed: {integrity}"
        ));
    }
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("Could not read the staged project database version: {error}"))
}

fn normalized_staged_relative_path(root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Staged project entry escaped its package root".to_string())?
        .to_str()
        .ok_or_else(|| "Project entry path must be valid UTF-8".to_string())?
        .replace(std::path::MAIN_SEPARATOR, "/");
    validated_relative_path(&relative)?;
    Ok(relative)
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path)
        .map_err(|error| format!("Could not open a staged project entry: {error}"))?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Could not read a staged project entry: {error}"))?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn required_string<'a>(value: &'a Value, field: &str, context: &str) -> Result<&'a str, String> {
    value
        .get(field)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .ok_or_else(|| format!("Project manifest {context}.{field} must be a non-empty string"))
}

fn validate_staged_manifest(
    staging: &Path,
    staged_files: &[PathBuf],
) -> Result<Option<i64>, String> {
    let manifest_bytes = fs::read(staging.join(MANIFEST_PATH))
        .map_err(|error| format!("Could not read staged manifest.json: {error}"))?;
    let manifest: Value = serde_json::from_slice(&manifest_bytes)
        .map_err(|error| format!("Could not decode staged manifest.json: {error}"))?;
    if required_string(&manifest, "format", "root")? != "life-science-analysis-project" {
        return Err("Unsupported staged project manifest format".to_string());
    }
    if required_string(&manifest, "formatVersion", "root")? != "0.2.0" {
        return Err("Unsupported staged project manifest version".to_string());
    }
    let project_kind = required_string(&manifest, "projectKind", "root")?;
    if !matches!(
        project_kind,
        "experiment"
            | "unresolved_visualization"
            | "progressive_experiment"
            | "specialized_entry_draft"
    ) {
        return Err("Unsupported staged project kind".to_string());
    }

    let declarations = manifest
        .get("files")
        .and_then(Value::as_array)
        .ok_or_else(|| "Project manifest files must be an array".to_string())?;
    let mut declared_by_path = HashMap::<String, (&str, u64, &str)>::new();
    let mut portable_paths = HashSet::<String>::new();
    for (index, declaration) in declarations.iter().enumerate() {
        let path = required_string(declaration, "path", &format!("files[{index}]"))?;
        validated_relative_path(path)?;
        let portable_path = path.to_ascii_lowercase();
        if portable_path == MANIFEST_PATH || !portable_paths.insert(portable_path) {
            return Err(
                "Project manifest file paths must be unique and cannot reserve manifest.json"
                    .to_string(),
            );
        }
        let role = required_string(declaration, "role", &format!("files[{index}]"))?;
        if !matches!(
            role,
            "database" | "raw_source" | "raw_export" | "asset" | "other"
        ) {
            return Err(format!(
                "Project manifest declares an unsupported file role: {role}"
            ));
        }
        let size = declaration
            .get("sizeBytes")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                format!("Project manifest files[{index}].sizeBytes must be non-negative")
            })?;
        if size > MAX_ENTRY_BYTES {
            return Err("A project entry exceeds the supported safety limit".to_string());
        }
        let sha256 = required_string(declaration, "sha256", &format!("files[{index}]"))?;
        if sha256.len() != 64 || !sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(format!(
                "Project manifest files[{index}].sha256 is not a SHA-256 digest"
            ));
        }
        declared_by_path.insert(path.to_string(), (role, size, sha256));
    }

    let recovery = manifest
        .get("recovery")
        .ok_or_else(|| "Project manifest recovery metadata is missing".to_string())?;
    let database_path = required_string(recovery, "databasePath", "recovery")?;
    validated_relative_path(database_path)?;
    if !matches!(declared_by_path.get(database_path), Some(("database", _, _))) {
        return Err(
            "Recovery databasePath must reference a declared database file".to_string(),
        );
    }
    let raw_export_path = required_string(recovery, "canonicalRawExportPath", "recovery")?;
    validated_relative_path(raw_export_path)?;
    if !matches!(declared_by_path.get(raw_export_path), Some(("raw_export", _, _))) {
        return Err(
            "Recovery canonicalRawExportPath must reference a declared raw export file"
                .to_string(),
        );
    }
    if let Some(transformation_path) = recovery
        .get("transformationExportPath")
        .and_then(Value::as_str)
    {
        validated_relative_path(transformation_path)?;
        if !matches!(declared_by_path.get(transformation_path), Some(("other", _, _))) {
            return Err(
                "Recovery transformationExportPath must reference a declared auxiliary file"
                    .to_string(),
            );
        }
    }

    let mut staged_payload_paths = HashSet::<String>::new();
    for path in staged_files {
        let relative = normalized_staged_relative_path(staging, path)?;
        if relative == MANIFEST_PATH {
            continue;
        }
        let declaration = declared_by_path.get(&relative).ok_or_else(|| {
            format!("Project staging contains an undeclared file: {relative}")
        })?;
        if !staged_payload_paths.insert(relative.clone()) {
            return Err(format!(
                "Project staging contains a duplicate file: {relative}"
            ));
        }
        let actual_size = fs::metadata(path)
            .map_err(|error| format!("Could not inspect a staged project entry: {error}"))?
            .len();
        if actual_size != declaration.1 {
            return Err(format!(
                "Project file size does not match the manifest: {relative}"
            ));
        }
        if !sha256_file(path)?.eq_ignore_ascii_case(declaration.2) {
            return Err(format!(
                "Project file checksum does not match the manifest: {relative}"
            ));
        }
    }
    for declared_path in declared_by_path.keys() {
        if !staged_payload_paths.contains(declared_path) {
            return Err(format!(
                "Project save is missing a file declared by the manifest: {declared_path}"
            ));
        }
    }

    let database = staging.join(database_path);
    let database_extension = database
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default();
    if database_extension.eq_ignore_ascii_case("sqlite") {
        if project_kind != "experiment" {
            return Err(
                "Only an experiment project may declare a SQLite database payload".to_string(),
            );
        }
        return Ok(Some(sqlite_user_version(&database)?));
    }
    if database_extension.eq_ignore_ascii_case("json") {
        if project_kind == "experiment" {
            return Err("An experiment project must declare a SQLite database payload".to_string());
        }
        let bytes = fs::read(&database)
            .map_err(|error| format!("Could not read staged JSON database: {error}"))?;
        serde_json::from_slice::<Value>(&bytes)
            .map_err(|error| format!("Could not decode staged JSON database: {error}"))?;
        return Ok(None);
    }
    Err("Project database payload must be SQLite or JSON".to_string())
}

fn create_single_file_container(staging: &Path, destination: &Path) -> Result<(), String> {
    let mut files = Vec::new();
    collect_staged_files(staging, staging, &mut files)?;
    if !files
        .iter()
        .any(|path| path == &staging.join(MANIFEST_PATH))
    {
        return Err("Project staging package has no manifest.json".to_string());
    }
    let total_size = files.iter().try_fold(0_u64, |total, path| {
        let size = fs::metadata(path)
            .map_err(|error| format!("Could not inspect a staged project entry: {error}"))?
            .len();
        if size > MAX_ENTRY_BYTES {
            return Err("A project entry exceeds the supported safety limit".to_string());
        }
        total
            .checked_add(size)
            .filter(|sum| *sum <= MAX_CONTAINER_BYTES)
            .ok_or_else(|| "The project exceeds the supported safety limit".to_string())
    })?;
    let database_version = validate_staged_manifest(staging, &files)?;

    let mut connection = Connection::open(destination)
        .map_err(|error| format!("Could not create the staged project file: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = DELETE;
             PRAGMA synchronous = FULL;
             CREATE TABLE container_metadata (
               key TEXT PRIMARY KEY NOT NULL,
               value TEXT NOT NULL
             );
             CREATE TABLE container_entries (
               path TEXT PRIMARY KEY NOT NULL,
               size_bytes INTEGER NOT NULL,
               data BLOB NOT NULL
             );",
        )
        .map_err(|error| format!("Could not initialize the project container: {error}"))?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Could not start the project container transaction: {error}"))?;
    transaction
        .execute(
            "INSERT INTO container_metadata(key, value) VALUES (?1, ?2)",
            params!["format", CONTAINER_FORMAT],
        )
        .map_err(|error| format!("Could not record the project container format: {error}"))?;
    if let Some(database_version) = database_version {
        transaction
            .execute(
                "INSERT INTO container_metadata(key, value) VALUES (?1, ?2)",
                params![
                    "project_database_user_version",
                    database_version.to_string()
                ],
            )
            .map_err(|error| format!("Could not record the project database version: {error}"))?;
    }
    transaction
        .execute(
            "INSERT INTO container_metadata(key, value) VALUES (?1, ?2)",
            params!["payload_bytes", total_size.to_string()],
        )
        .map_err(|error| format!("Could not record the project payload size: {error}"))?;
    for path in files {
        let relative = path
            .strip_prefix(staging)
            .map_err(|_| "Staged project entry escaped its package root".to_string())?
            .to_str()
            .ok_or_else(|| "Project entry path must be valid UTF-8".to_string())?
            .replace(std::path::MAIN_SEPARATOR, "/");
        let data = fs::read(&path)
            .map_err(|error| format!("Could not read a staged project entry: {error}"))?;
        transaction
            .execute(
                "INSERT INTO container_entries(path, size_bytes, data) VALUES (?1, ?2, ?3)",
                params![relative, data.len() as i64, data],
            )
            .map_err(|error| format!("Could not write a project container entry: {error}"))?;
    }
    transaction
        .commit()
        .map_err(|error| format!("Could not commit the project container: {error}"))?;
    let integrity: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not validate the project container: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "Project container integrity check failed: {integrity}"
        ));
    }
    drop(connection);
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(destination)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("Could not flush the staged project file: {error}"))
}

fn remove_path(path: &Path) -> Result<(), std::io::Error> {
    if path.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

fn sync_parent_directory(target: &Path) -> Result<(), String> {
    #[cfg(not(unix))]
    {
        let _ = target;
        return Ok(());
    }

    #[cfg(unix)]
    {
        let parent = target
            .parent()
            .ok_or_else(|| "Project target must have a parent directory".to_string())?;
        match File::open(parent).and_then(|directory| directory.sync_all()) {
            Ok(()) => Ok(()),
            // APFS and some macOS file-provider volumes do not expose directory fsync
            // through std::fs. The project file itself has already been flushed and
            // atomically renamed, so an unsupported directory durability primitive
            // must not roll back an otherwise valid save.
            Err(error) if cfg!(target_os = "macos") && directory_sync_is_unsupported(&error) => {
                Ok(())
            }
            Err(error) => Err(format!(
                "Could not flush the project parent directory: {error}"
            )),
        }
    }
}

#[cfg(unix)]
fn directory_sync_is_unsupported(error: &std::io::Error) -> bool {
    // EINVAL and ENOTSUP are the documented/common results for fsync on a
    // directory or file-provider mount that does not implement this operation.
    matches!(error.raw_os_error(), Some(22 | 45 | 95))
}

fn commit_transaction(transaction: &ProjectWriteTransaction, token: &str) -> Result<(), String> {
    let staged_container = sibling_path(&transaction.target, "container-staging", token)?;
    if let Err(error) = create_single_file_container(&transaction.staging, &staged_container) {
        let _ = remove_path(&staged_container);
        return Err(error);
    }

    let had_previous = transaction.target.exists();
    let previous_was_directory = transaction.target.is_dir();
    let migration_versions = if had_previous {
        package_database_version(&transaction.target)
            .zip(package_database_version(&transaction.staging))
    } else {
        None
    };
    let durable_migration_backup = migration_versions
        .filter(|(old_version, new_version)| previous_was_directory || old_version < new_version)
        .map(|(old_version, _)| {
            durable_migration_backup_path(&transaction.target, old_version, token)
        })
        .transpose()?;
    let backup = match &durable_migration_backup {
        Some(path) => path.clone(),
        None => sibling_path(&transaction.target, "backup", token)?,
    };
    if had_previous {
        fs::rename(&transaction.target, &backup)
            .map_err(|error| format!("Could not preserve the previous project: {error}"))?;
    }

    if let Err(error) = fs::rename(&staged_container, &transaction.target) {
        if had_previous {
            let _ = fs::rename(&backup, &transaction.target);
        }
        let _ = remove_path(&staged_container);
        return Err(format!("Could not replace the project atomically: {error}"));
    }
    let _ = fs::remove_dir_all(&transaction.staging);
    if let Err(error) = sync_parent_directory(&transaction.target) {
        let _ = fs::rename(&transaction.target, &staged_container);
        if had_previous {
            let _ = fs::rename(&backup, &transaction.target);
        }
        return Err(error);
    }

    if had_previous && durable_migration_backup.is_none() {
        // A leftover backup is recoverable and must not turn a completed replacement
        // into a reported save failure. A later recovery/cleanup pass can remove it.
        let _ = remove_path(&backup);
    }
    Ok(())
}

fn rollback_transaction(transaction: ProjectWriteTransaction) -> Result<(), String> {
    if transaction.staging.exists() {
        fs::remove_dir_all(&transaction.staging)
            .map_err(|error| format!("Could not remove the project staging directory: {error}"))?;
    }
    Ok(())
}

fn take_transaction(
    state: &ProjectWriteState,
    token: &str,
) -> Result<ProjectWriteTransaction, String> {
    state
        .transactions
        .lock()
        .map_err(|_| "Project transaction state is unavailable".to_string())?
        .remove(token)
        .ok_or_else(|| "Project save transaction is unknown or already closed".to_string())
}

#[tauri::command]
pub fn begin_atomic_project_write(
    state: State<'_, ProjectWriteState>,
    target: String,
) -> Result<String, String> {
    let (token, transaction) = begin_transaction(PathBuf::from(target))?;
    state
        .transactions
        .lock()
        .map_err(|_| "Project transaction state is unavailable".to_string())?
        .insert(token.clone(), transaction);
    Ok(token)
}

#[tauri::command]
pub fn write_project_file(
    state: State<'_, ProjectWriteState>,
    transaction_id: String,
    relative_path: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let transactions = state
        .transactions
        .lock()
        .map_err(|_| "Project transaction state is unavailable".to_string())?;
    let transaction = transactions
        .get(&transaction_id)
        .ok_or_else(|| "Project save transaction is unknown or already closed".to_string())?;
    write_transaction_file(transaction, &relative_path, &data)
}

#[tauri::command]
pub fn commit_project_write(
    state: State<'_, ProjectWriteState>,
    transaction_id: String,
) -> Result<(), String> {
    let transaction = take_transaction(&state, &transaction_id)?;
    let result = commit_transaction(&transaction, &transaction_id);
    if result.is_err() {
        let _ = rollback_transaction(transaction);
    }
    result
}

#[tauri::command]
pub fn rollback_project_write(
    state: State<'_, ProjectWriteState>,
    transaction_id: String,
) -> Result<(), String> {
    match take_transaction(&state, &transaction_id) {
        Ok(transaction) => rollback_transaction(transaction),
        Err(_) => Ok(()),
    }
}

#[tauri::command]
pub fn read_project_file(target: String, relative_path: String) -> Result<Vec<u8>, String> {
    let relative = validated_relative_path(&relative_path)?;
    let package_target = fs::canonicalize(PathBuf::from(target))
        .map_err(|error| format!("Could not resolve the project package: {error}"))?;
    if package_target.is_dir() {
        let resolved_file = fs::canonicalize(package_target.join(relative))
            .map_err(|error| format!("Could not resolve a project package file: {error}"))?;
        if !resolved_file.starts_with(&package_target) {
            return Err("Project package file resolves outside the project package".to_string());
        }
        let mut file = File::open(resolved_file)
            .map_err(|error| format!("Could not open a project package file: {error}"))?;
        let mut data = Vec::new();
        file.read_to_end(&mut data)
            .map_err(|error| format!("Could not read a project package file: {error}"))?;
        return Ok(data);
    }

    let connection = Connection::open_with_flags(&package_target, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|error| format!("Could not open the project container: {error}"))?;
    let integrity: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| format!("Could not validate the project container: {error}"))?;
    if integrity != "ok" {
        return Err(format!(
            "Project container integrity check failed: {integrity}"
        ));
    }
    let format: String = connection
        .query_row(
            "SELECT value FROM container_metadata WHERE key = 'format'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("Could not identify the project container: {error}"))?;
    if format != CONTAINER_FORMAT {
        return Err("Unsupported project container format".to_string());
    }
    let relative = relative
        .to_str()
        .ok_or_else(|| "Project entry path must be valid UTF-8".to_string())?
        .replace(std::path::MAIN_SEPARATOR, "/");
    let (size, data): (i64, Vec<u8>) = connection
        .query_row(
            "SELECT size_bytes, data FROM container_entries WHERE path = ?1",
            params![relative],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| format!("Could not read a project container entry: {error}"))?;
    if size < 0 || size as usize != data.len() || size as u64 > MAX_ENTRY_BYTES {
        return Err("Project container entry size is invalid".to_string());
    }
    Ok(data)
}

#[cfg(test)]
mod tests {
    use super::{
        begin_transaction, commit_transaction, read_project_file, rollback_transaction,
        validated_relative_path, write_transaction_file,
    };
    use rusqlite::Connection;
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::path::PathBuf;

    fn test_directory(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lsaa-project-storage-{name}-{}-{}",
            std::process::id(),
            super::TRANSACTION_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir(&path).expect("create test directory");
        path
    }

    fn sha256_bytes(data: &[u8]) -> String {
        format!("{:x}", Sha256::digest(data))
    }

    fn manifest_bytes(
        project_kind: &str,
        database_path: &str,
        database: &[u8],
        database_role: &str,
        raw_path: &str,
        raw: &[u8],
    ) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "format": "life-science-analysis-project",
            "formatVersion": "0.2.0",
            "projectKind": project_kind,
            "files": [
                {
                    "path": database_path,
                    "role": database_role,
                    "sha256": sha256_bytes(database),
                    "sizeBytes": database.len(),
                },
                {
                    "path": raw_path,
                    "role": "raw_export",
                    "sha256": sha256_bytes(raw),
                    "sizeBytes": raw.len(),
                }
            ],
            "recovery": {
                "databasePath": database_path,
                "canonicalRawExportPath": raw_path,
            }
        }))
        .expect("encode manifest")
    }

    fn stage_project_database(
        transaction: &super::ProjectWriteTransaction,
        version: i64,
        raw: &[u8],
    ) -> Vec<u8> {
        let path = transaction.staging.join(super::DATABASE_PATH);
        fs::create_dir_all(path.parent().expect("database parent")).expect("create data folder");
        let database = Connection::open(path).expect("create project database");
        database
            .execute_batch(&format!("PRAGMA user_version = {version};"))
            .expect("set project database version");
        drop(database);
        let database = fs::read(transaction.staging.join(super::DATABASE_PATH))
            .expect("read staged database");
        write_transaction_file(transaction, "raw/exports/canonical.csv", raw)
            .expect("write raw export");
        let manifest = manifest_bytes(
            "experiment",
            super::DATABASE_PATH,
            &database,
            "database",
            "raw/exports/canonical.csv",
            raw,
        );
        write_transaction_file(transaction, super::MANIFEST_PATH, &manifest)
            .expect("write manifest");
        manifest
    }

    fn stage_json_project(
        transaction: &super::ProjectWriteTransaction,
        project_kind: &str,
        database_path: &str,
        database: &[u8],
        raw: &[u8],
    ) -> Vec<u8> {
        let raw_path = "raw/exports/recovery.txt";
        write_transaction_file(transaction, database_path, database).expect("write JSON database");
        write_transaction_file(transaction, raw_path, raw).expect("write raw recovery");
        let manifest = manifest_bytes(
            project_kind,
            database_path,
            database,
            "database",
            raw_path,
            raw,
        );
        write_transaction_file(transaction, super::MANIFEST_PATH, &manifest)
            .expect("write manifest");
        manifest
    }

    #[test]
    fn package_paths_cannot_escape_the_project() {
        assert!(validated_relative_path("project.sqlite").is_ok());
        assert!(validated_relative_path("data/project.sqlite").is_ok());
        assert!(validated_relative_path("../outside").is_err());
        assert!(validated_relative_path("/absolute").is_err());
        assert!(validated_relative_path("data\\outside").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn classifies_only_unsupported_directory_sync_errors_as_nonfatal() {
        for code in [22, 45, 95] {
            assert!(super::directory_sync_is_unsupported(
                &std::io::Error::from_raw_os_error(code)
            ));
        }
        assert!(!super::directory_sync_is_unsupported(
            &std::io::Error::from_raw_os_error(5)
        ));
    }

    #[test]
    fn commit_replaces_only_after_a_manifest_is_staged() {
        let parent = test_directory("commit");
        let target = parent.join("experiment.lsa");
        fs::create_dir(&target).expect("create prior project");
        fs::write(target.join("manifest.json"), b"old").expect("write prior project");

        let (token, transaction) = begin_transaction(target.clone()).expect("begin transaction");
        let manifest =
            stage_project_database(&transaction, 1, b"condition,value\nA,1\n");
        commit_transaction(&transaction, &token).expect("commit transaction");

        assert!(target.is_file());
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            manifest
        );
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "raw/exports/canonical.csv".to_string()
            )
            .unwrap(),
            b"condition,value\nA,1\n"
        );
        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn commit_accepts_the_canonical_manifest_database_path() {
        let parent = test_directory("canonical-database-path");
        let target = parent.join("experiment.lsa");
        let (token, transaction) = begin_transaction(target.clone()).expect("begin transaction");
        stage_project_database(&transaction, 1, b"condition,value\nA,1\n");
        let database_path = transaction.staging.join("project.sqlite");
        let expected_database = fs::read(&database_path).expect("read staged database");

        commit_transaction(&transaction, &token).expect("commit canonical package");
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "project.sqlite".to_string()
            )
            .expect("read canonical database"),
            expected_database
        );
        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn rollback_preserves_the_previous_project() {
        let parent = test_directory("rollback");
        let target = parent.join("experiment.lsa");
        fs::create_dir(&target).expect("create prior project");
        fs::write(target.join("manifest.json"), b"old").expect("write prior project");

        let (_, transaction) = begin_transaction(target.clone()).expect("begin transaction");
        write_transaction_file(&transaction, "manifest.json", b"new").expect("write manifest");
        rollback_transaction(transaction).expect("rollback transaction");

        assert_eq!(fs::read(target.join("manifest.json")).unwrap(), b"old");
        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn single_file_save_replaces_a_previous_single_file_only_after_validation() {
        let parent = test_directory("single-file-replace");
        let target = parent.join("experiment.lsa");

        let (first_token, first) = begin_transaction(target.clone()).expect("first transaction");
        let first_manifest = stage_project_database(&first, 1, b"first raw");
        commit_transaction(&first, &first_token).expect("first commit");

        let (invalid_token, invalid) = begin_transaction(target.clone()).expect("bad transaction");
        write_transaction_file(&invalid, "manifest.json", b"invalid").expect("bad manifest");
        assert!(commit_transaction(&invalid, &invalid_token).is_err());
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            first_manifest
        );
        rollback_transaction(invalid).expect("clean bad staging");

        let (second_token, second) = begin_transaction(target.clone()).expect("second transaction");
        let second_manifest = stage_project_database(&second, 1, b"second raw");
        commit_transaction(&second, &second_token).expect("second commit");

        assert!(target.is_file());
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            second_manifest
        );
        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn schema_upgrade_keeps_a_durable_pre_migration_package() {
        let parent = test_directory("migration-backup");
        let target = parent.join("experiment.lsa");
        fs::create_dir_all(target.join("data")).expect("create prior project");
        fs::write(target.join("manifest.json"), b"old").expect("write prior manifest");
        let old_database = Connection::open(target.join(super::DATABASE_PATH)).expect("old db");
        old_database
            .execute_batch("PRAGMA user_version = 1;")
            .expect("old version");
        drop(old_database);

        let (token, transaction) = begin_transaction(target.clone()).expect("begin transaction");
        let new_manifest = stage_project_database(&transaction, 2, b"new raw");

        commit_transaction(&transaction, &token).expect("commit migration");

        let backup = parent
            .read_dir()
            .expect("list project parent")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .find(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.starts_with("experiment.lsa.pre-migration-v1-backup-"))
            })
            .expect("durable migration backup");
        assert_eq!(fs::read(backup.join("manifest.json")).unwrap(), b"old");
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            new_manifest
        );
        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn json_backed_project_kinds_commit_and_reopen_from_the_declared_database() {
        for (project_kind, database_path) in [
            ("unresolved_visualization", "project.json"),
            ("progressive_experiment", "progressive-project.json"),
            (
                "specialized_entry_draft",
                "specialized-entry-draft.json",
            ),
        ] {
            let parent = test_directory(project_kind);
            let target = parent.join(format!("{project_kind}.lsa"));
            let (token, transaction) =
                begin_transaction(target.clone()).expect("begin JSON transaction");
            let database = format!(r#"{{"projectKind":"{project_kind}"}}"#).into_bytes();
            let raw = format!("raw recovery for {project_kind}").into_bytes();
            let manifest = stage_json_project(
                &transaction,
                project_kind,
                database_path,
                &database,
                &raw,
            );

            commit_transaction(&transaction, &token).expect("commit JSON-backed project");

            assert_eq!(
                read_project_file(
                    target.to_string_lossy().into_owned(),
                    database_path.to_string(),
                )
                .expect("read declared JSON database"),
                database
            );
            assert_eq!(
                read_project_file(
                    target.to_string_lossy().into_owned(),
                    "raw/exports/recovery.txt".to_string(),
                )
                .expect("read declared raw recovery"),
                raw
            );
            assert_eq!(
                read_project_file(
                    target.to_string_lossy().into_owned(),
                    super::MANIFEST_PATH.to_string(),
                )
                .expect("read manifest"),
                manifest
            );
            fs::remove_dir_all(parent).expect("remove test directory");
        }
    }

    #[test]
    fn commit_rejects_missing_or_undeclared_payloads_without_replacing_the_target() {
        let parent = test_directory("manifest-payload-boundary");
        let target = parent.join("graph-only.lsa");
        let database = br#"{"projectKind":"unresolved_visualization"}"#;
        let raw = b"retained raw table";

        let (missing_token, missing) =
            begin_transaction(target.clone()).expect("begin missing transaction");
        write_transaction_file(&missing, "project.json", database).expect("write database");
        let missing_manifest = manifest_bytes(
            "unresolved_visualization",
            "project.json",
            database,
            "database",
            "raw/exports/recovery.txt",
            raw,
        );
        write_transaction_file(&missing, super::MANIFEST_PATH, &missing_manifest)
            .expect("write missing-payload manifest");
        let missing_error = commit_transaction(&missing, &missing_token)
            .expect_err("missing declared raw recovery must fail");
        assert!(missing_error.contains("missing a file declared by the manifest"));
        assert!(!target.exists());
        rollback_transaction(missing).expect("clean missing staging");

        let (extra_token, extra) =
            begin_transaction(target.clone()).expect("begin extra transaction");
        stage_json_project(
            &extra,
            "unresolved_visualization",
            "project.json",
            database,
            raw,
        );
        write_transaction_file(&extra, "undeclared.txt", b"must not enter the container")
            .expect("write undeclared payload");
        let extra_error = commit_transaction(&extra, &extra_token)
            .expect_err("undeclared payload must fail");
        assert!(extra_error.contains("undeclared file"));
        assert!(!target.exists());
        rollback_transaction(extra).expect("clean extra staging");

        fs::remove_dir_all(parent).expect("remove test directory");
    }

    #[test]
    fn commit_rejects_wrong_database_role_and_payload_integrity_mismatch() {
        let parent = test_directory("manifest-integrity-boundary");
        let target = parent.join("draft.lsa");
        let database = br#"{"projectKind":"specialized_entry_draft"}"#;
        let raw = b"draft raw input";

        let (role_token, role_transaction) =
            begin_transaction(target.clone()).expect("begin role transaction");
        write_transaction_file(&role_transaction, "specialized-entry-draft.json", database)
            .expect("write database");
        write_transaction_file(&role_transaction, "raw/exports/recovery.txt", raw)
            .expect("write raw");
        let wrong_role_manifest = manifest_bytes(
            "specialized_entry_draft",
            "specialized-entry-draft.json",
            database,
            "other",
            "raw/exports/recovery.txt",
            raw,
        );
        write_transaction_file(
            &role_transaction,
            super::MANIFEST_PATH,
            &wrong_role_manifest,
        )
        .expect("write wrong-role manifest");
        let role_error = commit_transaction(&role_transaction, &role_token)
            .expect_err("wrong database role must fail");
        assert!(role_error.contains("databasePath"));
        assert!(!target.exists());
        rollback_transaction(role_transaction).expect("clean role staging");

        let (checksum_token, checksum_transaction) =
            begin_transaction(target.clone()).expect("begin checksum transaction");
        stage_json_project(
            &checksum_transaction,
            "specialized_entry_draft",
            "specialized-entry-draft.json",
            database,
            raw,
        );
        write_transaction_file(
            &checksum_transaction,
            "specialized-entry-draft.json",
            br#"{"projectKind":"specialized_entry_draft","changed":true}"#,
        )
        .expect("mutate staged payload after manifest creation");
        let integrity_error = commit_transaction(&checksum_transaction, &checksum_token)
            .expect_err("manifest integrity mismatch must fail");
        assert!(
            integrity_error.contains("size does not match")
                || integrity_error.contains("checksum does not match")
        );
        assert!(!target.exists());
        rollback_transaction(checksum_transaction).expect("clean checksum staging");

        fs::remove_dir_all(parent).expect("remove test directory");
    }
}
