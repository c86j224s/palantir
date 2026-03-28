#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .manage(commands::stream_cmd::SessionManager::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_pods,
            commands::get_namespaces,
            commands::get_deployments,
            commands::get_services,
            commands::get_resources_generic,
            commands::get_resource_yaml,
            commands::apply_resource_yaml,
            commands::delete_resource_generic,
            commands::scale_resource,
            commands::restart_resource,
            commands::start_event_stream,
            commands::start_exec,
            commands::start_logs,
            commands::stop_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
