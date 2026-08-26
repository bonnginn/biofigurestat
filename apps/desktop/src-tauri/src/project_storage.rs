use rusqlite::{params, Connection, OpenFlags};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const MANIFEST_PATH: &str = "manifest.json";
// Keep this aligned with the canonical package manifest assembled by
// packages/project. The SQLite database is a package-root entry.
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
    connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("Could not read the staged project database version: {error}"))
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
    let database_path = staging.join(DATABASE_PATH);
    if !database_path.is_file() {
        return Err("Project staging package has no project database".to_string());
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
    let database_version = sqlite_user_version(&database_path)?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("Could not start the project container transaction: {error}"))?;
    transaction
        .execute(
            "INSERT INTO container_metadata(key, value) VALUES (?1, ?2)",
            params!["format", CONTAINER_FORMAT],
        )
        .map_err(|error| format!("Could not record the project container format: {error}"))?;
    transaction
        .execute(
            "INSERT INTO container_metadata(key, value) VALUES (?1, ?2)",
            params![
                "project_database_user_version",
                database_version.to_string()
            ],
        )
        .map_err(|error| format!("Could not record the project database version: {error}"))?;
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

    fn stage_project_database(transaction: &super::ProjectWriteTransaction, version: i64) {
        let path = transaction.staging.join(super::DATABASE_PATH);
        fs::create_dir_all(path.parent().expect("database parent")).expect("create data folder");
        let database = Connection::open(path).expect("create project database");
        database
            .execute_batch(&format!("PRAGMA user_version = {version};"))
            .expect("set project database version");
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
        write_transaction_file(&transaction, "data/raw.csv", b"condition,value\nA,1\n")
            .expect("write payload");
        write_transaction_file(&transaction, "manifest.json", b"new").expect("write manifest");
        stage_project_database(&transaction, 1);
        commit_transaction(&transaction, &token).expect("commit transaction");

        assert!(target.is_file());
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            b"new"
        );
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "data/raw.csv".to_string()
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
        write_transaction_file(&transaction, "manifest.json", b"manifest")
            .expect("write manifest");

        let database_path = transaction.staging.join("project.sqlite");
        let database = Connection::open(&database_path).expect("create canonical database");
        database
            .execute_batch("PRAGMA user_version = 1;")
            .expect("set project database version");
        drop(database);
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
        write_transaction_file(&first, "manifest.json", b"first").expect("first manifest");
        stage_project_database(&first, 1);
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
            b"first"
        );
        rollback_transaction(invalid).expect("clean bad staging");

        let (second_token, second) = begin_transaction(target.clone()).expect("second transaction");
        write_transaction_file(&second, "manifest.json", b"second").expect("second manifest");
        stage_project_database(&second, 1);
        commit_transaction(&second, &second_token).expect("second commit");

        assert!(target.is_file());
        assert_eq!(
            read_project_file(
                target.to_string_lossy().into_owned(),
                "manifest.json".to_string()
            )
            .unwrap(),
            b"second"
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
        write_transaction_file(&transaction, "manifest.json", b"new").expect("write manifest");
        let staged_database = transaction.staging.join(super::DATABASE_PATH);
        fs::create_dir_all(staged_database.parent().expect("database parent"))
            .expect("create staged data");
        let new_database = Connection::open(&staged_database).expect("new db");
        new_database
            .execute_batch("PRAGMA user_version = 2;")
            .expect("new version");
        drop(new_database);

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
            b"new"
        );
        fs::remove_dir_all(parent).expect("remove test directory");
    }
}
