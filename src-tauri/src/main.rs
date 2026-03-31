#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let _window = app.get_window("main").unwrap();
            Ok(())
        })
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
            commands::inject_debug_container,
            commands::get_pod_detail,
            commands::get_connection_info,
            commands::terminate_debug_container,
            commands::get_static_logs,
            commands::get_contexts,
            commands::switch_context,
            commands::start_event_stream,
            commands::start_exec,
            commands::write_to_session,
            commands::start_logs,
            commands::stop_session,
            commands::start_port_forward,
            commands::stop_port_forward,
            commands::list_port_forwards,
            commands::get_helm_releases,
            commands::get_helm_manifest,
            commands::preview_helm_template,
            commands::discover_crds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
