// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 1. 定义一个不受沙盒限制的 Rust 原生写入命令
#[tauri::command]
fn save_backup(path: String, data: String) -> Result<(), String> {
    // 使用 Rust 的标准库直接写入文件，通杀所有盘符和挂载路径
    std::fs::write(path, data).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_backup]) 
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
