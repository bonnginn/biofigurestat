use std::path::Path;
use std::sync::Mutex;

#[derive(Default)]
pub struct PendingProjectOpen(Mutex<Vec<String>>);

impl PendingProjectOpen {
    pub fn from_command_line() -> Self {
        let targets = std::env::args()
            .skip(1)
            .filter(|argument| is_project_target(argument))
            .collect();
        Self(Mutex::new(targets))
    }

    #[cfg(target_os = "macos")]
    pub fn push(&self, target: String) {
        let mut targets = self.0.lock().expect("pending project lock poisoned");
        if !targets.contains(&target) {
            targets.push(target);
        }
    }

    fn take_all(&self) -> Vec<String> {
        std::mem::take(&mut *self.0.lock().expect("pending project lock poisoned"))
    }
}

fn is_project_target(target: &str) -> bool {
    Path::new(target)
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("lsa"))
}

#[tauri::command]
pub fn take_pending_project_open(state: tauri::State<'_, PendingProjectOpen>) -> Vec<String> {
    state.take_all()
}

#[cfg(test)]
mod tests {
    use super::is_project_target;

    #[test]
    fn accepts_only_life_science_project_targets() {
        assert!(is_project_target("/tmp/experiment.lsa"));
        assert!(is_project_target("C:\\data\\experiment.LSA"));
        assert!(!is_project_target("/tmp/experiment.csv"));
    }
}
