#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            // 윈도우에서 개발자 도구를 쓰기 위해 window 객체 확보
            let window = app.get_window("main").unwrap();
            // 릴리스 빌드에서도 F12로 열 수 있게 설정되어 있으나, 확실하게 하기 위해 초기화 시 오픈 시도 가능
            // (사용자가 원할 때 F12나 우클릭-검사로 열 수 있습니다.)
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
            commands::start_event_stream,
            commands::start_exec,
            commands::start_logs,
            commands::stop_session
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
