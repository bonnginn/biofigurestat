// The Windows subsystem attribute must be on the binary crate root. Putting it only on lib.rs
// leaves the packaged executable as a console application, which opens a command prompt and ties
// the GUI lifetime to that console window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    lifescience_analysis_app_lib::run();
}
